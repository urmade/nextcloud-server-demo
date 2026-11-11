// SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

use std::process::ExitCode;

use clap::Parser;
use nc_gateway::server::Gateway;
use nc_gateway::settings::Settings;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> ExitCode {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let settings = Settings::parse();
    let gateway = match Gateway::bind(&settings).await {
        Ok(gateway) => gateway,
        Err(error) => {
            tracing::error!(%error, "cannot start");
            return ExitCode::FAILURE;
        }
    };
    tracing::info!(
        listen = %gateway.local_addr(),
        admin = %gateway.admin_addr(),
        upstream = %settings.upstream.0,
        "gateway started"
    );
    gateway.run(shutdown_signal()).await;
    tracing::info!("gateway stopped");
    ExitCode::SUCCESS
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};
        match signal(SignalKind::terminate()) {
            Ok(mut terminate) => {
                tokio::select! {
                    () = ctrl_c => {}
                    _ = terminate.recv() => {}
                }
            }
            Err(_) => ctrl_c.await,
        }
    }
    #[cfg(not(unix))]
    ctrl_c.await;
}
