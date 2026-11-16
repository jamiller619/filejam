use serde::{Deserialize, Serialize};
use std::path::{Component, Path, Prefix};

pub const MAX_LINE_BYTES: usize = 1_048_576;
pub const MAX_BATCH_BYTES: usize = 524_288;
pub const MAX_BATCH_ENTRIES: usize = 256;
pub const MAX_ENTRIES: usize = 250_000;
const MAX_FILTER_SCALARS: usize = 1024;
const MAX_PATH_BYTES: usize = 32_768;
const MAX_ERROR_BYTES: usize = 4096;

#[derive(Debug, PartialEq, Eq)]
pub struct ProtocolError {
    pub message: String,
}

impl ProtocolError {
    fn new(message: impl AsRef<str>) -> Self {
        Self {
            message: truncate_utf8(message.as_ref(), MAX_ERROR_BYTES),
        }
    }
}

fn truncate_utf8(value: &str, max_bytes: usize) -> String {
    let mut end = value.len().min(max_bytes);
    while !value.is_char_boundary(end) {
        end -= 1;
    }
    value[..end].to_owned()
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
}

pub fn decode_command(bytes: &[u8]) -> Result<Command, ProtocolError> {
    let command: Command =
        serde_json::from_slice(bytes).map_err(|error| ProtocolError::new(error.to_string()))?;

    match &command {
        Command::List { v, id, .. } | Command::Next { v, id } | Command::Cancel { v, id } => {
            if *v != 1 {
                return Err(ProtocolError::new("unsupported protocol version"));
            }
            if !valid_id(id) {
                return Err(ProtocolError::new("invalid request id"));
            }
        }
        Command::Shutdown { v } => {
            if *v != 1 {
                return Err(ProtocolError::new("unsupported protocol version"));
            }
        }
    }

    Ok(command)
}

pub fn validate_path_syntax(path: &str) -> Result<(), ServiceError> {
    if path.is_empty() || path.as_bytes().contains(&0) || path.len() > MAX_PATH_BYTES {
        return Err(invalid_request(
            "path is empty, contains NUL, or is too long",
        ));
    }

    let mut has_root = false;
    for component in Path::new(path).components() {
        match component {
            Component::Prefix(prefix) => {
                if matches!(prefix.kind(), Prefix::DeviceNS(_)) {
                    return Err(invalid_request("device namespace paths are not allowed"));
                }
            }
            Component::RootDir => has_root = true,
            Component::ParentDir => {
                return Err(invalid_request("parent traversal is not allowed"));
            }
            Component::CurDir | Component::Normal(_) => {}
        }
    }

    if !Path::new(path).is_absolute() || !has_root {
        return Err(invalid_request("path must be fully qualified"));
    }

    Ok(())
}

pub fn validate_list(path: &str, raw: &RawOptions) -> Result<ViewOptions, ServiceError> {
    validate_path_syntax(path)?;

    if raw.name_contains.as_bytes().contains(&0)
        || raw.name_contains.chars().count() > MAX_FILTER_SCALARS
    {
        return Err(invalid_request("nameContains is invalid or too long"));
    }

    let kind = match raw.kind.as_str() {
        "all" => KindFilter::All,
        "file" => KindFilter::File,
        "directory" => KindFilter::Directory,
        _ => return Err(invalid_request("kind must be all, file, or directory")),
    };
    let sort_direction = match raw.sort_direction.as_str() {
        "asc" => SortDirection::Asc,
        "desc" => SortDirection::Desc,
        _ => return Err(invalid_request("sortDirection must be asc or desc")),
    };

    Ok(ViewOptions {
        name_contains: raw.name_contains.clone(),
        kind,
        sort_direction,
    })
}

