// SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

//! Streaming in both directions, `Expect: 100-continue`, raw header bytes, and timeouts.

mod common;

use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use bytes::Bytes;
use common::{Body, empty, full, send, settings, spawn_upstream, start_gateway, start_with};
use http::{Method, Request, Response, StatusCode};
use http_body_util::BodyExt;
use http_body_util::channel::Channel;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{Mutex, oneshot};

const CHUNK: usize = 64 * 1024;

fn large_bytes() -> u64 {
    let mib: u64 = std::env::var("NC_GATEWAY_TEST_LARGE_MIB")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(64);
    mib * 1024 * 1024
}

/// A body of `total` bytes produced on the fly, so tests can stream more than fits in memory.
fn generated_body(total: u64) -> Body {
    let (mut sender, body) = Channel::<Bytes>::new(4);
    tokio::spawn(async move {
        let chunk = Bytes::from(vec![7u8; CHUNK]);
        let mut remaining = total;
        while remaining > 0 {
            let size = remaining.min(CHUNK as u64) as usize;
            if sender.send_data(chunk.slice(..size)).await.is_err() {
                return;
            }
            remaining -= size as u64;
        }
    });
    body.boxed_unsync()
}

async fn count_bytes(
    mut body: impl hyper::body::Body<Data = Bytes, Error: std::fmt::Debug> + Unpin,
) -> u64 {
    let mut total = 0;
    while let Some(frame) = body.frame().await {
        if let Ok(data) = frame.expect("body frame").into_data() {
            total += data.len() as u64;
        }
    }
    total
}

#[tokio::test]
async fn a_large_chunked_upload_is_streamed_to_php() {
    let total = large_bytes();
    let upstream = spawn_upstream(|request: Request<hyper::body::Incoming>| async move {
        let chunked = !request.headers().contains_key("content-length");
        let received = count_bytes(request.into_body()).await;
        Response::new(full(format!("{received} chunked={chunked}")))
    })
    .await;
    let gateway = start_gateway(upstream).await;

    let reply = send(
        gateway.addr,
        "PUT",
        "/remote.php/dav/files/admin/big.bin",
        &[],
        generated_body(total),
    )
    .await;
    assert_eq!(reply.status, StatusCode::OK);
    assert_eq!(reply.body, Bytes::from(format!("{total} chunked=true")));
    gateway.stop().await;
}

