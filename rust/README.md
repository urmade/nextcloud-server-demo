<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Rust workspace

The Rust side of the Nextcloud migration. See the migration plan for the strategy; this file covers what exists and how to run it.

| Crate | Purpose |
|---|---|
| `crates/nc-gateway` | Front-door gateway: streams every request to PHP, with a per-route mode table and a global kill switch |

```
cd rust
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
cargo deny check
```

## nc-gateway

```
clients -> nc-gateway (:8080) -> PHP (:8081)
```

PHP must list the gateway in `trusted_proxies`. Otherwise it sees the gateway's address for every client, and brute force protection, rate limits, and audit logs lose the real client IP.

```
nc-gateway --upstream http://127.0.0.1:8081 --listen 0.0.0.0:8080 --route-table config/routes.toml
```

Every option also has an `NC_GATEWAY_*` environment variable (see `--help`).

### What is guaranteed

- Method, path, and query are forwarded byte for byte. The `Host` header is preserved.
- Request and response bodies are streamed in both directions and never buffered, so multi-gigabyte transfers, chunked bodies, ranges, and `Expect: 100-continue` work.
- Every HTTP method, including the WebDAV ones, is forwarded. Header name case and repeated headers such as `Set-Cookie` are kept.
- Hop-by-hop headers (`Connection` and the headers it names, `Keep-Alive`, `TE`, `Trailer`, `Transfer-Encoding`, `Upgrade`, and the proxy headers) are removed on each hop. `Upgrade` is not supported.
- `X-Forwarded-For`, `-Proto`, and `-Host` are set for PHP. Values from peers listed in `--trusted-proxy` are kept and the chain is extended. For every other peer they are discarded, so a client cannot spoof its address.
- `X-Request-Id` is generated, or kept when the client's value is a plausible token, and sent to PHP, which logs it as `clientReqId`. The response keeps the `X-Request-Id` PHP set (its own `reqId`); the gateway adds one only when PHP sent none, and on its own 502 and 504 answers.
- The gateway answers only when PHP cannot: 502 when PHP is unreachable, 504 after `--response-timeout-secs` without response headers.
- Upstream must be plain HTTP. TLS is terminated in front of the gateway.

### Route table

`--route-table` points at a TOML file (see `config/routes.toml`). Each route has a method list (optional), a path pattern, and a mode: `php`, `shadow`, `canary:N`, or `rust`. Requests that match no route go to PHP.

Rust handlers do not exist yet, so every mode is answered by PHP. A request whose route asks for something other than PHP is counted in `nc_gateway_requests_total` with `fallback_reason` set to `no_handler`, `canary_not_selected`, or `kill_switch`.

The file is re-read every `--reload-interval-ms` and on `SIGHUP`. A broken edit is rejected, logged, counted in `nc_gateway_route_table_reloads_total{result="rejected"}`, and the previous table stays active. A broken file at startup is a startup error.

### Kill switch

Any of these forces every route to PHP:

- the file named by `--kill-switch-file` exists (`touch` it to enable and `rm` it to disable; `occ upgrade` should hold it while it runs);
- `kill_switch = true` in the route table's `[gateway]` section;
- the `--kill-switch` flag, for the lifetime of the process.

### Admin listener

`--admin-listen` (default `127.0.0.1:9100`) serves `GET /healthz`, `GET /metrics` (Prometheus), and `GET /routes` (the active table and kill switch state). It is separate from the public listener, so none of these paths shadow a Nextcloud URL. Do not expose it publicly.

## CI

- `.github/workflows/rust.yml`: format, clippy, tests (including a 4.2 GiB streaming test), `cargo deny`, and the container image.
- `.github/workflows/integration-gateway.yml`: Behat suites, Litmus, and the Playwright smoke spec in `tests/smoke`, each run directly against PHP and through the gateway. `ci/with-gateway.sh` starts the gateway in front of PHP and fails if a suite passed without any request going through it. The `gateway-all-rust` Behat variant uses `ci/routes/all-rust-falls-back.toml` to prove that requesting `rust` mode changes nothing while no handler exists.
