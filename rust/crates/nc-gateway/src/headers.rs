// SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

//! Header handling for the proxy hop: hop-by-hop stripping, `X-Forwarded-*`,
//! and `X-Request-Id`.

use std::net::IpAddr;

use http::header::{CONNECTION, HOST, HeaderMap, HeaderName, HeaderValue};
use ipnet::IpNet;

pub const X_REQUEST_ID: HeaderName = HeaderName::from_static("x-request-id");
const X_FORWARDED_FOR: HeaderName = HeaderName::from_static("x-forwarded-for");
const X_FORWARDED_PROTO: HeaderName = HeaderName::from_static("x-forwarded-proto");
const X_FORWARDED_HOST: HeaderName = HeaderName::from_static("x-forwarded-host");
const X_FORWARDED_PORT: HeaderName = HeaderName::from_static("x-forwarded-port");
const X_FORWARDED_SERVER: HeaderName = HeaderName::from_static("x-forwarded-server");
const FORWARDED: HeaderName = HeaderName::from_static("forwarded");

const HOP_BY_HOP: [HeaderName; 8] = [
    CONNECTION,
    HeaderName::from_static("keep-alive"),
    HeaderName::from_static("proxy-authenticate"),
    HeaderName::from_static("proxy-authorization"),
    HeaderName::from_static("proxy-connection"),
    HeaderName::from_static("te"),
    HeaderName::from_static("trailer"),
    HeaderName::from_static("transfer-encoding"),
];
const UPGRADE: HeaderName = HeaderName::from_static("upgrade");

const MAX_REQUEST_ID_LEN: usize = 128;

/// Removes the headers that describe a single connection (RFC 9110 section 7.6.1),
/// including every header the `Connection` header names. Message framing is
/// re-derived from the body by hyper on each side.
pub fn strip_hop_by_hop(headers: &mut HeaderMap) {
    let named_by_connection: Vec<HeaderName> = headers
        .get_all(CONNECTION)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(','))
        .filter_map(|token| HeaderName::from_bytes(token.trim().as_bytes()).ok())
        .collect();
    for name in named_by_connection {
        headers.remove(name);
    }
    for name in HOP_BY_HOP.iter().chain([&UPGRADE]) {
        headers.remove(name);
    }
}

/// The peers allowed to supply `X-Forwarded-*` values that the gateway keeps.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TrustedProxies {
    nets: Vec<IpNet>,
}

impl TrustedProxies {
    /// Accepts CIDR ranges (`10.0.0.0/8`) and single addresses (`::1`).
    pub fn parse<S: AsRef<str>>(entries: &[S]) -> Result<Self, String> {
        let nets = entries
            .iter()
            .map(|entry| {
                let entry = entry.as_ref().trim();
                entry
                    .parse::<IpNet>()
                    .or_else(|_| entry.parse::<IpAddr>().map(IpNet::from))
                    .map_err(|_| format!("`{entry}` is neither an IP address nor a CIDR range"))
            })
            .collect::<Result<Vec<_>, _>>()?;
        Ok(TrustedProxies { nets })
    }

    pub fn contains(&self, ip: IpAddr) -> bool {
        let ip = ip.to_canonical();
        self.nets.iter().any(|net| net.contains(&ip))
    }
}

/// Sets the `X-Forwarded-*` headers PHP uses for the client address, scheme,
/// and host.
///
/// A trusted peer's chain is extended and its proto and host are kept. For any
/// other peer, everything it sent in these headers is discarded: PHP trusts the
/// gateway, so passing a client's claims through would let it spoof its address.
pub fn set_forwarded_headers(headers: &mut HeaderMap, peer: IpAddr, trusted: &TrustedProxies) {
    let peer = peer.to_canonical();
    let from_trusted_peer = trusted.contains(peer);

    let previous_chain = if from_trusted_peer {
        headers
            .get_all(X_FORWARDED_FOR)
            .iter()
            .filter_map(|value| value.to_str().ok())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>()
            .join(", ")
    } else {
        String::new()
    };
    let kept_proto = from_trusted_peer
        .then(|| headers.get(X_FORWARDED_PROTO))
        .flatten()
        .filter(|value| matches!(value.as_bytes(), b"http" | b"https"))
        .cloned();
    let kept_host = from_trusted_peer
        .then(|| headers.get(X_FORWARDED_HOST))
        .flatten()
        .cloned();
    let kept_forwarded = from_trusted_peer
        .then(|| headers.get(FORWARDED))
        .flatten()
        .cloned();
    let host = headers.get(HOST).cloned();

    for name in [
        X_FORWARDED_FOR,
        X_FORWARDED_PROTO,
        X_FORWARDED_HOST,
        X_FORWARDED_PORT,
        X_FORWARDED_SERVER,
        FORWARDED,
    ] {
        headers.remove(name);
    }

    let chain = if previous_chain.is_empty() {
        peer.to_string()
    } else {
        format!("{previous_chain}, {peer}")
    };
    headers.insert(
        X_FORWARDED_FOR,
        HeaderValue::from_str(&chain).expect("an address list is a valid header value"),
    );
    headers.insert(
        X_FORWARDED_PROTO,
        kept_proto.unwrap_or_else(|| HeaderValue::from_static("http")),
    );
    if let Some(host) = kept_host.or(host) {
        headers.insert(X_FORWARDED_HOST, host);
    }
    if let Some(forwarded) = kept_forwarded {
        headers.insert(FORWARDED, forwarded);
    }
}