#[tokio::test]
async fn a_large_download_is_streamed_to_the_client() {
    let total = large_bytes();
    let upstream =
        spawn_upstream(move |_| async move { Response::new(generated_body(total)) }).await;
    let gateway = start_gateway(upstream).await;

    let response = common::client()
        .request(
            Request::builder()
                .uri(format!(
                    "http://{}/remote.php/dav/files/admin/big.bin",
                    gateway.addr
                ))
                .body(empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(count_bytes(response.into_body()).await, total);
    gateway.stop().await;
}

#[tokio::test]
async fn a_response_is_delivered_while_php_is_still_producing_it() {
    let (release_tx, release_rx) = oneshot::channel::<()>();
    let release_rx = Arc::new(Mutex::new(Some(release_rx)));
    let upstream = spawn_upstream(move |_| {
        let release_rx = release_rx.clone();
        async move {
            let (mut sender, body) = Channel::<Bytes>::new(1);
            tokio::spawn(async move {
                sender
                    .send_data(Bytes::from_static(b"first;"))
                    .await
                    .unwrap();
                let release = release_rx.lock().await.take().unwrap();
                let _ = release.await;
                sender
                    .send_data(Bytes::from_static(b"second"))
                    .await
                    .unwrap();
            });
            Response::new(body.boxed_unsync())
        }
    })
    .await;
    let gateway = start_gateway(upstream).await;

    let response = common::client()
        .request(
            Request::builder()
                .uri(format!("http://{}/", gateway.addr))
                .body(empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let mut body = response.into_body();
    let first = tokio::time::timeout(Duration::from_secs(5), body.frame())
        .await
        .expect("the first chunk arrives before PHP finishes")
        .unwrap()
        .unwrap()
        .into_data()
        .unwrap();
    assert_eq!(first, Bytes::from_static(b"first;"));

    release_tx.send(()).unwrap();
    let rest = body.collect().await.unwrap().to_bytes();
    assert_eq!(rest, Bytes::from_static(b"second"));
    gateway.stop().await;
}

#[tokio::test]
async fn an_upload_reaches_php_while_the_client_is_still_sending() {
    let (first_seen_tx, first_seen_rx) = oneshot::channel::<()>();
    let first_seen_tx = Arc::new(Mutex::new(Some(first_seen_tx)));
    let upstream = spawn_upstream(move |request: Request<hyper::body::Incoming>| {
        let first_seen_tx = first_seen_tx.clone();
        async move {
            let mut body = request.into_body();
            let mut total = 0;
            while let Some(frame) = body.frame().await {
                if let Ok(data) = frame.unwrap().into_data() {
                    total += data.len();
                    if let Some(signal) = first_seen_tx.lock().await.take() {
                        let _ = signal.send(());
                    }
                }
            }
            Response::new(full(total.to_string()))
        }
    })
    .await;
    let gateway = start_gateway(upstream).await;

    let (mut sender, body) = Channel::<Bytes>::new(1);
    let addr = gateway.addr;
    let request =
        tokio::spawn(async move { send(addr, "PUT", "/upload", &[], body.boxed_unsync()).await });

    sender
        .send_data(Bytes::from_static(b"part one;"))
        .await
        .unwrap();
    tokio::time::timeout(Duration::from_secs(5), first_seen_rx)
        .await
        .expect("PHP sees the first part before the upload ends")
        .unwrap();
    sender
        .send_data(Bytes::from_static(b"part two"))
        .await
        .unwrap();
    drop(sender);

    let reply = request.await.unwrap();
    assert_eq!(reply.body, Bytes::from("17"));
    gateway.stop().await;
}

async fn read_until(stream: &mut TcpStream, marker: &[u8]) -> Vec<u8> {
    let mut seen = Vec::new();
    let mut buf = [0u8; 1024];
    while !seen.windows(marker.len()).any(|w| w == marker) {
        let n = tokio::time::timeout(Duration::from_secs(5), stream.read(&mut buf))
            .await
            .expect("data arrives in time")
            .unwrap();
        assert!(
            n > 0,
            "connection closed before {:?}; got {:?}",
            String::from_utf8_lossy(marker),
            String::from_utf8_lossy(&seen)
        );
        seen.extend_from_slice(&buf[..n]);
    }
    seen
}

#[tokio::test]
async fn expect_continue_is_answered_before_the_body_is_sent() {
    let upstream = spawn_upstream(|request: Request<hyper::body::Incoming>| async move {
        let body = request.into_body().collect().await.unwrap().to_bytes();
        Response::new(full(body))
    })
    .await;
    let gateway = start_gateway(upstream).await;

    let mut stream = TcpStream::connect(gateway.addr).await.unwrap();
    stream
        .write_all(
            b"PUT /remote.php/dav/files/admin/a.txt HTTP/1.1\r\nHost: localhost\r\nExpect: 100-continue\r\nContent-Length: 5\r\nConnection: close\r\n\r\n",
        )
        .await
        .unwrap();
    let interim = read_until(&mut stream, b"\r\n\r\n").await;
    assert!(
        interim.starts_with(b"HTTP/1.1 100 Continue\r\n"),
        "{}",
        String::from_utf8_lossy(&interim)
    );

    stream.write_all(b"hello").await.unwrap();
    let mut rest = Vec::new();
    tokio::time::timeout(Duration::from_secs(5), stream.read_to_end(&mut rest))
        .await
        .unwrap()
        .unwrap();
    let rest = String::from_utf8_lossy(&rest);
    assert!(rest.starts_with("HTTP/1.1 200 OK"), "{rest}");
    assert!(rest.ends_with("hello"), "{rest}");
    gateway.stop().await;
}

async fn raw_upstream(response: &'static [u8]) -> (SocketAddr, oneshot::Receiver<Vec<u8>>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let (captured_tx, captured_rx) = oneshot::channel();
    tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let request = read_until(&mut stream, b"\r\n\r\n").await;
        stream.write_all(response).await.unwrap();
        let _ = captured_tx.send(request);
    });
    (addr, captured_rx)
}

#[tokio::test]
async fn header_name_case_and_value_bytes_survive_the_hop() {
    let (upstream, captured) = raw_upstream(
        b"HTTP/1.1 207 Multi-Status\r\nX-MiXeD-Reply: Value\r\nSet-Cookie: a=1\r\nSet-Cookie: b=2\r\nDAV: 1, 2, 3\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok",
    )
    .await;
    let gateway = start_gateway(upstream).await;

    let mut stream = TcpStream::connect(gateway.addr).await.unwrap();
    stream
        .write_all(b"PROPFIND /remote.php/dav/ HTTP/1.1\r\nHost: localhost\r\nX-MiXeD-Request: Value\r\nDepth: 1\r\nConnection: close\r\n\r\n")
        .await
        .unwrap();
    let mut response = Vec::new();
    stream.read_to_end(&mut response).await.unwrap();
    let response = String::from_utf8(response).unwrap();

    assert!(
        response.starts_with("HTTP/1.1 207 Multi-Status\r\n"),
        "{response}"
    );
    for expected in [
        "X-MiXeD-Reply: Value",
        "Set-Cookie: a=1",
        "Set-Cookie: b=2",
        "DAV: 1, 2, 3",
    ] {
        assert!(
            response.contains(expected),
            "missing `{expected}` in {response}"
        );
    }
    assert!(response.ends_with("\r\n\r\nok"), "{response}");

    let request = String::from_utf8(captured.await.unwrap()).unwrap();
    assert!(
        request.starts_with("PROPFIND /remote.php/dav/ HTTP/1.1\r\n"),
        "{request}"
    );
    assert!(request.contains("X-MiXeD-Request: Value"), "{request}");
    assert!(request.contains("Depth: 1"), "{request}");
    gateway.stop().await;
}

#[tokio::test]
async fn unusual_request_targets_are_not_normalized() {
    let seen = Arc::new(Mutex::new(Vec::<String>::new()));
    let recorder = seen.clone();
    let upstream = spawn_upstream(move |request: Request<hyper::body::Incoming>| {
        let recorder = recorder.clone();
        async move {
            recorder.lock().await.push(request.uri().to_string());
            Response::new(empty())
        }
    })
    .await;
    let gateway = start_gateway(upstream).await;

    let targets = [
        "//double//slash/./dot/../up",
        "/remote.php/dav/files/admin/a%20b%2Fc.txt?x=1&y=%20z",
        "/status.php?",
        "/index.php/apps/files/?dir=/&fileid=12#ignored-by-clients",
    ];
    for target in &targets[..3] {
        send(gateway.addr, "GET", target, &[], empty()).await;
    }
    assert_eq!(*seen.lock().await, targets[..3]);
    gateway.stop().await;
}

#[tokio::test]
async fn a_slow_php_response_becomes_a_504() {
    let upstream = spawn_upstream(|_| async {
        tokio::time::sleep(Duration::from_secs(10)).await;
        Response::new(empty())
    })
    .await;
    let mut config = settings(upstream);
    config.response_timeout_secs = 1;
    let gateway = start_with(config, None).await;

    let reply = send(gateway.addr, "GET", "/slow", &[], empty()).await;
    assert_eq!(reply.status, StatusCode::GATEWAY_TIMEOUT);
    assert_eq!(reply.headers["x-request-id"].len(), 32);

    let metrics = common::admin_text(gateway.admin, "/metrics").await;
    assert!(
        metrics.contains(r#"nc_gateway_upstream_errors_total{kind="timeout"} 1"#),
        "{metrics}"
    );
    gateway.stop().await;
}

#[tokio::test]
async fn a_zero_response_timeout_waits_for_php() {
    let upstream = spawn_upstream(|_| async {
        tokio::time::sleep(Duration::from_millis(1500)).await;
        Response::new(full("late"))
    })
    .await;
    let mut config = settings(upstream);
    config.response_timeout_secs = 0;
    let gateway = start_with(config, None).await;

    let reply = send(gateway.addr, "GET", "/slow", &[], empty()).await;
    assert_eq!(reply.status, StatusCode::OK);
    assert_eq!(reply.body, Bytes::from_static(b"late"));
    gateway.stop().await;
}

#[tokio::test]
async fn in_flight_requests_finish_during_shutdown() {
    let started = Arc::new(AtomicU64::new(0));
    let counter = started.clone();
    let upstream = spawn_upstream(move |_| {
        let counter = counter.clone();
        async move {
            counter.fetch_add(1, Ordering::SeqCst);
            tokio::time::sleep(Duration::from_millis(400)).await;
            Response::new(full("done"))
        }
    })
    .await;
    let gateway = start_gateway(upstream).await;

    let addr = gateway.addr;
    let request = tokio::spawn(async move { send(addr, "GET", "/slow", &[], empty()).await });
    common::eventually("PHP receives the request", || async {
        started.load(Ordering::SeqCst) == 1
    })
    .await;
    gateway.stop().await;

    let reply = request.await.unwrap();
    assert_eq!(reply.status, StatusCode::OK);
    assert_eq!(reply.body, Bytes::from_static(b"done"));
}

#[tokio::test]
async fn keep_alive_connections_serve_several_requests() {
    let upstream = spawn_upstream(|request: Request<hyper::body::Incoming>| async move {
        Response::new(full(request.uri().path().to_owned()))
    })
    .await;
    let gateway = start_gateway(upstream).await;

    let mut stream = TcpStream::connect(gateway.addr).await.unwrap();
    for route in ["/one", "/two", "/three"] {
        let request = format!(
            "{} {route} HTTP/1.1\r\nHost: localhost\r\n\r\n",
            Method::GET
        );
        stream.write_all(request.as_bytes()).await.unwrap();
        let response = read_until(&mut stream, route.as_bytes()).await;
        assert!(String::from_utf8_lossy(&response).starts_with("HTTP/1.1 200 OK"));
    }
    gateway.stop().await;
}

#[tokio::test]
async fn an_http_10_request_without_a_host_header_still_reaches_php() {
    let upstream = spawn_upstream(|request: Request<hyper::body::Incoming>| async move {
        let host = request
            .headers()
            .get("host")
            .map(|h| h.to_str().unwrap().to_owned());
        Response::new(full(host.unwrap_or_default()))
    })
    .await;
    let gateway = start_gateway(upstream).await;

    let mut stream = TcpStream::connect(gateway.addr).await.unwrap();
    stream
        .write_all(b"GET /status.php HTTP/1.0\r\n\r\n")
        .await
        .unwrap();
    let mut response = Vec::new();
    stream.read_to_end(&mut response).await.unwrap();
    let response = String::from_utf8(response).unwrap();
    assert!(response.starts_with("HTTP/1.0 200 OK"), "{response}");
    assert!(response.ends_with(&upstream.to_string()), "{response}");
    gateway.stop().await;
}
