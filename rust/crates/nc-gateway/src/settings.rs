// SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

//! Command line and environment configuration.

use std::net::SocketAddr;
use std::path::PathBuf;
use std::str::FromStr;
use std::time::Duration;

use clap::Parser;
use http::Uri;
use http::uri::{Authority, Scheme};

/// The PHP runtime the gateway forwards to: a plain `http://host:port`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Upstream(pub Authority);

impl FromStr for Upstream {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let uri: Uri = s
            .parse()
            .map_err(|e| format!("invalid upstream URL `{s}`: {e}"))?;
        if uri.scheme() != Some(&Scheme::HTTP) {
            return Err(format!("upstream `{s}` must use the http:// scheme"));
        }
        let authority = uri
            .authority()
            .ok_or_else(|| format!("upstream `{s}` has no host"))?;
        if uri.query().is_some() || !matches!(uri.path(), "" | "/") {
            return Err(format!("upstream `{s}` must not have a path or query"));
        }
        Ok(Upstream(authority.clone()))
    }
}

#[derive(Debug, Clone, Parser)]
#[command(
    name = "nc-gateway",
    version,
    about = "Nextcloud gateway: pass-through proxy to PHP with a route table"
)]
pub struct Settings {
    /// Address the gateway accepts client connections on.
    #[arg(long, env = "NC_GATEWAY_LISTEN", default_value = "0.0.0.0:8080")]
    pub listen: SocketAddr,

    /// Address of the admin listener (`/healthz`, `/metrics`, `/routes`). Keep it off public networks.
    #[arg(
        long,
        env = "NC_GATEWAY_ADMIN_LISTEN",
        default_value = "127.0.0.1:9100"
    )]
    pub admin_listen: SocketAddr,

    /// The PHP upstream, for example `http://127.0.0.1:8081`.
    #[arg(long, env = "NC_GATEWAY_UPSTREAM")]
    pub upstream: Upstream,

    /// Route table (TOML). Without one, every request goes to PHP.
    #[arg(long, env = "NC_GATEWAY_ROUTE_TABLE")]
    pub route_table: Option<PathBuf>,

    /// While this file exists, every route is served by PHP (global kill switch).
    #[arg(long, env = "NC_GATEWAY_KILL_SWITCH_FILE")]
    pub kill_switch_file: Option<PathBuf>,

    /// Force the kill switch on for the lifetime of the process.
    #[arg(long, env = "NC_GATEWAY_KILL_SWITCH")]
    pub kill_switch: bool,

    /// Peers (IP or CIDR, comma separated) whose `X-Forwarded-*` headers are kept.
    #[arg(
        long = "trusted-proxy",
        env = "NC_GATEWAY_TRUSTED_PROXIES",
        value_delimiter = ','
    )]
    pub trusted_proxies: Vec<String>,

    /// How often the route table and kill switch file are checked for changes.
    #[arg(long, env = "NC_GATEWAY_RELOAD_INTERVAL_MS", default_value_t = 1000)]
    pub reload_interval_ms: u64,

    /// Time allowed to connect to PHP.
    #[arg(long, env = "NC_GATEWAY_CONNECT_TIMEOUT_SECS", default_value_t = 10)]
    pub connect_timeout_secs: u64,

    /// Time allowed for PHP to start answering; 0 disables the limit.
    #[arg(long, env = "NC_GATEWAY_RESPONSE_TIMEOUT_SECS", default_value_t = 3600)]
    pub response_timeout_secs: u64,
}

impl Settings {
    pub fn reload_interval(&self) -> Duration {
        Duration::from_millis(self.reload_interval_ms.max(10))
    }

    pub fn connect_timeout(&self) -> Duration {
        Duration::from_secs(self.connect_timeout_secs.max(1))
    }

    pub fn response_timeout(&self) -> Option<Duration> {
        (self.response_timeout_secs > 0).then(|| Duration::from_secs(self.response_timeout_secs))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(args: &[&str]) -> Result<Settings, clap::Error> {
        Settings::try_parse_from(std::iter::once("nc-gateway").chain(args.iter().copied()))
    }

    #[test]
    fn upstream_accepts_plain_http_authorities() {
        for (input, expected) in [
            ("http://127.0.0.1:8081", "127.0.0.1:8081"),
            ("http://php:9000/", "php:9000"),
            ("http://[::1]:8080", "[::1]:8080"),
            ("http://nextcloud", "nextcloud"),
        ] {
            let Upstream(authority) = input.parse().unwrap();
            assert_eq!(authority.as_str(), expected);
        }
    }

    #[test]
    fn upstream_rejects_everything_else() {
        for input in [
            "127.0.0.1:8081",
            "https://php",
            "http://php/nextcloud",
            "http://php/?x=1",
            "ftp://php",
            "http://",
            "",
        ] {
            assert!(
                input.parse::<Upstream>().is_err(),
                "`{input}` should be rejected"
            );
        }
    }

    #[test]
    fn defaults_apply_when_only_the_upstream_is_given() {
        let settings = parse(&["--upstream", "http://127.0.0.1:8081"]).unwrap();
        assert_eq!(settings.listen, "0.0.0.0:8080".parse().unwrap());
        assert_eq!(settings.admin_listen, "127.0.0.1:9100".parse().unwrap());
        assert_eq!(settings.route_table, None);
        assert!(!settings.kill_switch);
        assert!(settings.trusted_proxies.is_empty());
        assert_eq!(settings.reload_interval(), Duration::from_secs(1));
        assert_eq!(settings.connect_timeout(), Duration::from_secs(10));
        assert_eq!(settings.response_timeout(), Some(Duration::from_secs(3600)));
    }

    #[test]
    fn the_upstream_is_required() {
        assert!(parse(&[]).is_err());
    }

    #[test]
    fn trusted_proxies_are_comma_separated_or_repeated() {
        let settings = parse(&[
            "--upstream",
            "http://php:80",
            "--trusted-proxy",
            "10.0.0.0/8,192.168.0.1",
            "--trusted-proxy",
            "::1",
        ])
        .unwrap();
        assert_eq!(
            settings.trusted_proxies,
            ["10.0.0.0/8", "192.168.0.1", "::1"]
        );
    }

    #[test]
    fn a_zero_response_timeout_disables_the_limit() {
        let settings = parse(&[
            "--upstream",
            "http://php:80",
            "--response-timeout-secs",
            "0",
        ])
        .unwrap();
        assert_eq!(settings.response_timeout(), None);
    }

    #[test]
    fn timings_are_clamped_to_sane_minimums() {
        let settings = parse(&[
            "--upstream",
            "http://php:80",
            "--reload-interval-ms",
            "0",
            "--connect-timeout-secs",
            "0",
        ])
        .unwrap();
        assert_eq!(settings.reload_interval(), Duration::from_millis(10));
        assert_eq!(settings.connect_timeout(), Duration::from_secs(1));
    }
}
