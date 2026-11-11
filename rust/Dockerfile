# SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

# Build context: rust/
FROM rust:1.99-slim-bookworm AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY crates ./crates
RUN cargo build --release --locked -p nc-gateway

FROM debian:bookworm-slim
RUN useradd --system --no-create-home --shell /usr/sbin/nologin gateway
COPY --from=build /src/target/release/nc-gateway /usr/local/bin/nc-gateway
COPY config/routes.toml /etc/nc-gateway/routes.toml
USER gateway
EXPOSE 8080 9100
ENV NC_GATEWAY_LISTEN=0.0.0.0:8080 \
    NC_GATEWAY_ADMIN_LISTEN=0.0.0.0:9100 \
    NC_GATEWAY_ROUTE_TABLE=/etc/nc-gateway/routes.toml
ENTRYPOINT ["/usr/local/bin/nc-gateway"]
