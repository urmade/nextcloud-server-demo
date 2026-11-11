// SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

//! The admin listener: health, metrics, and a read-only view of the route table.

use std::sync::Arc;

use axum::Router;
use axum::extract::State;
use axum::http::header::CONTENT_TYPE;
use axum::response::IntoResponse;
use axum::routing::get;
use serde_json::json;

use crate::metrics::Metrics;
use crate::state::RouteState;

#[derive(Clone)]
pub struct AdminState {
    pub routes: Arc<RouteState>,
    pub metrics: Arc<Metrics>,
}

pub fn router(state: AdminState) -> Router {
    Router::new()
        .route("/healthz", get(healthz))
        .route("/metrics", get(metrics))
        .route("/routes", get(routes))
        .with_state(state)
}

async fn healthz() -> &'static str {
    "ok\n"
}

async fn metrics(State(state): State<AdminState>) -> impl IntoResponse {
    let table = state.routes.table();
    let body = state
        .metrics
        .render(state.routes.kill_switch_active(), table.routes().len());
    (
        [(CONTENT_TYPE, "text/plain; version=0.0.4; charset=utf-8")],
        body,
    )
}

async fn routes(State(state): State<AdminState>) -> impl IntoResponse {
    let table = state.routes.table();
    let routes: Vec<_> = table
        .routes()
        .iter()
        .map(|route| {
            json!({
                "id": route.id,
                "methods": route.methods.as_ref().map(|m| m.iter().map(|m| m.as_str()).collect::<Vec<_>>()),
                "path": route.pattern.as_str(),
                "mode": route.mode,
            })
        })
        .collect();
    let body = json!({
        "kill_switch": state.routes.kill_switch_active(),
        "routes": routes,
    });
    ([(CONTENT_TYPE, "application/json")], body.to_string())
}