/// The request id to use: the client's when it is a plausible token, otherwise
/// a fresh one.
pub fn resolve_request_id(headers: &HeaderMap) -> HeaderValue {
    headers
        .get(X_REQUEST_ID)
        .filter(|value| is_valid_request_id(value.as_bytes()))
        .cloned()
        .unwrap_or_else(generate_request_id)
}

fn is_valid_request_id(value: &[u8]) -> bool {
    !value.is_empty()
        && value.len() <= MAX_REQUEST_ID_LEN
        && value
            .iter()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b':'))
}

fn generate_request_id() -> HeaderValue {
    let id = uuid::Uuid::new_v4().simple().to_string();
    HeaderValue::from_str(&id).expect("hex digits are a valid header value")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headers(pairs: &[(&str, &str)]) -> HeaderMap {
        let mut map = HeaderMap::new();
        for (name, value) in pairs {
            map.append(
                HeaderName::from_bytes(name.as_bytes()).unwrap(),
                HeaderValue::from_str(value).unwrap(),
            );
        }
        map
    }

    fn values(map: &HeaderMap, name: &str) -> Vec<String> {
        map.get_all(name)
            .iter()
            .map(|v| v.to_str().unwrap().to_owned())
            .collect()
    }

    fn proxies(entries: &[&str]) -> TrustedProxies {
        TrustedProxies::parse(entries).unwrap()
    }

    #[test]
    fn hop_by_hop_headers_are_removed() {
        let mut map = headers(&[
            ("connection", "keep-alive"),
            ("keep-alive", "timeout=5"),
            ("te", "trailers"),
            ("trailer", "etag"),
            ("transfer-encoding", "chunked"),
            ("upgrade", "websocket"),
            ("proxy-authorization", "Basic x"),
            ("authorization", "Basic y"),
            ("content-type", "text/plain"),
        ]);
        strip_hop_by_hop(&mut map);
        let mut left: Vec<_> = map.keys().map(|k| k.as_str().to_owned()).collect();
        left.sort();
        assert_eq!(left, ["authorization", "content-type"]);
    }

    #[test]
    fn headers_named_by_connection_are_removed_too() {
        let mut map = headers(&[
            ("connection", "close, X-Private"),
            ("connection", "x-other"),
            ("x-private", "1"),
            ("x-other", "2"),
            ("x-kept", "3"),
        ]);
        strip_hop_by_hop(&mut map);
        assert_eq!(map.len(), 1);
        assert!(map.contains_key("x-kept"));
    }

    #[test]
    fn malformed_connection_tokens_are_ignored() {
        let mut map = headers(&[
            ("connection", "close, , bad token, x-private"),
            ("x-private", "1"),
            ("x-kept", "1"),
        ]);
        strip_hop_by_hop(&mut map);
        assert!(map.contains_key("x-kept"));
        assert!(!map.contains_key("x-private"));
    }

    #[test]
    fn trusted_proxies_accept_cidrs_and_single_addresses() {
        let trusted = proxies(&["10.0.0.0/8", "192.168.1.5", "::1", "fd00::/8"]);
        assert!(trusted.contains("10.1.2.3".parse().unwrap()));
        assert!(trusted.contains("192.168.1.5".parse().unwrap()));
        assert!(!trusted.contains("192.168.1.6".parse().unwrap()));
        assert!(trusted.contains("::1".parse().unwrap()));
        assert!(trusted.contains("fd12::1".parse().unwrap()));
        assert!(!trusted.contains("8.8.8.8".parse().unwrap()));
    }

    #[test]
    fn trusted_proxies_match_ipv4_mapped_ipv6_peers() {
        let trusted = proxies(&["10.0.0.0/8"]);
        assert!(trusted.contains("::ffff:10.0.0.1".parse().unwrap()));
        assert!(!trusted.contains("::ffff:11.0.0.1".parse().unwrap()));
    }

    #[test]
    fn trusted_proxies_reject_garbage() {
        assert!(TrustedProxies::parse(&["not-an-ip"]).is_err());
        assert!(TrustedProxies::parse(&["10.0.0.0/33"]).is_err());
        assert!(TrustedProxies::parse::<&str>(&[]).unwrap().nets.is_empty());
    }

    #[test]
    fn an_empty_trust_list_trusts_nobody() {
        assert!(!TrustedProxies::default().contains("127.0.0.1".parse().unwrap()));
    }

    #[test]
    fn untrusted_peers_get_fresh_forwarded_headers() {
        let mut map = headers(&[
            ("host", "cloud.example.com"),
            ("x-forwarded-for", "1.2.3.4"),
            ("x-forwarded-proto", "https"),
            ("x-forwarded-host", "evil.example.com"),
            ("x-forwarded-port", "443"),
            ("x-forwarded-server", "evil"),
            ("forwarded", "for=1.2.3.4"),
        ]);
        set_forwarded_headers(
            &mut map,
            "203.0.113.9".parse().unwrap(),
            &TrustedProxies::default(),
        );
        assert_eq!(values(&map, "x-forwarded-for"), ["203.0.113.9"]);
        assert_eq!(values(&map, "x-forwarded-proto"), ["http"]);
        assert_eq!(values(&map, "x-forwarded-host"), ["cloud.example.com"]);
        assert!(!map.contains_key("x-forwarded-port"));
        assert!(!map.contains_key("x-forwarded-server"));
        assert!(!map.contains_key("forwarded"));
    }

    #[test]
    fn trusted_peers_extend_the_chain_and_keep_proto_and_host() {
        let mut map = headers(&[
            ("host", "gateway.internal"),
            ("x-forwarded-for", "1.2.3.4, 10.0.0.2"),
            ("x-forwarded-for", "10.0.0.3"),
            ("x-forwarded-proto", "https"),
            ("x-forwarded-host", "cloud.example.com"),
            ("forwarded", "for=1.2.3.4;proto=https"),
        ]);
        set_forwarded_headers(
            &mut map,
            "10.0.0.9".parse().unwrap(),
            &proxies(&["10.0.0.0/24"]),
        );
        assert_eq!(
            values(&map, "x-forwarded-for"),
            ["1.2.3.4, 10.0.0.2, 10.0.0.3, 10.0.0.9"]
        );
        assert_eq!(values(&map, "x-forwarded-proto"), ["https"]);
        assert_eq!(values(&map, "x-forwarded-host"), ["cloud.example.com"]);
        assert_eq!(values(&map, "forwarded"), ["for=1.2.3.4;proto=https"]);
    }

    #[test]
    fn trusted_peers_without_forwarded_headers_get_defaults() {
        let mut map = headers(&[("host", "cloud.example.com")]);
        set_forwarded_headers(
            &mut map,
            "10.0.0.9".parse().unwrap(),
            &proxies(&["10.0.0.9"]),
        );
        assert_eq!(values(&map, "x-forwarded-for"), ["10.0.0.9"]);
        assert_eq!(values(&map, "x-forwarded-proto"), ["http"]);
        assert_eq!(values(&map, "x-forwarded-host"), ["cloud.example.com"]);
    }

    #[test]
    fn an_invalid_forwarded_proto_is_replaced_even_from_trusted_peers() {
        let mut map = headers(&[("x-forwarded-proto", "gopher")]);
        set_forwarded_headers(
            &mut map,
            "10.0.0.9".parse().unwrap(),
            &proxies(&["10.0.0.9"]),
        );
        assert_eq!(values(&map, "x-forwarded-proto"), ["http"]);
    }

    #[test]
    fn ipv4_mapped_peers_are_recorded_as_plain_ipv4() {
        let mut map = HeaderMap::new();
        set_forwarded_headers(
            &mut map,
            "::ffff:192.0.2.1".parse().unwrap(),
            &TrustedProxies::default(),
        );
        assert_eq!(values(&map, "x-forwarded-for"), ["192.0.2.1"]);
        assert!(!map.contains_key("x-forwarded-host"));
    }

    #[test]
    fn valid_request_ids_are_kept() {
        for id in [
            "abc123",
            "550e8400-e29b-41d4-a716-446655440000",
            "a.b_c:d-e",
            &"x".repeat(128),
        ] {
            let map = headers(&[("x-request-id", id)]);
            assert_eq!(resolve_request_id(&map).to_str().unwrap(), id);
        }
    }

    #[test]
    fn invalid_request_ids_are_replaced() {
        for id in ["", "has space", "semi;colon", "quote\"d", &"x".repeat(129)] {
            let map = headers(&[("x-request-id", id)]);
            let resolved = resolve_request_id(&map);
            assert_ne!(resolved.to_str().unwrap(), id);
            assert_eq!(resolved.len(), 32);
        }
    }

    #[test]
    fn missing_request_ids_are_generated_uniquely() {
        let map = HeaderMap::new();
        let first = resolve_request_id(&map);
        let second = resolve_request_id(&map);
        assert_eq!(first.len(), 32);
        assert_ne!(first, second);
    }
}
