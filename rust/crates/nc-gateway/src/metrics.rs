// SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

//! Prometheus metrics: per-route mode and fallback reason, upstream errors,
//! and route table reloads.

use prometheus::{
    Encoder, HistogramOpts, HistogramVec, IntCounterVec, IntGauge, Opts, Registry, TextEncoder,
};

use crate::dispatch::Decision;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UpstreamError {
    Connect,
    Timeout,
    Other,
}

impl UpstreamError {
    fn label(self) -> &'static str {
        match self {
            UpstreamError::Connect => "connect",
            UpstreamError::Timeout => "timeout",
            UpstreamError::Other => "other",
        }
    }
}

pub struct Metrics {
    registry: Registry,
    requests: IntCounterVec,
    duration: HistogramVec,
    in_flight: IntGauge,
    upstream_errors: IntCounterVec,
    reloads: IntCounterVec,
    kill_switch: IntGauge,
    routes: IntGauge,
}

impl Metrics {
    pub fn new() -> Self {
        let registry = Registry::new();
        let requests = IntCounterVec::new(
            Opts::new(
                "nc_gateway_requests_total",
                "Requests by matched route, configured mode, fallback reason, and upstream status class.",
            ),
            &["route", "mode", "fallback_reason", "status_class"],
        )
        .expect("valid metric definition");
        let duration = HistogramVec::new(
            HistogramOpts::new(
                "nc_gateway_request_duration_seconds",
                "Time until the response headers are available, by route.",
            )
            .buckets(vec![0.005, 0.025, 0.1, 0.5, 1.0, 5.0, 30.0, 300.0]),
            &["route"],
        )
        .expect("valid metric definition");
        let in_flight = IntGauge::new(
            "nc_gateway_requests_in_flight",
            "Requests waiting for the response headers from PHP.",
        )
        .expect("valid metric definition");
        let upstream_errors = IntCounterVec::new(
            Opts::new(
                "nc_gateway_upstream_errors_total",
                "Requests the gateway answered itself because PHP was unreachable or too slow.",
            ),
            &["kind"],
        )
        .expect("valid metric definition");
        let reloads = IntCounterVec::new(
            Opts::new(
                "nc_gateway_route_table_reloads_total",
                "Route table reload attempts that found changed content.",
            ),
            &["result"],
        )
        .expect("valid metric definition");
        let kill_switch = IntGauge::new(
            "nc_gateway_kill_switch_active",
            "1 when every route is forced to PHP.",
        )
        .expect("valid metric definition");
        let routes = IntGauge::new("nc_gateway_routes", "Routes in the active table.")
            .expect("valid metric definition");

        for collector in [
            Box::new(requests.clone()) as Box<dyn prometheus::core::Collector>,
            Box::new(duration.clone()),
            Box::new(in_flight.clone()),
            Box::new(upstream_errors.clone()),
            Box::new(reloads.clone()),
            Box::new(kill_switch.clone()),
            Box::new(routes.clone()),
        ] {
            registry.register(collector).expect("unique metric names");
        }

        Metrics {
            registry,
            requests,
            duration,
            in_flight,
            upstream_errors,
            reloads,
            kill_switch,
            routes,
        }
    }

    pub fn request_started(&self) -> InFlightGuard {
        self.in_flight.inc();
        InFlightGuard(self.in_flight.clone())
    }

    pub fn record_response(&self, decision: &Decision, status: u16, seconds: f64) {
        let class = status_class(status);
        let fallback = decision.fallback.map_or("none", |reason| reason.label());
        self.requests
            .with_label_values(&[&decision.route_id, decision.mode.label(), fallback, class])
            .inc();
        self.duration
            .with_label_values(&[&decision.route_id])
            .observe(seconds);
    }

    pub fn record_upstream_error(&self, error: UpstreamError) {
        self.upstream_errors
            .with_label_values(&[error.label()])
            .inc();
    }

    pub fn record_reload(&self, accepted: bool) {
        self.reloads
            .with_label_values(&[if accepted { "ok" } else { "rejected" }])
            .inc();
    }

