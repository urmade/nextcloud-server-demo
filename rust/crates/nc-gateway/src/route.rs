// SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

//! The route table: which requests are eligible for which serving mode.

use std::collections::HashSet;
use std::fmt;
use std::str::FromStr;

use http::Method;
use serde::{Deserialize, Deserializer, Serialize, Serializer};

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum RouteTableError {
    #[error("invalid route table TOML: {0}")]
    Syntax(String),
    #[error("route {route}: {message}")]
    Route { route: String, message: String },
    #[error("duplicate route id `{0}`")]
    DuplicateId(String),
    #[error("route `{0}` duplicates an earlier route with the same methods and path")]
    DuplicateRoute(String),
}

/// How a route is served. Only `Php` is wired to a backend today; the other
/// modes are accepted so that tables can be written ahead of the handlers and
/// are answered by PHP until a handler is registered.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Mode {
    Php,
    Shadow,
    /// Percentage of requests (0..=100) offered to the Rust handler.
    Canary(u8),
    Rust,
}

impl Mode {
    /// Stable metric label; the canary percentage is deliberately not part of it.
    pub fn label(self) -> &'static str {
        match self {
            Mode::Php => "php",
            Mode::Shadow => "shadow",
            Mode::Canary(_) => "canary",
            Mode::Rust => "rust",
        }
    }
}

impl fmt::Display for Mode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Mode::Canary(percent) => write!(f, "canary:{percent}"),
            other => f.write_str(other.label()),
        }
    }
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
#[error("unknown mode `{0}` (expected php, shadow, canary:<0-100>, or rust)")]
pub struct ParseModeError(String);

impl FromStr for Mode {
    type Err = ParseModeError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "php" => Ok(Mode::Php),
            "shadow" => Ok(Mode::Shadow),
            "rust" => Ok(Mode::Rust),
            other => {
                let percent = other
                    .strip_prefix("canary:")
                    .filter(|digits| {
                        !digits.is_empty() && digits.bytes().all(|b| b.is_ascii_digit())
                    })
                    .and_then(|digits| digits.parse::<u8>().ok())
                    .filter(|percent| *percent <= 100);
                percent
                    .map(Mode::Canary)
                    .ok_or_else(|| ParseModeError(other.to_owned()))
            }
        }
    }
}

impl<'de> Deserialize<'de> for Mode {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let raw = String::deserialize(deserializer)?;
        raw.parse().map_err(serde::de::Error::custom)
    }
}

impl Serialize for Mode {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_str(self)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Segment {
    Literal(String),
    Param,
}

/// A request path pattern.
///
/// - `/status.php` matches that path only.
/// - `/ocs/v2.php/apps/user_status/api/v1/statuses/{userId}` matches one
///   non-empty segment at `{userId}`.
/// - A trailing `/*` matches the prefix itself and everything below it.
///
/// Matching works on the raw, still percent-encoded request path.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PathPattern {
    source: String,
    segments: Vec<Segment>,
    prefix: bool,
}

impl PathPattern {
    pub fn parse(source: &str) -> Result<Self, String> {
        let Some(rest) = source.strip_prefix('/') else {
            return Err(format!("path `{source}` must start with `/`"));
        };
        let mut parts: Vec<&str> = rest.split('/').collect();
        let prefix = parts.last() == Some(&"*");
        if prefix {
            parts.pop();
        }
        let mut segments = Vec::with_capacity(parts.len());
        for part in parts {
            if part == "*" {
                return Err(format!(
                    "path `{source}`: `*` is only allowed as the last segment"
                ));
            }
            if let Some(name) = part.strip_prefix('{').and_then(|p| p.strip_suffix('}')) {
                if name.is_empty() || !name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
                {
                    return Err(format!("path `{source}`: invalid parameter `{part}`"));
                }
                segments.push(Segment::Param);
            } else if part.contains(['{', '}', '*']) {
                return Err(format!(
                    "path `{source}`: `{part}` mixes literal text and pattern syntax"
                ));
            } else {
                segments.push(Segment::Literal(part.to_owned()));
            }
        }
        Ok(PathPattern {
            source: source.to_owned(),
            segments,
            prefix,
        })
    }

