// SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

//! Route modes, the kill switch, hot reload, and the admin endpoints, end to end.

mod common;

use std::fs;
use std::sync::Arc;

use common::{admin_text, eventually, get, settings, spawn_upstream, start_with};
use http::{Response, StatusCode};
use nc_gateway::dispatch::CanaryRoller;
use serde_json::Value;
use tempfile::TempDir;

struct FixedRoller(u8);

impl CanaryRoller for FixedRoller {
    fn roll(&self) -> u8 {
        self.0
    }
}

async fn php_upstream() -> std::net::SocketAddr {
    spawn_upstream(|_| async { Response::new(common::full("from php")) }).await
}

fn table(mode: &str) -> String {
    format!("[[route]]\nid = \"status\"\npath = \"/status.php\"\nmode = \"{mode}\"\n")
}

#[tokio::test]
async fn every_mode_is_answered_by_php_and_the_reason_is_counted() {
    let upstream = php_upstream().await;
    let dir = TempDir::new().unwrap();
    let routes = dir.path().join("routes.toml");
    fs::write(
        &routes,
        r#"
        [[route]]
        id = "as-php"
        path = "/php"
        mode = "php"
        [[route]]
        id = "as-shadow"
        path = "/shadow"
        mode = "shadow"
        [[route]]
        id = "as-canary"
        path = "/canary"
        mode = "canary:100"
        [[route]]
        id = "as-rust"
        path = "/rust"
        mode = "rust"
        "#,
    )
    .unwrap();
    let mut config = settings(upstream);
    config.route_table = Some(routes);
    let gateway = start_with(config, Some(Arc::new(FixedRoller(0)))).await;

    for path in ["/php", "/shadow", "/canary", "/rust", "/anything-else"] {
        let reply = get(gateway.addr, path).await;
        assert_eq!(reply.status, StatusCode::OK, "{path}");
        assert_eq!(&reply.body[..], b"from php", "{path}");
    }

    let metrics = admin_text(gateway.admin, "/metrics").await;
    for expected in [
        r#"fallback_reason="none",mode="php",route="as-php",status_class="2xx"} 1"#,
        r#"fallback_reason="no_handler",mode="shadow",route="as-shadow",status_class="2xx"} 1"#,
        r#"fallback_reason="no_handler",mode="canary",route="as-canary",status_class="2xx"} 1"#,
        r#"fallback_reason="no_handler",mode="rust",route="as-rust",status_class="2xx"} 1"#,
        r#"fallback_reason="none",mode="php",route="unmatched",status_class="2xx"} 1"#,
    ] {
        assert!(
            metrics.contains(expected),
            "missing `{expected}` in\n{metrics}"
        );
    }
    gateway.stop().await;
}

#[tokio::test]
async fn canary_rolls_decide_between_the_reasons() {
    let upstream = php_upstream().await;
    let dir = TempDir::new().unwrap();
    let routes = dir.path().join("routes.toml");
    fs::write(&routes, table("canary:50")).unwrap();

    for (roll, reason) in [(10, "no_handler"), (80, "canary_not_selected")] {
        let mut config = settings(upstream);
        config.route_table = Some(routes.clone());
        let gateway = start_with(config, Some(Arc::new(FixedRoller(roll)))).await;
        assert_eq!(
            get(gateway.addr, "/status.php").await.status,
            StatusCode::OK
        );
        let metrics = admin_text(gateway.admin, "/metrics").await;
        assert!(
            metrics.contains(&format!(
                r#"fallback_reason="{reason}",mode="canary",route="status""#
            )),
            "roll {roll}: {metrics}"
        );
        gateway.stop().await;
    }
}