fn invalid_request(message: &str) -> ServiceError {
    ServiceError {
        code: ErrorCode::InvalidRequest,
        message: truncate_utf8(message, MAX_ERROR_BYTES),
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct RawOptions {
    pub name_contains: String,
    pub kind: String,
    pub sort_direction: String,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase", deny_unknown_fields)]
pub enum Command {
    List {
        v: u8,
        id: String,
        path: String,
        options: RawOptions,
    },
    Next {
        v: u8,
        id: String,
    },
    Cancel {
        v: u8,
        id: String,
    },
    Shutdown {
        v: u8,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    File,
    Directory,
    Symlink,
    Other,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub path: String,
    pub name: String,
    pub kind: EntryKind,
}

#[derive(Clone, Copy, Debug)]
pub enum KindFilter {
    All,
    File,
    Directory,
}

#[derive(Clone, Copy, Debug)]
pub enum SortDirection {
    Asc,
    Desc,
}

#[derive(Clone, Debug)]
pub struct ViewOptions {
    pub name_contains: String,
    pub kind: KindFilter,
    pub sort_direction: SortDirection,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    InvalidRequest,
    NotFound,
    NotDirectory,
    PermissionDenied,
    UnsupportedPath,
    IoError,
    LimitExceeded,
}

#[derive(Debug)]
pub struct ServiceError {
    pub code: ErrorCode,
    pub message: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Metrics {
    pub enumeration_ms: f64,
    pub filter_sort_ms: f64,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Response {
    Ready {
        v: u8,
    },
    Listing {
        v: u8,
        id: String,
        path: String,
        #[serde(rename = "parentPath")]
        parent_path: Option<String>,
        total: usize,
        metrics: Metrics,
    },
    Batch {
        v: u8,
        id: String,
        offset: usize,
        entries: Vec<Entry>,
    },
    Done {
        v: u8,
        id: String,
        total: usize,
    },
    Cancelled {
        v: u8,
        id: String,
    },
    Error {
        v: u8,
        id: String,
        code: ErrorCode,
        message: String,
    },
}

#[cfg(test)]
mod tests {
    use super::{Command, ErrorCode, Metrics, RawOptions, Response, decode_command, validate_list};

    #[test]
    fn ready_uses_wire_fields() {
        let value = serde_json::to_value(Response::Ready { v: 1 }).unwrap();
        assert_eq!(value, serde_json::json!({ "v": 1, "type": "ready" }));
    }

    #[test]
    fn listing_uses_camel_case_fields() {
        let value = serde_json::to_value(Response::Listing {
            v: 1,
            id: "r-1".to_owned(),
            path: "C:\\".to_owned(),
            parent_path: None,
            total: 0,
            metrics: Metrics {
                enumeration_ms: 1.0,
                filter_sort_ms: 2.0,
            },
        })
        .unwrap();

        assert_eq!(value["parentPath"], serde_json::Value::Null);
        assert_eq!(value["metrics"]["filterSortMs"], 2.0);
        assert!(value["metrics"].get("filter_sort_ms").is_none());
    }

    #[test]
    fn io_error_uses_wire_code() {
        assert_eq!(
            serde_json::to_string(&ErrorCode::IoError).unwrap(),
            "\"IO_ERROR\""
        );
    }

    #[test]
    fn command_rejects_unknown_fields() {
        let result =
            serde_json::from_str::<Command>(r#"{"v":1,"type":"next","id":"r-1","extra":true}"#);
        assert!(result.is_err());
    }

    #[test]
    fn decode_checks_version_and_id() {
        assert!(decode_command(br#"{"v":2,"type":"next","id":"r-1"}"#).is_err());
        assert!(decode_command(br#"{"v":1,"type":"next","id":"bad id"}"#).is_err());
        assert!(decode_command(br#"{"v":1,"type":"unknown"}"#).is_err());
        assert!(decode_command(br#"{"v":1,"type":"next","id":"r-1","extra":1}"#).is_err());
        assert!(decode_command(br#"{"v":1,"type":"next"}"#).is_err());
        assert!(decode_command(br#"{"v":"1","type":"next","id":"r-1"}"#).is_err());
        assert!(decode_command(br#"{"v":1,"type":"next","id":"r-1"}"#).is_ok());
    }

    #[test]
    fn filter_limit_counts_unicode_scalars() {
        let options = |name_contains: String| RawOptions {
            name_contains,
            kind: "all".to_owned(),
            sort_direction: "asc".to_owned(),
        };
        assert!(validate_list("C:\\", &options("é".repeat(1024))).is_ok());
        assert!(validate_list("C:\\", &options("é".repeat(1025))).is_err());
        assert!(validate_list("C:\\", &options("x\0y".to_owned())).is_err());
    }

    #[test]
    fn invalid_enum_values_are_argument_errors() {
        let bad_kind = RawOptions {
            name_contains: String::new(),
            kind: "unknown".to_owned(),
            sort_direction: "asc".to_owned(),
        };
        assert!(matches!(
            validate_list("C:\\", &bad_kind).unwrap_err().code,
            ErrorCode::InvalidRequest
        ));

        let bad_direction = RawOptions {
            name_contains: String::new(),
            kind: "all".to_owned(),
            sort_direction: "sideways".to_owned(),
        };
        assert!(matches!(
            validate_list("C:\\", &bad_direction).unwrap_err().code,
            ErrorCode::InvalidRequest
        ));
    }

    #[test]
    fn path_syntax_rejects_relative_and_parent_paths() {
        assert!(super::validate_path_syntax("relative\\folder").is_err());
        assert!(super::validate_path_syntax("C:\\folder\\..\\secret").is_err());
        assert!(super::validate_path_syntax("C:\\folder\0name").is_err());
    }
}
