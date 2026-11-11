// SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

//! The streaming pass-through proxy to the PHP upstream.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};

use bytes::Bytes;
use http::header::{CONTENT_TYPE, HOST, HeaderValue};
use http::uri::{Authority, PathAndQuery, Scheme};
use http::{Request, Response, StatusCode, Uri, Version};
use http_body_util::combinators::UnsyncBoxBody;
use http_body_util::{BodyExt, Full};
use hyper::body::Incoming;
use hyper_util::client::legacy::Client;
use hyper_util::client::legacy::connect::HttpConnector;
use hyper_util::rt::TokioExecutor;

use crate::dispatch::{CanaryRoller, Decision, HandlerRegistry, decide};
use crate::headers::{
    TrustedProxies, X_REQUEST_ID, resolve_request_id, set_forwarded_headers, strip_hop_by_hop,
};
use crate::metrics::{Metrics, UpstreamError};
use crate::state::RouteState;

pub type ProxyBody = UnsyncBoxBody<Bytes, hyper::Error>;

pub struct ProxyConfig {
    pub upstream: Authority,
    pub trusted_proxies: TrustedProxies,
    pub connect_timeout: Duration,
    pub response_timeout: Option<Duration>,
}

pub struct Proxy {
    client: Client<HttpConnector, Incoming>,
    upstream: Authority,
    trusted_proxies: TrustedProxies,
    response_timeout: Option<Duration>,
    state: Arc<RouteState>,
    metrics: Arc<Metrics>,
    handlers: HandlerRegistry,
    roller: Arc<dyn CanaryRoller>,
}

impl Proxy {
    pub fn new(
        config: ProxyConfig,
        state: Arc<RouteState>,
        metrics: Arc<Metrics>,
        roller: Arc<dyn CanaryRoller>,
    ) -> Self {
        let mut connector = HttpConnector::new();
        connector.set_connect_timeout(Some(config.connect_timeout));
        connector.set_nodelay(true);
        let client = Client::builder(TokioExecutor::new())
            .http1_preserve_header_case(true)
            .build(connector);
        Proxy {
            client,
            upstream: config.upstream,
            trusted_proxies: config.trusted_proxies,
            response_timeout: config.response_timeout,
            state,
            metrics,
            handlers: HandlerRegistry::default(),
            roller,
        }
    }

    /// Forwards one request to PHP and returns its response unchanged, apart
    /// from hop-by-hop headers. PHP receives `X-Forwarded-*` and the gateway's
    /// `X-Request-Id` (which it logs as `clientReqId`); the response carries
    /// PHP's own `X-Request-Id` when it sets one. Request and response bodies
    /// are streamed, never buffered.
    pub async fn handle(
        &self,
        request: Request<Incoming>,
        peer: SocketAddr,
    ) -> Response<ProxyBody> {
        let started = Instant::now();
        let _in_flight = self.metrics.request_started();
        let (mut parts, body) = request.into_parts();
        let request_id = resolve_request_id(&parts.headers);

        let decision = {
            let table = self.state.table();
            decide(
                &table,
                self.state.kill_switch_active(),
                &self.handlers,
                self.roller.as_ref(),
                &parts.method,
                parts.uri.path(),
            )
        };

        let Some(uri) = self.upstream_uri(&parts.uri) else {
            return self.finish(
                &decision,
                started,
                gateway_error(StatusCode::BAD_REQUEST, &request_id),
            );
        };
        parts.uri = uri;
        parts.version = Version::HTTP_11;
        strip_hop_by_hop(&mut parts.headers);
        if let Ok(host) = HeaderValue::from_str(self.upstream.as_str()) {
            parts.headers.entry(HOST).or_insert(host);
        }
        set_forwarded_headers(&mut parts.headers, peer.ip(), &self.trusted_proxies);
        parts.headers.insert(X_REQUEST_ID, request_id.clone());

        let upstream_request = Request::from_parts(parts, body);
        let send = self.client.request(upstream_request);
        let outcome: Result<_, ForwardError> = match self.response_timeout {
            Some(limit) => match tokio::time::timeout(limit, send).await {
                Ok(result) => result.map_err(ForwardError::from),
                Err(_) => Err(ForwardError::from(TimedOut)),
            },
            None => send.await.map_err(ForwardError::from),
        };

        let response = match outcome {
            Ok(upstream_response) => {
                let (mut parts, body) = upstream_response.into_parts();
                strip_hop_by_hop(&mut parts.headers);
                parts.headers.entry(X_REQUEST_ID).or_insert(request_id);
                Response::from_parts(parts, body.boxed_unsync())
            }
            Err(error) => {
                let kind = classify(&error);
                self.metrics.record_upstream_error(kind);
                tracing::warn!(error = %error, kind = ?kind, route = %decision.route_id, "upstream request failed");
                let status = if kind == UpstreamError::Timeout {
                    StatusCode::GATEWAY_TIMEOUT
                } else {
                    StatusCode::BAD_GATEWAY
                };
                gateway_error(status, &request_id)
            }
        };
        self.finish(&decision, started, response)
    }

    fn finish(
        &self,
        decision: &Decision,
        started: Instant,
        response: Response<ProxyBody>,
    ) -> Response<ProxyBody> {
        self.metrics.record_response(
            decision,
            response.status().as_u16(),
            started.elapsed().as_secs_f64(),
        );
        response
    }

    /// The upstream URI with the client's path and query kept byte for byte.
    fn upstream_uri(&self, original: &Uri) -> Option<Uri> {
        let path_and_query = original
            .path_and_query()
            .cloned()
            .unwrap_or_else(|| PathAndQuery::from_static("/"));
        Uri::builder()
            .scheme(Scheme::HTTP)
            .authority(self.upstream.clone())
            .path_and_query(path_and_query)
            .build()
            .ok()
    }
}

#[derive(Debug, thiserror::Error)]
#[error("timed out waiting for the upstream response")]
struct TimedOut;

#[derive(Debug, thiserror::Error)]
enum ForwardError {
    #[error(transparent)]
    Upstream(#[from] hyper_util::client::legacy::Error),
    #[error(transparent)]
    TimedOut(#[from] TimedOut),
}

fn classify(error: &ForwardError) -> UpstreamError {
    match error {
        ForwardError::TimedOut(_) => UpstreamError::Timeout,
        ForwardError::Upstream(error) if error.is_connect() => UpstreamError::Connect,
        ForwardError::Upstream(_) => UpstreamError::Other,
    }
}

fn gateway_error(status: StatusCode, request_id: &HeaderValue) -> Response<ProxyBody> {
    let reason = status.canonical_reason().unwrap_or("Error");
    let body = Full::new(Bytes::from(format!("{reason}\n"))).map_err(|never| match never {});
    let mut response = Response::new(body.boxed_unsync());
    *response.status_mut() = status;
    response.headers_mut().insert(
        CONTENT_TYPE,
        HeaderValue::from_static("text/plain; charset=utf-8"),
    );
    response
        .headers_mut()
        .insert(X_REQUEST_ID, request_id.clone());
    response
}