#[tokio::test]
async fn the_kill_switch_file_forces_php_and_clears_again() {
    let upstream = php_upstream().await;
    let dir = TempDir::new().unwrap();
    let routes = dir.path().join("routes.toml");
    let flag = dir.path().join("killswitch");
    fs::write(&routes, table("rust")).unwrap();
    let mut config = settings(upstream);
    config.route_table = Some(routes);
    config.kill_switch_file = Some(flag.clone());
    let gateway = start_with(config, None).await;
    let admin = gateway.admin;

    get(gateway.addr, "/status.php").await;
    assert!(
        admin_text(admin, "/metrics")
            .await
            .contains("nc_gateway_kill_switch_active 0")
    );

    fs::write(&flag, "occ upgrade").unwrap();
    eventually("the kill switch turns on", || async move {
        admin_text(admin, "/routes")
            .await
            .contains(r#""kill_switch":true"#)
    })
    .await;
    assert_eq!(
        get(gateway.addr, "/status.php").await.status,
        StatusCode::OK
    );
    let metrics = admin_text(admin, "/metrics").await;
    assert!(
        metrics.contains("nc_gateway_kill_switch_active 1"),
        "{metrics}"
    );
    assert!(
        metrics.contains(r#"fallback_reason="kill_switch",mode="rust",route="status""#),
        "{metrics}"
    );

    fs::remove_file(&flag).unwrap();
    eventually("the kill switch turns off", || async move {
        admin_text(admin, "/routes")
            .await
            .contains(r#""kill_switch":false"#)
    })
    .await;
    gateway.stop().await;
}

#[tokio::test]
async fn the_forced_kill_switch_flag_is_active_from_the_start() {
    let upstream = php_upstream().await;
    let dir = TempDir::new().unwrap();
    let routes = dir.path().join("routes.toml");
    fs::write(&routes, table("rust")).unwrap();
    let mut config = settings(upstream);
    config.route_table = Some(routes);
    config.kill_switch = true;
    let gateway = start_with(config, None).await;

    get(gateway.addr, "/status.php").await;
    let metrics = admin_text(gateway.admin, "/metrics").await;
    assert!(metrics.contains("nc_gateway_kill_switch_active 1"));
    assert!(metrics.contains(r#"fallback_reason="kill_switch""#));
    gateway.stop().await;
}

#[tokio::test]
async fn the_route_table_hot_reloads_without_dropping_requests() {
    let upstream = php_upstream().await;
    let dir = TempDir::new().unwrap();
    let routes = dir.path().join("routes.toml");
    fs::write(&routes, table("php")).unwrap();
    let mut config = settings(upstream);
    config.route_table = Some(routes.clone());
    let gateway = start_with(config, None).await;
    let (addr, admin) = (gateway.addr, gateway.admin);

    assert_eq!(get(addr, "/status.php").await.status, StatusCode::OK);

    fs::write(&routes, table("rust")).unwrap();
    eventually("the table switches to rust", || async move {
        admin_text(admin, "/routes")
            .await
            .contains(r#""mode":"rust""#)
    })
    .await;
    assert_eq!(get(addr, "/status.php").await.status, StatusCode::OK);

    let metrics = admin_text(admin, "/metrics").await;
    assert!(
        metrics.contains(r#"nc_gateway_route_table_reloads_total{result="ok"} 1"#),
        "{metrics}"
    );
    assert!(
        metrics.contains(r#"fallback_reason="no_handler",mode="rust",route="status""#),
        "{metrics}"
    );
    gateway.stop().await;
}

#[tokio::test]
async fn an_invalid_reload_keeps_the_previous_table_and_is_counted() {
    let upstream = php_upstream().await;
    let dir = TempDir::new().unwrap();
    let routes = dir.path().join("routes.toml");
    fs::write(&routes, table("shadow")).unwrap();
    let mut config = settings(upstream);
    config.route_table = Some(routes.clone());
    let gateway = start_with(config, None).await;
    let admin = gateway.admin;

    fs::write(
        &routes,
        "[[route]]\npath = \"/status.php\"\nmode = \"warp-speed\"\n",
    )
    .unwrap();
    eventually("the rejection is counted", || async move {
        admin_text(admin, "/metrics")
            .await
            .contains(r#"nc_gateway_route_table_reloads_total{result="rejected"} 1"#)
    })
    .await;

    let listing: Value = serde_json::from_str(&admin_text(admin, "/routes").await).unwrap();
    assert_eq!(listing["routes"][0]["mode"], "shadow");
    assert_eq!(
        get(gateway.addr, "/status.php").await.status,
        StatusCode::OK
    );
    gateway.stop().await;
}

#[tokio::test]
async fn the_table_flag_acts_as_a_kill_switch() {
    let upstream = php_upstream().await;
    let dir = TempDir::new().unwrap();
    let routes = dir.path().join("routes.toml");
    fs::write(
        &routes,
        format!("[gateway]\nkill_switch = true\n{}", table("rust")),
    )
    .unwrap();
    let mut config = settings(upstream);
    config.route_table = Some(routes);
    let gateway = start_with(config, None).await;

    get(gateway.addr, "/status.php").await;
    let metrics = admin_text(gateway.admin, "/metrics").await;
    assert!(
        metrics.contains(r#"fallback_reason="kill_switch",mode="rust",route="status""#),
        "{metrics}"
    );
    gateway.stop().await;
}

#[tokio::test]
async fn startup_fails_on_an_invalid_route_table_or_trusted_proxy_list() {
    let upstream = php_upstream().await;
    let dir = TempDir::new().unwrap();
    let routes = dir.path().join("routes.toml");
    fs::write(&routes, "[[route]]\npath = \"/a\"\nmode = \"nope\"\n").unwrap();

    let mut bad_table = settings(upstream);
    bad_table.route_table = Some(routes);
    let error = nc_gateway::server::Gateway::bind(&bad_table)
        .await
        .err()
        .expect("startup fails");
    assert!(error.to_string().contains("unknown mode"), "{error}");

    let mut bad_proxies = settings(upstream);
    bad_proxies.trusted_proxies = vec!["nope".to_owned()];
    let error = nc_gateway::server::Gateway::bind(&bad_proxies)
        .await
        .err()
        .expect("startup fails");
    assert!(error.to_string().contains("trusted proxy"), "{error}");
}

#[tokio::test]
async fn the_admin_listener_serves_health_metrics_and_routes() {
    let upstream = php_upstream().await;
    let dir = TempDir::new().unwrap();
    let routes = dir.path().join("routes.toml");
    fs::write(
        &routes,
        "[[route]]\nid = \"dav\"\npath = \"/remote.php/dav/*\"\nmethods = [\"propfind\", \"report\"]\nmode = \"canary:25\"\n",
    )
    .unwrap();
    let mut config = settings(upstream);
    config.route_table = Some(routes);
    let gateway = start_with(config, None).await;

    assert_eq!(admin_text(gateway.admin, "/healthz").await, "ok\n");
    assert!(
        admin_text(gateway.admin, "/metrics")
            .await
            .contains("nc_gateway_routes 1")
    );

    let listing: Value = serde_json::from_str(&admin_text(gateway.admin, "/routes").await).unwrap();
    assert_eq!(listing["kill_switch"], false);
    assert_eq!(
        listing["routes"][0],
        serde_json::json!({"id": "dav", "methods": ["PROPFIND", "REPORT"], "path": "/remote.php/dav/*", "mode": "canary:25"})
    );
    assert_eq!(
        get(gateway.admin, "/nope").await.status,
        StatusCode::NOT_FOUND
    );
    gateway.stop().await;
}

#[tokio::test]
async fn admin_paths_are_not_reachable_through_the_public_listener() {
    let upstream = spawn_upstream(|request| async move {
        Response::new(common::full(format!("php saw {}", request.uri().path())))
    })
    .await;
    let gateway = start_with(settings(upstream), None).await;

    let reply = get(gateway.addr, "/metrics").await;
    assert_eq!(&reply.body[..], b"php saw /metrics");
    gateway.stop().await;
}
