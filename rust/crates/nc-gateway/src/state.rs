// SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

//! The live route table and kill switch, with reload from disk.

use std::io;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};

use arc_swap::ArcSwap;

use crate::route::{RouteTable, RouteTableError};

#[derive(Debug, thiserror::Error)]
pub enum LoadError {
    #[error("cannot read route table {path}: {source}")]
    Read { path: PathBuf, source: io::Error },
    #[error("{path}: {source}")]
    Parse {
        path: PathBuf,
        source: RouteTableError,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RefreshOutcome {
    Unchanged,
    Reloaded,
    /// The new content was rejected and the previous table stays active.
    Rejected(String),
}

#[derive(Debug, Default)]
struct Source {
    table_path: Option<PathBuf>,
    kill_switch_file: Option<PathBuf>,
    forced_kill_switch: bool,
}

/// Shared by every connection. Reads are lock-free.
#[derive(Debug)]
pub struct RouteState {
    table: ArcSwap<RouteTable>,
    kill_switch_file_present: AtomicBool,
    source: Source,
    last_seen: Mutex<Option<Vec<u8>>>,
}

impl RouteState {
    /// Loads the initial table. An unreadable or invalid table is a startup
    /// error; only later reloads keep the previous table on failure.
    pub fn load(
        table_path: Option<PathBuf>,
        kill_switch_file: Option<PathBuf>,
        forced_kill_switch: bool,
    ) -> Result<Self, LoadError> {
        let (table, content) = match &table_path {
            Some(path) => {
                let content = std::fs::read(path).map_err(|source| LoadError::Read {
                    path: path.clone(),
                    source,
                })?;
                let table = parse_bytes(&content).map_err(|source| LoadError::Parse {
                    path: path.clone(),
                    source,
                })?;
                (table, Some(content))
            }
            None => (RouteTable::default(), None),
        };
        let state = RouteState {
            table: ArcSwap::from_pointee(table),
            kill_switch_file_present: AtomicBool::new(false),
            source: Source {
                table_path,
                kill_switch_file,
                forced_kill_switch,
            },
            last_seen: Mutex::new(content),
        };
        state.refresh_kill_switch_file();
        Ok(state)
    }

    pub fn from_table(table: RouteTable) -> Self {
        RouteState {
            table: ArcSwap::from_pointee(table),
            kill_switch_file_present: AtomicBool::new(false),
            source: Source::default(),
            last_seen: Mutex::new(None),
        }
    }

    pub fn table(&self) -> Arc<RouteTable> {
        self.table.load_full()
    }

    /// True when any of the three switches is on: the `--kill-switch` flag, the
    /// kill switch file, or `kill_switch = true` in the loaded table.
    pub fn kill_switch_active(&self) -> bool {
        self.source.forced_kill_switch
            || self.kill_switch_file_present.load(Ordering::Relaxed)
            || self.table.load().kill_switch()
    }

    /// Re-reads the kill switch file and the route table. Called on a timer and
    /// on `SIGHUP`. A rejected version is reported once, not on every poll.
    pub fn refresh(&self) -> RefreshOutcome {
        self.refresh_kill_switch_file();
        let Some(path) = &self.source.table_path else {
            return RefreshOutcome::Unchanged;
        };
        let mut last_seen = self.last_seen.lock().expect("poisoned");
        let content = match std::fs::read(path) {
            Ok(content) => content,
            Err(error) => {
                if last_seen.take().is_none() {
                    return RefreshOutcome::Unchanged;
                }
                return RefreshOutcome::Rejected(format!(
                    "cannot read route table {}: {error}",
                    path.display()
                ));
            }
        };
        if last_seen.as_deref() == Some(content.as_slice()) {
            return RefreshOutcome::Unchanged;
        }
        let parsed = parse_bytes(&content);
        *last_seen = Some(content);
        match parsed {
            Ok(table) => {
                self.table.store(Arc::new(table));
                RefreshOutcome::Reloaded
            }
            Err(error) => RefreshOutcome::Rejected(format!("{}: {error}", path.display())),
        }
    }

    fn refresh_kill_switch_file(&self) {
        if let Some(path) = &self.source.kill_switch_file {
            self.kill_switch_file_present
                .store(path.exists(), Ordering::Relaxed);
        }
    }
}

fn parse_bytes(content: &[u8]) -> Result<RouteTable, RouteTableError> {
    let text = std::str::from_utf8(content)
        .map_err(|e| RouteTableError::Syntax(format!("not valid UTF-8: {e}")))?;
    RouteTable::parse(text)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use http::Method;
    use tempfile::TempDir;

    use super::*;
    use crate::route::Mode;

    const PHP_TABLE: &str = "[[route]]\nid = \"status\"\npath = \"/status.php\"\nmode = \"php\"\n";
    const RUST_TABLE: &str =
        "[[route]]\nid = \"status\"\npath = \"/status.php\"\nmode = \"rust\"\n";

    fn mode_of(state: &RouteState) -> Option<Mode> {
        state
            .table()
            .lookup(&Method::GET, "/status.php")
            .map(|route| route.mode)
    }

    fn write(dir: &TempDir, name: &str, content: &str) -> PathBuf {
        let path = dir.path().join(name);
        fs::write(&path, content).unwrap();
        path
    }

    #[test]
    fn without_a_file_the_table_is_empty_and_never_reloads() {
        let state = RouteState::load(None, None, false).unwrap();
        assert!(state.table().routes().is_empty());
        assert_eq!(state.refresh(), RefreshOutcome::Unchanged);
        assert!(!state.kill_switch_active());
    }

    #[test]
    fn the_initial_table_is_read_from_disk() {
        let dir = TempDir::new().unwrap();
        let path = write(&dir, "routes.toml", RUST_TABLE);
        let state = RouteState::load(Some(path), None, false).unwrap();
        assert_eq!(mode_of(&state), Some(Mode::Rust));
    }

    #[test]
    fn a_missing_initial_table_is_a_startup_error() {
        let dir = TempDir::new().unwrap();
        let error =
            RouteState::load(Some(dir.path().join("absent.toml")), None, false).unwrap_err();
        assert!(matches!(error, LoadError::Read { .. }));
    }

    #[test]
    fn an_invalid_initial_table_is_a_startup_error() {
        let dir = TempDir::new().unwrap();
        let path = write(
            &dir,
            "routes.toml",
            "[[route]]\npath = \"/a\"\nmode = \"nope\"\n",
        );
        let error = RouteState::load(Some(path), None, false).unwrap_err();
        assert!(error.to_string().contains("unknown mode"), "{error}");
    }

    #[test]
    fn changed_content_is_reloaded_and_identical_content_is_not() {
        let dir = TempDir::new().unwrap();
        let path = write(&dir, "routes.toml", PHP_TABLE);
        let state = RouteState::load(Some(path.clone()), None, false).unwrap();
        assert_eq!(state.refresh(), RefreshOutcome::Unchanged);

        fs::write(&path, RUST_TABLE).unwrap();
        assert_eq!(state.refresh(), RefreshOutcome::Reloaded);
        assert_eq!(mode_of(&state), Some(Mode::Rust));
        assert_eq!(state.refresh(), RefreshOutcome::Unchanged);

        fs::write(&path, PHP_TABLE).unwrap();
        assert_eq!(state.refresh(), RefreshOutcome::Reloaded);
        assert_eq!(mode_of(&state), Some(Mode::Php));
    }

    #[test]
    fn a_rejected_reload_keeps_the_previous_table_and_reports_once() {
        let dir = TempDir::new().unwrap();
        let path = write(&dir, "routes.toml", RUST_TABLE);
        let state = RouteState::load(Some(path.clone()), None, false).unwrap();

        fs::write(
            &path,
            "[[route]]\npath = \"/status.php\"\nmode = \"bogus\"\n",
        )
        .unwrap();
        assert!(
            matches!(state.refresh(), RefreshOutcome::Rejected(message) if message.contains("unknown mode"))
        );
        assert_eq!(mode_of(&state), Some(Mode::Rust));
        assert_eq!(state.refresh(), RefreshOutcome::Unchanged);

        fs::write(&path, PHP_TABLE).unwrap();
        assert_eq!(state.refresh(), RefreshOutcome::Reloaded);
        assert_eq!(mode_of(&state), Some(Mode::Php));
    }

    #[test]
    fn restoring_the_last_good_content_after_a_rejection_reloads_it() {
        let dir = TempDir::new().unwrap();
        let path = write(&dir, "routes.toml", RUST_TABLE);
        let state = RouteState::load(Some(path.clone()), None, false).unwrap();
        fs::write(&path, "garbage = [").unwrap();
        assert!(matches!(state.refresh(), RefreshOutcome::Rejected(_)));
        fs::write(&path, RUST_TABLE).unwrap();
        assert_eq!(state.refresh(), RefreshOutcome::Reloaded);
    }

    #[test]
    fn a_deleted_table_file_keeps_the_previous_table_and_reports_once() {
        let dir = TempDir::new().unwrap();
        let path = write(&dir, "routes.toml", RUST_TABLE);
        let state = RouteState::load(Some(path.clone()), None, false).unwrap();
        fs::remove_file(&path).unwrap();
        assert!(
            matches!(state.refresh(), RefreshOutcome::Rejected(message) if message.contains("cannot read"))
        );
        assert_eq!(mode_of(&state), Some(Mode::Rust));
        assert_eq!(state.refresh(), RefreshOutcome::Unchanged);
        fs::write(&path, PHP_TABLE).unwrap();
        assert_eq!(state.refresh(), RefreshOutcome::Reloaded);
    }

    #[test]
    fn non_utf8_content_is_rejected() {
        let dir = TempDir::new().unwrap();
        let path = write(&dir, "routes.toml", PHP_TABLE);
        let state = RouteState::load(Some(path.clone()), None, false).unwrap();
        fs::write(&path, [0xff, 0xfe, 0x00]).unwrap();
        assert!(
            matches!(state.refresh(), RefreshOutcome::Rejected(message) if message.contains("UTF-8"))
        );
    }

    #[test]
    fn the_kill_switch_file_toggles_the_switch_on_refresh() {
        let dir = TempDir::new().unwrap();
        let flag = dir.path().join("killswitch");
        let state = RouteState::load(None, Some(flag.clone()), false).unwrap();
        assert!(!state.kill_switch_active());

        fs::write(&flag, "").unwrap();
        assert!(
            !state.kill_switch_active(),
            "the file is only noticed on refresh"
        );
        state.refresh();
        assert!(state.kill_switch_active());

        fs::remove_file(&flag).unwrap();
        state.refresh();
        assert!(!state.kill_switch_active());
    }

    #[test]
    fn an_existing_kill_switch_file_is_honored_at_startup() {
        let dir = TempDir::new().unwrap();
        let flag = write(&dir, "killswitch", "");
        let state = RouteState::load(None, Some(flag), false).unwrap();
        assert!(state.kill_switch_active());
    }

    #[test]
    fn the_forced_flag_cannot_be_cleared_by_reloads() {
        let dir = TempDir::new().unwrap();
        let path = write(&dir, "routes.toml", PHP_TABLE);
        let state = RouteState::load(Some(path), None, true).unwrap();
        assert!(state.kill_switch_active());
        state.refresh();
        assert!(state.kill_switch_active());
    }

    #[test]
    fn the_table_flag_turns_the_switch_on_and_off_with_reloads() {
        let dir = TempDir::new().unwrap();
        let path = write(&dir, "routes.toml", PHP_TABLE);
        let state = RouteState::load(Some(path.clone()), None, false).unwrap();
        assert!(!state.kill_switch_active());

        fs::write(&path, format!("[gateway]\nkill_switch = true\n{PHP_TABLE}")).unwrap();
        assert_eq!(state.refresh(), RefreshOutcome::Reloaded);
        assert!(state.kill_switch_active());

        fs::write(&path, PHP_TABLE).unwrap();
        state.refresh();
        assert!(!state.kill_switch_active());
    }

    #[test]
    fn switches_combine_with_or() {
        let dir = TempDir::new().unwrap();
        let flag = write(&dir, "killswitch", "");
        let path = write(&dir, "routes.toml", "[gateway]\nkill_switch = true\n");
        let state = RouteState::load(Some(path), Some(flag.clone()), false).unwrap();
        fs::remove_file(&flag).unwrap();
        state.refresh();
        assert!(
            state.kill_switch_active(),
            "the table flag alone keeps it on"
        );
    }
}