    pub fn render(&self, kill_switch_active: bool, route_count: usize) -> String {
        self.kill_switch.set(i64::from(kill_switch_active));
        self.routes
            .set(i64::try_from(route_count).unwrap_or(i64::MAX));
        let mut buffer = Vec::new();
        TextEncoder::new()
            .encode(&self.registry.gather(), &mut buffer)
            .expect("text encoding does not fail");
        String::from_utf8(buffer).expect("the text format is UTF-8")
    }
}

impl Default for Metrics {
    fn default() -> Self {
        Self::new()
    }
}

pub struct InFlightGuard(IntGauge);

impl Drop for InFlightGuard {
    fn drop(&mut self) {
        self.0.dec();
    }
}

fn status_class(status: u16) -> &'static str {
    match status {
        100..=199 => "1xx",
        200..=299 => "2xx",
        300..=399 => "3xx",
        400..=499 => "4xx",
        500..=599 => "5xx",
        _ => "other",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dispatch::FallbackReason;
    use crate::route::Mode;

    fn decision(route: &str, mode: Mode, fallback: Option<FallbackReason>) -> Decision {
        Decision {
            route_id: route.to_owned(),
            mode,
            fallback,
        }
    }

    #[test]
    fn status_classes() {
        assert_eq!(status_class(101), "1xx");
        assert_eq!(status_class(200), "2xx");
        assert_eq!(status_class(207), "2xx");
        assert_eq!(status_class(304), "3xx");
        assert_eq!(status_class(404), "4xx");
        assert_eq!(status_class(599), "5xx");
        assert_eq!(status_class(600), "other");
        assert_eq!(status_class(99), "other");
    }

    #[test]
    fn responses_are_counted_with_route_mode_reason_and_class() {
        let metrics = Metrics::new();
        let d = decision("status", Mode::Canary(10), Some(FallbackReason::NoHandler));
        metrics.record_response(&d, 200, 0.01);
        metrics.record_response(&d, 200, 0.02);
        metrics.record_response(&decision("unmatched", Mode::Php, None), 502, 0.0);

        let text = metrics.render(false, 3);
        assert!(text.contains(
            r#"nc_gateway_requests_total{fallback_reason="no_handler",mode="canary",route="status",status_class="2xx"} 2"#
        ), "{text}");
        assert!(text.contains(
            r#"nc_gateway_requests_total{fallback_reason="none",mode="php",route="unmatched",status_class="5xx"} 1"#
        ), "{text}");
        assert!(
            text.contains(r#"nc_gateway_request_duration_seconds_count{route="status"} 2"#),
            "{text}"
        );
    }

    #[test]
    fn the_in_flight_gauge_follows_the_guard() {
        let metrics = Metrics::new();
        let guard = metrics.request_started();
        assert!(
            metrics
                .render(false, 0)
                .contains("nc_gateway_requests_in_flight 1")
        );
        drop(guard);
        assert!(
            metrics
                .render(false, 0)
                .contains("nc_gateway_requests_in_flight 0")
        );
    }

    #[test]
    fn upstream_errors_and_reloads_are_labelled() {
        let metrics = Metrics::new();
        metrics.record_upstream_error(UpstreamError::Connect);
        metrics.record_upstream_error(UpstreamError::Timeout);
        metrics.record_upstream_error(UpstreamError::Other);
        metrics.record_reload(true);
        metrics.record_reload(false);
        let text = metrics.render(false, 0);
        for expected in [
            r#"nc_gateway_upstream_errors_total{kind="connect"} 1"#,
            r#"nc_gateway_upstream_errors_total{kind="timeout"} 1"#,
            r#"nc_gateway_upstream_errors_total{kind="other"} 1"#,
            r#"nc_gateway_route_table_reloads_total{result="ok"} 1"#,
            r#"nc_gateway_route_table_reloads_total{result="rejected"} 1"#,
        ] {
            assert!(text.contains(expected), "missing {expected} in {text}");
        }
    }

    #[test]
    fn render_reports_the_kill_switch_and_route_count() {
        let metrics = Metrics::new();
        let text = metrics.render(true, 7);
        assert!(text.contains("nc_gateway_kill_switch_active 1"));
        assert!(text.contains("nc_gateway_routes 7"));
        let text = metrics.render(false, 0);
        assert!(text.contains("nc_gateway_kill_switch_active 0"));
    }
}
