// SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

//! Status, header, and body transparency, checked against a wiremock upstream.

mod common;

use bytes::Bytes;
use common::{full, get, send, settings, start_gateway, start_with};
use http::StatusCode;
use wiremock::matchers::{any, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

const METHODS: [&str; 17] = [
    "GET",
    "HEAD",
    "POST",
    "PUT",
    "DELETE",
    "OPTIONS",
    "PATCH",
    "PROPFIND",
    "PROPPATCH",
    "MKCOL",
    "COPY",
    "MOVE",
    "REPORT",
    "SEARCH",
    "LOCK",
    "UNLOCK",
    "MKCALENDAR",
];

async fn upstream_with(template: ResponseTemplate) -> MockServer {
    let server = MockServer::start().await;
    Mock::given(any())
        .respond_with(template)
        .mount(&server)
        .await;
    server
}

#[tokio::test]
async fn every_http_and_webdav_method_reaches_php_unchanged() {
    let upstream = MockServer::start().await;
    for name in METHODS {
        Mock::given(method(name))
            .and(path("/remote.php/dav/files/admin/doc.txt"))
            .respond_with(ResponseTemplate::new(204).insert_header("x-seen-method", name))
            .mount(&upstream)
            .await;
    }
    let gateway = start_gateway(*upstream.address()).await;

    for name in METHODS {
        let reply = send(
            gateway.addr,
            name,
            "/remote.php/dav/files/admin/doc.txt",
            &[],
            full(""),
        )
        .await;
        assert_eq!(reply.status, StatusCode::NO_CONTENT, "{name}");
        assert_eq!(reply.headers["x-seen-method"], name, "{name}");
    }
    gateway.stop().await;
}

#[tokio::test]
async fn status_codes_and_bodies_pass_through() {
    let upstream = MockServer::start().await;
    for (route, status, body) in [
        ("/ok", 200, "fine"),
        ("/created", 201, "made"),
        ("/multistatus", 207, "<d:multistatus/>"),
        ("/redirect", 302, ""),
        ("/missing", 404, "<d:error/>"),
        ("/locked", 423, "locked"),
        ("/broken", 500, "oops"),
        ("/unavailable", 503, "maintenance"),
    ] {
        Mock::given(path(route))
            .respond_with(ResponseTemplate::new(status).set_body_string(body))
            .mount(&upstream)
            .await;
    }
    let gateway = start_gateway(*upstream.address()).await;

    for (route, status, body) in [
        ("/ok", 200, "fine"),
        ("/created", 201, "made"),
        ("/multistatus", 207, "<d:multistatus/>"),
        ("/redirect", 302, ""),
        ("/missing", 404, "<d:error/>"),
        ("/locked", 423, "locked"),
        ("/broken", 500, "oops"),
        ("/unavailable", 503, "maintenance"),
    ] {
        let reply = get(gateway.addr, route).await;
        assert_eq!(reply.status.as_u16(), status, "{route}");
        assert_eq!(reply.body, Bytes::from(body), "{route}");
    }
    gateway.stop().await;
}

#[tokio::test]
async fn multiple_set_cookie_headers_survive_in_order() {
    let upstream = upstream_with(
        ResponseTemplate::new(200)
            .append_header(
                "set-cookie",
                "oc_sessionPassphrase=abc; path=/; HttpOnly; SameSite=Lax",
            )
            .append_header(
                "set-cookie",
                "nc_sameSiteCookielax=true; path=/; SameSite=Lax",
            )
            .append_header(
                "set-cookie",
                "nc_sameSiteCookiestrict=true; path=/; SameSite=Strict",
            ),
    )
    .await;
    let gateway = start_gateway(*upstream.address()).await;

    let reply = get(gateway.addr, "/index.php/login").await;
    let cookies: Vec<_> = reply
        .headers
        .get_all("set-cookie")
        .iter()
        .map(|v| v.to_str().unwrap())
        .collect();
    assert_eq!(
        cookies,
        [
            "oc_sessionPassphrase=abc; path=/; HttpOnly; SameSite=Lax",
            "nc_sameSiteCookielax=true; path=/; SameSite=Lax",
            "nc_sameSiteCookiestrict=true; path=/; SameSite=Strict",
        ]
    );
    gateway.stop().await;
}

#[tokio::test]
async fn request_headers_cookies_and_bodies_reach_php() {
    let upstream = upstream_with(ResponseTemplate::new(200)).await;
    let gateway = start_gateway(*upstream.address()).await;

    let reply = send(
        gateway.addr,
        "POST",
        "/ocs/v2.php/apps/files_sharing/api/v1/shares",
        &[
            ("authorization", "Basic YWRtaW46YWRtaW4="),
            ("cookie", "a=1; b=2"),
            ("ocs-apirequest", "true"),
            ("content-type", "application/json"),
            ("depth", "infinity"),
            ("if-none-match", "\"abc\""),
        ],
        full(r#"{"path":"/a"}"#),
    )
    .await;
    assert_eq!(reply.status, StatusCode::OK);

    let received = &upstream.received_requests().await.unwrap()[0];
    assert_eq!(received.body, br#"{"path":"/a"}"#);
    for (name, value) in [
        ("authorization", "Basic YWRtaW46YWRtaW4="),
        ("cookie", "a=1; b=2"),
        ("ocs-apirequest", "true"),
        ("content-type", "application/json"),
        ("depth", "infinity"),
        ("if-none-match", "\"abc\""),
    ] {
        assert_eq!(
            received.headers.get(name).map(|v| v.to_str().unwrap()),
            Some(value),
            "{name}"
        );
    }
    gateway.stop().await;
}

#[tokio::test]
async fn path_and_query_are_forwarded_byte_for_byte() {
    let upstream = upstream_with(ResponseTemplate::new(200)).await;
    let gateway = start_gateway(*upstream.address()).await;

    let targets = [
        "/remote.php/dav/files/admin/a%20b%2Fc.txt?x=1&y=%20z",
        "/index.php/apps/files/?dir=/&fileid=12",
        "//double//slash/./dot/../up",
        "/status.php?",
        "/ocs/v1.php/cloud/users?search=%C3%A4&limit=5",
    ];
    for target in targets {
        send(gateway.addr, "GET", target, &[], full("")).await;
    }

    let seen: Vec<String> = upstream
        .received_requests()
        .await
        .unwrap()
        .iter()
        .map(|r| {
            let url = &r.url;
            match url.query() {
                Some(query) => format!("{}?{query}", url.path()),
                None => url.path().to_owned(),
            }
        })
        .collect();
    assert_eq!(seen[0], targets[0]);
    assert_eq!(seen[1], targets[1]);
    assert_eq!(seen[4], targets[4]);
    gateway.stop().await;
}

#[tokio::test]
async fn range_requests_get_partial_content_back() {
    let upstream = MockServer::start().await;
    Mock::given(path("/remote.php/dav/files/admin/big.bin"))
        .respond_with(
            ResponseTemplate::new(206)
                .insert_header("content-range", "bytes 10-14/100")
                .insert_header("accept-ranges", "bytes")
                .set_body_bytes(b"01234".to_vec()),
        )
        .mount(&upstream)
        .await;
    let gateway = start_gateway(*upstream.address()).await;

    let reply = send(
        gateway.addr,
        "GET",
        "/remote.php/dav/files/admin/big.bin",
        &[("range", "bytes=10-14")],
        full(""),
    )
    .await;
    assert_eq!(reply.status, StatusCode::PARTIAL_CONTENT);
    assert_eq!(reply.headers["content-range"], "bytes 10-14/100");
    assert_eq!(reply.body, Bytes::from_static(b"01234"));
    let received = &upstream.received_requests().await.unwrap()[0];
    assert_eq!(received.headers["range"], "bytes=10-14");
    gateway.stop().await;
}

#[tokio::test]
async fn head_responses_keep_content_length_without_a_body() {
    let upstream = MockServer::start().await;
    Mock::given(method("HEAD"))
        .respond_with(ResponseTemplate::new(200).insert_header("content-length", "1234"))
        .mount(&upstream)
        .await;
    let gateway = start_gateway(*upstream.address()).await;

    let reply = send(
        gateway.addr,
        "HEAD",
        "/remote.php/dav/files/admin/x",
        &[],
        full(""),
    )
    .await;
    assert_eq!(reply.status, StatusCode::OK);
    assert_eq!(reply.headers["content-length"], "1234");
    assert!(reply.body.is_empty());
    gateway.stop().await;
}

#[tokio::test]
async fn the_host_header_is_preserved_for_php() {
    let upstream = upstream_with(ResponseTemplate::new(200)).await;
    let gateway = start_gateway(*upstream.address()).await;

    send(
        gateway.addr,
        "GET",
        "/",
        &[("host", "cloud.example.com")],
        full(""),
    )
    .await;
    let received = &upstream.received_requests().await.unwrap()[0];
    assert_eq!(received.headers["host"], "cloud.example.com");
    assert_eq!(received.headers["x-forwarded-host"], "cloud.example.com");
    gateway.stop().await;
}

#[tokio::test]
async fn hop_by_hop_headers_are_not_forwarded() {
    let upstream = upstream_with(
        ResponseTemplate::new(200)
            .insert_header("keep-alive", "timeout=5")
            .insert_header("x-kept", "yes"),
    )
    .await;
    let gateway = start_gateway(*upstream.address()).await;

    let reply = send(
        gateway.addr,
        "GET",
        "/",
        &[
            ("connection", "keep-alive, x-hop"),
            ("x-hop", "1"),
            ("x-end-to-end", "2"),
        ],
        full(""),
    )
    .await;
    let received = &upstream.received_requests().await.unwrap()[0];
    assert!(received.headers.get("x-hop").is_none());
    assert_eq!(received.headers["x-end-to-end"], "2");
    assert!(reply.headers.get("keep-alive").is_none());
    assert_eq!(reply.headers["x-kept"], "yes");
    gateway.stop().await;
}

#[tokio::test]
async fn client_supplied_forwarded_headers_are_replaced_unless_the_peer_is_trusted() {
    let upstream = upstream_with(ResponseTemplate::new(200)).await;
    let spoofed = [
        ("x-forwarded-for", "6.6.6.6"),
        ("x-forwarded-proto", "https"),
        ("x-forwarded-host", "evil.example.com"),
        ("host", "cloud.example.com"),
    ];

    let untrusted = start_gateway(*upstream.address()).await;
    send(untrusted.addr, "GET", "/", &spoofed, full("")).await;
    untrusted.stop().await;

    let mut trusting = settings(*upstream.address());
    trusting.trusted_proxies = vec!["127.0.0.0/8".to_owned()];
    let trusted = start_with(trusting, None).await;
    send(trusted.addr, "GET", "/", &spoofed, full("")).await;
    trusted.stop().await;

    let received = upstream.received_requests().await.unwrap();
    let header =
        |index: usize, name: &str| received[index].headers[name].to_str().unwrap().to_owned();

    assert_eq!(header(0, "x-forwarded-for"), "127.0.0.1");
    assert_eq!(header(0, "x-forwarded-proto"), "http");
    assert_eq!(header(0, "x-forwarded-host"), "cloud.example.com");

    assert_eq!(header(1, "x-forwarded-for"), "6.6.6.6, 127.0.0.1");
    assert_eq!(header(1, "x-forwarded-proto"), "https");
    assert_eq!(header(1, "x-forwarded-host"), "evil.example.com");
}

#[tokio::test]
async fn request_ids_are_sent_to_php_and_php_keeps_its_own_in_the_response() {
    let upstream = upstream_with(ResponseTemplate::new(200)).await;
    let gateway = start_gateway(*upstream.address()).await;

    let generated = get(gateway.addr, "/").await;
    let kept = send(
        gateway.addr,
        "GET",
        "/",
        &[("x-request-id", "client-id-42")],
        full(""),
    )
    .await;
    let replaced = send(
        gateway.addr,
        "GET",
        "/",
        &[("x-request-id", "bad id;")],
        full(""),
    )
    .await;

    let received = upstream.received_requests().await.unwrap();
    let upstream_id = |index: usize| {
        received[index].headers["x-request-id"]
            .to_str()
            .unwrap()
            .to_owned()
    };

    assert_eq!(upstream_id(0).len(), 32);
    assert_eq!(upstream_id(1), "client-id-42");
    assert_ne!(upstream_id(2), "bad id;");
    assert_eq!(upstream_id(2).len(), 32);

    for (index, reply) in [generated, kept, replaced].iter().enumerate() {
        assert_eq!(
            reply.headers["x-request-id"].to_str().unwrap(),
            upstream_id(index),
            "no id from PHP, so the gateway's is used"
        );
    }
    gateway.stop().await;
}

#[tokio::test]
async fn a_request_id_set_by_php_is_not_overwritten() {
    let upstream =
        upstream_with(ResponseTemplate::new(200).insert_header("x-request-id", "from-php")).await;
    let gateway = start_gateway(*upstream.address()).await;

    let reply = send(
        gateway.addr,
        "GET",
        "/",
        &[("x-request-id", "client-id-42")],
        full(""),
    )
    .await;
    assert_eq!(reply.headers["x-request-id"], "from-php");
    assert_eq!(reply.headers.get_all("x-request-id").iter().count(), 1);
    gateway.stop().await;
}

#[tokio::test]
async fn php_being_down_yields_a_502_with_a_request_id() {
    let dead = common::dead_address().await;
    let gateway = start_gateway(dead).await;

    let reply = get(gateway.addr, "/status.php").await;
    assert_eq!(reply.status, StatusCode::BAD_GATEWAY);
    assert_eq!(reply.headers["x-request-id"].len(), 32);

    let metrics = common::admin_text(gateway.admin, "/metrics").await;
    assert!(
        metrics.contains(r#"nc_gateway_upstream_errors_total{kind="connect"} 1"#),
        "{metrics}"
    );
    gateway.stop().await;
}
