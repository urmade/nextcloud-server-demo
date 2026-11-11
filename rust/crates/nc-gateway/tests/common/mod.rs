// SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

#![allow(dead_code)]

use std::convert::Infallible;
use std::future::Future;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use bytes::Bytes;
use clap::Parser;
use http::{HeaderMap, Method, Request, Response, StatusCode};
use http_body_util::combinators::UnsyncBoxBody;
use http_body_util::{BodyExt, Full};
use hyper::body::Incoming;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper_util::client::legacy::Client;
use hyper_util::client::legacy::connect::HttpConnector;
use hyper_util::rt::{TokioExecutor, TokioIo};
use nc_gateway::dispatch::CanaryRoller;
use nc_gateway::server::Gateway;
use nc_gateway::settings::Settings;
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;

pub type Body = UnsyncBoxBody<Bytes, Infallible>;

pub fn full(data: impl Into<Bytes>) -> Body {
    Full::new(data.into()).boxed_unsync()
}

pub fn empty() -> Body {
    full(Bytes::new())
}

pub struct TestGateway {
    pub addr: SocketAddr,
    pub admin: SocketAddr,
    stop: Option<oneshot::Sender<()>>,
    task: Option<JoinHandle<()>>,
}

impl TestGateway {
    pub async fn stop(mut self) {
        let _ = self.stop.take().unwrap().send(());
        tokio::time::timeout(Duration::from_secs(10), self.task.take().unwrap())
            .await
            .expect("gateway stops within the grace period")
            .unwrap();
    }
}

impl Drop for TestGateway {
    fn drop(&mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
    }
}

pub fn settings(upstream: SocketAddr) -> Settings {
    Settings::try_parse_from([
        "nc-gateway",
        "--upstream",
        &format!("http://{upstream}"),
        "--listen",
        "127.0.0.1:0",
        "--admin-listen",
        "127.0.0.1:0",
        "--reload-interval-ms",
        "20",
    ])
    .unwrap()
}

pub async fn start_gateway(upstream: SocketAddr) -> TestGateway {
    start_with(settings(upstream), None).await
}

pub async fn start_with(settings: Settings, roller: Option<Arc<dyn CanaryRoller>>) -> TestGateway {
    let gateway = match roller {
        Some(roller) => Gateway::bind_with_roller(&settings, roller).await,
        None => Gateway::bind(&settings).await,
    }
    .expect("gateway binds");
    let addr = gateway.local_addr();
    let admin = gateway.admin_addr();
    let (stop, stopped) = oneshot::channel::<()>();
    let task = tokio::spawn(gateway.run(async move {
        let _ = stopped.await;
    }));
    TestGateway {
        addr,
        admin,
        stop: Some(stop),
        task: Some(task),
    }
}

pub fn client() -> Client<HttpConnector, Body> {
    Client::builder(TokioExecutor::new())
        .http1_preserve_header_case(true)
        .build(HttpConnector::new())
}

pub struct Reply {
    pub status: StatusCode,
    pub headers: HeaderMap,
    pub body: Bytes,
}

pub async fn send(
    addr: SocketAddr,
    method: &str,
    path: &str,
    headers: &[(&str, &str)],
    body: Body,
) -> Reply {
    let mut builder = Request::builder()
        .method(Method::from_bytes(method.as_bytes()).unwrap())
        .uri(format!("http://{addr}{path}"));
    for (name, value) in headers {
        builder = builder.header(*name, *value);
    }
    let response = tokio::time::timeout(
        Duration::from_secs(30),
        client().request(builder.body(body).unwrap()),
    )
    .await
    .expect("request completes")
    .expect("request succeeds");
    let (parts, body) = response.into_parts();
    Reply {
        status: parts.status,
        headers: parts.headers,
        body: body.collect().await.expect("body streams").to_bytes(),
    }
}

pub async fn get(addr: SocketAddr, path: &str) -> Reply {
    send(addr, "GET", path, &[], empty()).await
}

pub async fn admin_text(admin: SocketAddr, path: &str) -> String {
    let reply = get(admin, path).await;
    assert_eq!(reply.status, StatusCode::OK);
    String::from_utf8(reply.body.to_vec()).unwrap()
}

pub async fn eventually<F, Fut>(what: &str, mut check: F)
where
    F: FnMut() -> Fut,
    Fut: Future<Output = bool>,
{
    for _ in 0..200 {
        if check().await {
            return;
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    panic!("timed out waiting for: {what}");
}

/// Starts a hyper HTTP/1 upstream on a random loopback port.
pub async fn spawn_upstream<F, Fut>(handler: F) -> SocketAddr
where
    F: Fn(Request<Incoming>) -> Fut + Send + Sync + 'static,
    Fut: Future<Output = Response<Body>> + Send + 'static,
{
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let handler = Arc::new(handler);
    tokio::spawn(async move {
        loop {
            let Ok((stream, _)) = listener.accept().await else {
                return;
            };
            let handler = handler.clone();
            tokio::spawn(async move {
                let service = service_fn(move |request| {
                    let handler = handler.clone();
                    async move { Ok::<_, Infallible>(handler(request).await) }
                });
                let _ = http1::Builder::new()
                    .preserve_header_case(true)
                    .serve_connection(TokioIo::new(stream), service)
                    .await;
            });
        }
    });
    addr
}

/// An address nothing listens on.
pub async fn dead_address() -> SocketAddr {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    listener.local_addr().unwrap()
}