    pub fn as_str(&self) -> &str {
        &self.source
    }

    pub fn matches(&self, path: &str) -> bool {
        let Some(rest) = path.strip_prefix('/') else {
            return false;
        };
        let mut request_segments = rest.split('/');
        for expected in &self.segments {
            let Some(actual) = request_segments.next() else {
                return false;
            };
            match expected {
                Segment::Literal(literal) if literal != actual => return false,
                Segment::Param if actual.is_empty() => return false,
                _ => {}
            }
        }
        self.prefix || request_segments.next().is_none()
    }

    fn literal_count(&self) -> usize {
        self.segments
            .iter()
            .filter(|segment| matches!(segment, Segment::Literal(_)))
            .count()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Route {
    pub id: String,
    pub methods: Option<Vec<Method>>,
    pub pattern: PathPattern,
    pub mode: Mode,
}

impl Route {
    fn matches(&self, method: &Method, path: &str) -> bool {
        self.methods
            .as_ref()
            .is_none_or(|methods| methods.contains(method))
            && self.pattern.matches(path)
    }

    /// Larger is more specific. Compared in order: exact paths beat prefixes,
    /// more literal segments, more segments overall, then a method restriction.
    /// Remaining ties go to the route declared first.
    fn specificity(&self) -> (bool, usize, usize, bool) {
        (
            !self.pattern.prefix,
            self.pattern.literal_count(),
            self.pattern.segments.len(),
            self.methods.is_some(),
        )
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RouteTable {
    routes: Vec<Route>,
    kill_switch: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawTable {
    #[serde(default)]
    gateway: RawGateway,
    #[serde(default, rename = "route")]
    routes: Vec<RawRoute>,
}

#[derive(Deserialize, Default)]
#[serde(deny_unknown_fields)]
struct RawGateway {
    #[serde(default)]
    kill_switch: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawRoute {
    id: Option<String>,
    methods: Option<Vec<String>>,
    path: String,
    mode: Mode,
}

impl RouteTable {
    pub fn parse(toml_source: &str) -> Result<Self, RouteTableError> {
        let raw: RawTable =
            toml::from_str(toml_source).map_err(|e| RouteTableError::Syntax(e.to_string()))?;

        let mut routes = Vec::with_capacity(raw.routes.len());
        let mut ids = HashSet::new();
        let mut shapes = HashSet::new();
        for raw_route in raw.routes {
            let label = raw_route
                .id
                .clone()
                .unwrap_or_else(|| raw_route.path.clone());
            let fail = |message: String| RouteTableError::Route {
                route: label.clone(),
                message,
            };

            let methods = raw_route
                .methods
                .map(|names| parse_methods(&names).map_err(fail))
                .transpose()?;
            let pattern = PathPattern::parse(&raw_route.path).map_err(fail)?;
            let id = raw_route
                .id
                .unwrap_or_else(|| default_id(methods.as_deref(), &pattern));
            if id.is_empty() {
                return Err(fail("`id` must not be empty".to_owned()));
            }
            if !ids.insert(id.clone()) {
                return Err(RouteTableError::DuplicateId(id));
            }
            let shape = (
                pattern.as_str().to_owned(),
                shape_methods(methods.as_deref()),
            );
            if !shapes.insert(shape) {
                return Err(RouteTableError::DuplicateRoute(id));
            }
            routes.push(Route {
                id,
                methods,
                pattern,
                mode: raw_route.mode,
            });
        }

        Ok(RouteTable {
            routes,
            kill_switch: raw.gateway.kill_switch,
        })
    }

    pub fn kill_switch(&self) -> bool {
        self.kill_switch
    }

    pub fn routes(&self) -> &[Route] {
        &self.routes
    }

    /// The most specific route for the request, or `None` when nothing matches
    /// (which means PHP).
    pub fn lookup(&self, method: &Method, path: &str) -> Option<&Route> {
        let mut best: Option<&Route> = None;
        for route in self.routes.iter().filter(|r| r.matches(method, path)) {
            if best.is_none_or(|current| route.specificity() > current.specificity()) {
                best = Some(route);
            }
        }
        best
    }
}

fn parse_methods(names: &[String]) -> Result<Vec<Method>, String> {
    if names.is_empty() {
        return Err("`methods` must not be empty; omit it to match every method".to_owned());
    }
    names
        .iter()
        .map(|name| {
            let upper = name.to_ascii_uppercase();
            Method::from_bytes(upper.as_bytes()).map_err(|_| format!("invalid method `{name}`"))
        })
        .collect()
}

fn shape_methods(methods: Option<&[Method]>) -> Option<Vec<String>> {
    methods.map(|methods| {
        let mut names: Vec<String> = methods.iter().map(|m| m.as_str().to_owned()).collect();
        names.sort();
        names.dedup();
        names
    })
}

fn default_id(methods: Option<&[Method]>, pattern: &PathPattern) -> String {
    match shape_methods(methods) {
        Some(names) => format!("{} {}", names.join("|"), pattern.as_str()),
        None => pattern.as_str().to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn table(source: &str) -> RouteTable {
        RouteTable::parse(source).expect("table parses")
    }

    fn lookup_id<'a>(table: &'a RouteTable, method: &str, path: &str) -> Option<&'a str> {
        table
            .lookup(&Method::from_bytes(method.as_bytes()).unwrap(), path)
            .map(|route| route.id.as_str())
    }

    #[test]
    fn modes_parse_and_round_trip() {
        for (text, mode) in [
            ("php", Mode::Php),
            ("shadow", Mode::Shadow),
            ("rust", Mode::Rust),
            ("canary:0", Mode::Canary(0)),
            ("canary:10", Mode::Canary(10)),
            ("canary:100", Mode::Canary(100)),
        ] {
            assert_eq!(text.parse::<Mode>(), Ok(mode));
            assert_eq!(mode.to_string(), text);
        }
    }

    #[test]
    fn invalid_modes_are_rejected() {
        for text in [
            "",
            "PHP",
            "canary",
            "canary:",
            "canary:101",
            "canary:-1",
            "canary:+5",
            "canary:5%",
            "canary:256",
            "rust ",
        ] {
            assert!(text.parse::<Mode>().is_err(), "`{text}` should be rejected");
        }
    }

    #[test]
    fn mode_labels_ignore_the_canary_percentage() {
        assert_eq!(Mode::Canary(10).label(), "canary");
        assert_eq!(Mode::Canary(90).label(), "canary");
    }

    #[test]
    fn exact_paths_match_only_themselves() {
        let pattern = PathPattern::parse("/status.php").unwrap();
        assert!(pattern.matches("/status.php"));
        assert!(!pattern.matches("/status.php/"));
        assert!(!pattern.matches("/status.php/x"));
        assert!(!pattern.matches("/status"));
        assert!(!pattern.matches("status.php"));
    }

    #[test]
    fn trailing_wildcard_matches_prefix_and_descendants() {
        let pattern = PathPattern::parse("/remote.php/dav/*").unwrap();
        assert!(pattern.matches("/remote.php/dav"));
        assert!(pattern.matches("/remote.php/dav/"));
        assert!(pattern.matches("/remote.php/dav/files/admin/a.txt"));
        assert!(!pattern.matches("/remote.php/davx"));
        assert!(!pattern.matches("/remote.php"));
    }

    #[test]
    fn root_wildcard_matches_everything_and_root_matches_only_root() {
        let all = PathPattern::parse("/*").unwrap();
        assert!(all.matches("/"));
        assert!(all.matches("/index.php/apps/files"));
        let root = PathPattern::parse("/").unwrap();
        assert!(root.matches("/"));
        assert!(!root.matches("/index.php"));
    }

    #[test]
    fn parameters_match_one_non_empty_segment() {
        let pattern = PathPattern::parse("/statuses/{userId}").unwrap();
        assert!(pattern.matches("/statuses/alice"));
        assert!(!pattern.matches("/statuses/"));
        assert!(!pattern.matches("/statuses"));
        assert!(!pattern.matches("/statuses/alice/extra"));
    }

    #[test]
    fn matching_uses_the_raw_percent_encoded_path() {
        let pattern = PathPattern::parse("/files/{name}").unwrap();
        assert!(pattern.matches("/files/a%2Fb"));
        assert!(!pattern.matches("/files/a/b"));
    }

    #[test]
    fn invalid_patterns_are_rejected() {
        for source in [
            "status.php",
            "",
            "/a/*/b",
            "/a/{}",
            "/a/{x y}",
            "/a/pre{x}",
            "/a/b*",
            "/a/{x",
        ] {
            assert!(
                PathPattern::parse(source).is_err(),
                "`{source}` should be rejected"
            );
        }
    }

    #[test]
    fn unmatched_requests_have_no_route() {
        let table = table("[[route]]\npath = \"/status.php\"\nmode = \"rust\"\n");
        assert_eq!(lookup_id(&table, "GET", "/index.php"), None);
        assert_eq!(RouteTable::default().lookup(&Method::GET, "/"), None);
    }

    #[test]
    fn exact_beats_prefix_regardless_of_declaration_order() {
        let table = table(
            r#"
            [[route]]
            id = "all"
            path = "/*"
            mode = "php"
            [[route]]
            id = "status"
            path = "/status.php"
            mode = "rust"
            [[route]]
            id = "all-again"
            path = "/*"
            methods = ["GET"]
            mode = "php"
            "#,
        );
        assert_eq!(lookup_id(&table, "GET", "/status.php"), Some("status"));
    }

    #[test]
    fn longer_prefix_beats_shorter_prefix() {
        let table = table(
            r#"
            [[route]]
            id = "ocs"
            path = "/ocs/*"
            mode = "php"
            [[route]]
            id = "user_status"
            path = "/ocs/v2.php/apps/user_status/*"
            mode = "shadow"
            "#,
        );
        assert_eq!(
            lookup_id(
                &table,
                "GET",
                "/ocs/v2.php/apps/user_status/api/v1/statuses"
            ),
            Some("user_status")
        );
        assert_eq!(
            lookup_id(&table, "GET", "/ocs/v2.php/cloud/user"),
            Some("ocs")
        );
    }

    #[test]
    fn literal_beats_parameter_at_the_same_depth() {
        let table = table(
            r#"
            [[route]]
            id = "param"
            path = "/statuses/{userId}"
            mode = "php"
            [[route]]
            id = "literal"
            path = "/statuses/predefined"
            mode = "rust"
            "#,
        );
        assert_eq!(
            lookup_id(&table, "GET", "/statuses/predefined"),
            Some("literal")
        );
        assert_eq!(lookup_id(&table, "GET", "/statuses/alice"), Some("param"));
    }

    #[test]
    fn method_restriction_breaks_ties_between_identical_paths() {
        let table = table(
            r#"
            [[route]]
            id = "any"
            path = "/status.php"
            mode = "php"
            [[route]]
            id = "get-only"
            path = "/status.php"
            methods = ["get", "head"]
            mode = "rust"
            "#,
        );
        assert_eq!(lookup_id(&table, "GET", "/status.php"), Some("get-only"));
        assert_eq!(lookup_id(&table, "HEAD", "/status.php"), Some("get-only"));
        assert_eq!(lookup_id(&table, "POST", "/status.php"), Some("any"));
    }

    #[test]
    fn path_specificity_beats_method_restriction() {
        let table = table(
            r#"
            [[route]]
            id = "dav-get"
            path = "/remote.php/*"
            methods = ["GET"]
            mode = "php"
            [[route]]
            id = "dav-files"
            path = "/remote.php/dav/files/*"
            mode = "shadow"
            "#,
        );
        assert_eq!(
            lookup_id(&table, "GET", "/remote.php/dav/files/admin"),
            Some("dav-files")
        );
    }

    #[test]
    fn custom_webdav_methods_match() {
        let table = table(
            r#"
            [[route]]
            id = "propfind"
            path = "/remote.php/dav/*"
            methods = ["PROPFIND", "REPORT"]
            mode = "shadow"
            "#,
        );
        assert_eq!(
            lookup_id(&table, "PROPFIND", "/remote.php/dav/files/a"),
            Some("propfind")
        );
        assert_eq!(lookup_id(&table, "PUT", "/remote.php/dav/files/a"), None);
    }

    #[test]
    fn declaration_order_resolves_equal_specificity() {
        let table = table(
            r#"
            [[route]]
            id = "first"
            path = "/a/{x}"
            mode = "php"
            [[route]]
            id = "second"
            path = "/a/{y}"
            mode = "rust"
            "#,
        );
        assert_eq!(lookup_id(&table, "GET", "/a/1"), Some("first"));
    }

    #[test]
    fn default_ids_are_derived_from_methods_and_path() {
        let table = table(
            r#"
            [[route]]
            path = "/status.php"
            mode = "php"
            [[route]]
            path = "/status.php"
            methods = ["head", "get"]
            mode = "php"
            "#,
        );
        let ids: Vec<&str> = table.routes().iter().map(|r| r.id.as_str()).collect();
        assert_eq!(ids, ["/status.php", "GET|HEAD /status.php"]);
    }

    #[test]
    fn kill_switch_is_read_from_the_gateway_section() {
        assert!(!table("").kill_switch());
        assert!(table("[gateway]\nkill_switch = true\n").kill_switch());
    }

    #[test]
    fn invalid_tables_name_the_offending_route() {
        let cases = [
            (
                "[[route]]\npath = \"/a\"\nmode = \"bogus\"\n",
                "unknown mode",
            ),
            (
                "[[route]]\npath = \"a\"\nmode = \"php\"\n",
                "must start with",
            ),
            (
                "[[route]]\npath = \"/a\"\nmethods = []\nmode = \"php\"\n",
                "must not be empty",
            ),
            (
                "[[route]]\npath = \"/a\"\nmethods = [\"GE T\"]\nmode = \"php\"\n",
                "invalid method",
            ),
            (
                "[[route]]\npath = \"/a\"\nmode = \"php\"\nmoed = \"rust\"\n",
                "unknown field",
            ),
            ("[gatewey]\nkill_switch = true\n", "unknown field"),
            ("[[route]]\npath = \"/a\"\n", "missing field"),
            (
                "[[route]]\nid = \"\"\npath = \"/a\"\nmode = \"php\"\n",
                "must not be empty",
            ),
        ];
        for (source, expected) in cases {
            let error = RouteTable::parse(source).expect_err(source).to_string();
            assert!(
                error.contains(expected),
                "`{error}` should contain `{expected}`"
            );
        }
    }

    #[test]
    fn duplicate_ids_and_duplicate_shapes_are_rejected() {
        let duplicate_id = RouteTable::parse(
            "[[route]]\nid = \"x\"\npath = \"/a\"\nmode = \"php\"\n[[route]]\nid = \"x\"\npath = \"/b\"\nmode = \"php\"\n",
        );
        assert_eq!(
            duplicate_id,
            Err(RouteTableError::DuplicateId("x".to_owned()))
        );

        let duplicate_shape = RouteTable::parse(
            "[[route]]\nid = \"x\"\npath = \"/a\"\nmethods = [\"GET\", \"HEAD\"]\nmode = \"php\"\n[[route]]\nid = \"y\"\npath = \"/a\"\nmethods = [\"head\", \"get\"]\nmode = \"rust\"\n",
        );
        assert_eq!(
            duplicate_shape,
            Err(RouteTableError::DuplicateRoute("y".to_owned()))
        );
    }
}
