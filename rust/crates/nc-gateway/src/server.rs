// SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

//! Listeners, the reload loop, and graceful shutdown.

use std::future::Future;
use std::io;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper_util::rt::{TokioIo, TokioTimer};
use hyper_util::server::graceful::GracefulShutdown;
use tokio::net::TcpListener;
use tokio::sync::watch;

use crate::admin::{self, AdminState};
use crate::dispatch::{CanaryRoller, RandomRoller};
use crate::headers::TrustedProxies;
use crate::metrics::Metrics;
use crate::proxy::{Proxy, ProxyConfig};
use crate::settings::Settings;
use crate::state::{LoadError, RefreshOutcome, RouteState};

const HEADER_READ_TIMEOUT: Duration = Duration::from_secs(30);
const SHUTDOWN_GRACE: Duration = Duration::from_secs(30);

#[derive(Debug, thiserror::Error)]
pub enum StartError {
    #[error(transparent)]
    RouteTable(#[from] LoadError),
    #[error("invalid trusted proxy list: {0}")]
    TrustedProxies(String),
    #[error("cannot listen on {addr}: {source}")]
    Bind { addr: SocketAddr, source: io::Error },
}

pub struct Gateway {
    listener: TcpListener,
    admin_listener: TcpListener,
    proxy: Arc<Proxy>,
    state: Arc<RouteState>,
    metrics: Arc<Metrics>,
    reload_interval: Duration,
}

impl Gateway {
    pub async fn bind(settings: &Settings) -> Result<Self, StartError> {
        Self::bind_with_roller(settings, Arc::new(RandomRoller)).await
    }

    pub async fn bind_with_roller(
        settings: &Settings,
        roller: Arc<dyn CanaryRoller>,
    ) -> Result<Self, StartError> {
        let state = Arc::new(RouteState::load(
            settings.route_table.clone(),
            settings.kill_switch_file.clone(),
            settings.kill_switch,
        )?);
        let trusted_proxies =
            TrustedProxies::parse(&settings.trusted_proxies).map_err(StartError::TrustedProxies)?;
        let metrics = Arc::new(Metrics::new());
        let proxy = Arc::new(Proxy::new(
            ProxyConfig {
                upstream: settings.upstream.0.clone(),
                trusted_proxies,
                connect_timeout: settings.connect_timeout(),
                response_timeout: settings.response_timeout(),
            },
            state.clone(),
            metrics.clone(),
            roller,
        ));
        let listener = bind(settings.listen).await?;
        let admin_listener = bind(settings.admin_listen).await?;
        Ok(Gateway {
            listener,
            admin_listener,
            proxy,
            state,
            metrics,
            reload_interval: settings.reload_interval(),
        })
    }

    pub fn local_addr(&self) -> SocketAddr {
        self.listener
            .local_addr()
            .expect("bound listener has an address")
    }

    pub fn admin_addr(&self) -> SocketAddr {
        self.admin_listener
            .local_addr()
            .expect("bound listener has an address")
    }

    /// Serves until `shutdown` completes, then stops accepting and gives
    /// in-flight requests a grace period.
    pub async fn run(self, shutdown: impl Future<Output = ()>) {
        let (stop_tx, stop_rx) = watch::channel(false);

        let reloader = tokio::spawn(reload_loop(
            self.state.clone(),
            self.metrics.clone(),
            self.reload_interval,
            stop_rx.clone(),
        ));

        let admin_router = admin::router(AdminState {
            routes: self.state.clone(),
            metrics: self.metrics.clone(),
        });
        let mut admin_stop = stop_rx.clone();
        let admin_server = tokio::spawn(async move {
            let served = axum::serve(self.admin_listener, admin_router)
                .with_graceful_shutdown(async move {
                    let _ = admin_stop.wait_for(|stopped| *stopped).await;
                })
                .await;
            if let Err(error) = served {
                tracing::error!(%error, "admin listener failed");
            }
        });

        let graceful = GracefulShutdown::new();
        let mut shutdown = std::pin::pin!(shutdown);
        loop {
            tokio::select! {
                () = &mut shutdown => break,
                accepted = self.listener.accept() => match accepted {
                    Ok((stream, peer)) => {
                        let proxy = self.proxy.clone();
                        let service = service_fn(move |request| {
                            let proxy = proxy.clone();
                            async move { Ok::<_, std::convert::Infallible>(proxy.handle(request, peer).await) }
                        });
                        let mut builder = http1::Builder::new();
                        builder
                            .timer(TokioTimer::new())
                            .header_read_timeout(HEADER_READ_TIMEOUT)
                            .preserve_header_case(true);
                        let connection = builder.serve_connection(TokioIo::new(stream), service);
                        let connection = graceful.watch(connection);
                        tokio::spawn(async move {
                            if let Err(error) = connection.await {
                                tracing::debug!(%error, %peer, "client connection ended with an error");
                            }
                        });
                    }
                    Err(error) => {
                        tracing::warn!(%error, "accept failed");
                        tokio::time::sleep(Duration::from_millis(50)).await;
                    }
                }
            }
        }

        let _ = stop_tx.send(true);
        if tokio::time::timeout(SHUTDOWN_GRACE, graceful.shutdown())
            .await
            .is_err()
        {
            tracing::warn!("closing connections that outlived the shutdown grace period");
        }
        let _ = reloader.await;
        let _ = admin_server.await;
    }
}

async fn bind(addr: SocketAddr) -> Result<TcpListener, StartError> {
    TcpListener::bind(addr)
        .await
        .map_err(|source| StartError::Bind { addr, source })
}

async fn reload_loop(
    state: Arc<RouteState>,
    metrics: Arc<Metrics>,
    interval: Duration,
    mut stop: watch::Receiver<bool>,
) {
    let mut ticker = tokio::time::interval(interval);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut hangup = hangup_signal();
    loop {
        tokio::select! {
            _ = ticker.tick() => {}
            () = hangup.recv() => tracing::info!("SIGHUP received, reloading the route table"),
            _ = stop.wait_for(|stopped| *stopped) => return,
        }
        let refreshing = state.clone();
        let outcome = tokio::task::spawn_blocking(move || refreshing.refresh()).await;
        match outcome {
            Ok(RefreshOutcome::Unchanged) => {}
            Ok(RefreshOutcome::Reloaded) => {
                metrics.record_reload(true);
                tracing::info!(
                    routes = state.table().routes().len(),
                    "route table reloaded"
                );
            }
            Ok(RefreshOutcome::Rejected(reason)) => {
                metrics.record_reload(false);
                tracing::error!(%reason, "route table reload rejected; keeping the previous table");
            }
            Err(error) => tracing::error!(%error, "route table refresh task failed"),
        }
    }
}

/// A source of `SIGHUP` notifications; never fires on platforms without it.
struct Hangup {
    #[cfg(unix)]
    signal: Option<tokio::signal::unix::Signal>,
}

impl Hangup {
    async fn recv(&mut self) {
        #[cfg(unix)]
        if let Some(signal) = self.signal.as_mut() {
            signal.recv().await;
            return;
        }
        std::future::pending::<()>().await;
    }
}

fn hangup_signal() -> Hangup {
    Hangup {
        #[cfg(unix)]
        signal: tokio::signal::unix::signal(tokio::signal::unix::SignalKind::hangup()).ok(),
    }
}
