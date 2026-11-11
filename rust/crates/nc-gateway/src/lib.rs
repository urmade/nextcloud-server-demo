// SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

//! Front-door gateway for Nextcloud.
//!
//! Every request is proxied to the PHP runtime. A route table decides each
//! request's mode (`php`, `shadow`, `canary:N`, `rust`); until Rust handlers
//! exist, every mode is answered by PHP and the reason is counted.

pub mod admin;
pub mod dispatch;
pub mod headers;
pub mod metrics;
pub mod proxy;
pub mod route;
pub mod server;
pub mod settings;
pub mod state;
