// SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

//! Decides, per request, whether PHP serves it and why.

use std::collections::HashSet;

use http::Method;

use crate::route::{Mode, RouteTable};

/// Why a request that the route table offered to Rust is answered by PHP.
/// Labels are metric values and must stay stable.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum FallbackReason {
    KillSwitch,
    NoHandler,
    CanaryNotSelected,
}

impl FallbackReason {
    pub const ALL: [FallbackReason; 3] = [
        FallbackReason::KillSwitch,
        FallbackReason::NoHandler,
        FallbackReason::CanaryNotSelected,
    ];

    pub fn label(self) -> &'static str {
        match self {
            FallbackReason::KillSwitch => "kill_switch",
            FallbackReason::NoHandler => "no_handler",
            FallbackReason::CanaryNotSelected => "canary_not_selected",
        }
    }
}

/// The outcome for one request. PHP serves every request today; `fallback` is
/// `None` only when the route (or the absence of a route) asks for PHP.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Decision {
    pub route_id: String,
    pub mode: Mode,
    pub fallback: Option<FallbackReason>,
}

/// Route ids that have a Rust handler. Empty until the first handler lands;
/// every route is answered by PHP while it is.
#[derive(Debug, Clone, Default)]
pub struct HandlerRegistry {
    route_ids: HashSet<String>,
}

impl HandlerRegistry {
    pub fn has_handler(&self, route_id: &str) -> bool {
        self.route_ids.contains(route_id)
    }
}

/// A percentage roll in `0..100` used to select canary traffic.
pub trait CanaryRoller: Send + Sync {
    fn roll(&self) -> u8;
}

#[derive(Debug, Default)]
pub struct RandomRoller;

impl CanaryRoller for RandomRoller {
    fn roll(&self) -> u8 {
        fastrand::u8(0..100)
    }
}

pub const UNMATCHED_ROUTE: &str = "unmatched";

pub fn decide(
    table: &RouteTable,
    kill_switch: bool,
    handlers: &HandlerRegistry,
    roller: &dyn CanaryRoller,
    method: &Method,
    path: &str,
) -> Decision {
    let Some(route) = table.lookup(method, path) else {
        return Decision {
            route_id: UNMATCHED_ROUTE.to_owned(),
            mode: Mode::Php,
            fallback: None,
        };
    };

    let fallback = match route.mode {
        Mode::Php => None,
        _ if kill_switch => Some(FallbackReason::KillSwitch),
        Mode::Canary(percent) if roller.roll() >= percent => {
            Some(FallbackReason::CanaryNotSelected)
        }
        _ if !handlers.has_handler(&route.id) => Some(FallbackReason::NoHandler),
        _ => None,
    };

    Decision {
        route_id: route.id.clone(),
        mode: route.mode,
        fallback,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct FixedRoller(u8);

    impl CanaryRoller for FixedRoller {
        fn roll(&self) -> u8 {
            self.0
        }
    }

    fn table(mode: &str) -> RouteTable {
        RouteTable::parse(&format!(
            "[[route]]\nid = \"status\"\npath = \"/status.php\"\nmode = \"{mode}\"\n"
        ))
        .unwrap()
    }

    fn decide_with(table: &RouteTable, kill_switch: bool, roll: u8, path: &str) -> Decision {
        decide(
            table,
            kill_switch,
            &HandlerRegistry::default(),
            &FixedRoller(roll),
            &Method::GET,
            path,
        )
    }

    #[test]
    fn unmatched_requests_go_to_php_without_a_fallback() {
        let decision = decide_with(&table("rust"), false, 0, "/index.php");
        assert_eq!(decision.route_id, UNMATCHED_ROUTE);
        assert_eq!(decision.mode, Mode::Php);
        assert_eq!(decision.fallback, None);
    }

    #[test]
    fn php_mode_is_not_a_fallback() {
        let decision = decide_with(&table("php"), false, 0, "/status.php");
        assert_eq!(decision.route_id, "status");
        assert_eq!(decision.fallback, None);
    }

    #[test]
    fn php_mode_stays_unflagged_when_the_kill_switch_is_on() {
        assert_eq!(
            decide_with(&table("php"), true, 0, "/status.php").fallback,
            None
        );
    }

    #[test]
    fn rust_and_shadow_modes_fall_back_while_no_handler_exists() {
        for mode in ["rust", "shadow"] {
            let decision = decide_with(&table(mode), false, 0, "/status.php");
            assert_eq!(
                decision.fallback,
                Some(FallbackReason::NoHandler),
                "mode {mode}"
            );
        }
    }

    #[test]
    fn the_kill_switch_overrides_every_non_php_mode() {
        for mode in ["rust", "shadow", "canary:100"] {
            let decision = decide_with(&table(mode), true, 0, "/status.php");
            assert_eq!(
                decision.fallback,
                Some(FallbackReason::KillSwitch),
                "mode {mode}"
            );
        }
    }

    #[test]
    fn canary_selects_by_roll_below_the_percentage() {
        let canary = table("canary:10");
        assert_eq!(
            decide_with(&canary, false, 9, "/status.php").fallback,
            Some(FallbackReason::NoHandler)
        );
        assert_eq!(
            decide_with(&canary, false, 10, "/status.php").fallback,
            Some(FallbackReason::CanaryNotSelected)
        );
        assert_eq!(
            decide_with(&canary, false, 99, "/status.php").fallback,
            Some(FallbackReason::CanaryNotSelected)
        );
    }

    #[test]
    fn canary_extremes() {
        assert_eq!(
            decide_with(&table("canary:0"), false, 0, "/status.php").fallback,
            Some(FallbackReason::CanaryNotSelected)
        );
        assert_eq!(
            decide_with(&table("canary:100"), false, 99, "/status.php").fallback,
            Some(FallbackReason::NoHandler)
        );
    }

    #[test]
    fn a_registered_handler_clears_the_fallback() {
        let mut handlers = HandlerRegistry::default();
        handlers.route_ids.insert("status".to_owned());
        let decision = decide(
            &table("rust"),
            false,
            &handlers,
            &FixedRoller(0),
            &Method::GET,
            "/status.php",
        );
        assert_eq!(decision.fallback, None);
        assert_eq!(decision.mode, Mode::Rust);
    }

    #[test]
    fn the_random_roller_stays_in_range() {
        let roller = RandomRoller;
        assert!((0..1000).all(|_| roller.roll() < 100));
    }

    #[test]
    fn fallback_labels_are_stable_and_unique() {
        let labels: Vec<_> = FallbackReason::ALL.iter().map(|r| r.label()).collect();
        assert_eq!(labels, ["kill_switch", "no_handler", "canary_not_selected"]);
    }
}
