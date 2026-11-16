use std::fs;
use std::path::{Component, Path};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;

use crate::protocol::{
    Entry, EntryKind, ErrorCode, Metrics, ServiceError, ViewOptions, validate_path_syntax,
};
use crate::view::apply_view;

#[cfg(windows)]
use std::os::windows::fs::MetadataExt;

#[cfg(windows)]
const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
const MAX_PATH_BYTES: usize = 32_768;

#[derive(Debug)]
pub struct PreparedListing {
    pub path: String,
    pub parent_path: Option<String>,
    pub entries: Vec<Entry>,
    pub metrics: Metrics,
}

#[derive(Debug)]
pub enum PrepareError {
    Error(ServiceError),
    Cancelled,
}

pub fn prepare_listing(
    path: &str,
    options: &ViewOptions,
    cancelled: &AtomicBool,
    limit: usize,
) -> Result<PreparedListing, PrepareError> {
    check_cancelled(cancelled)?;

    let (canonical_path, parent_path) = validate_directory(path).map_err(PrepareError::Error)?;
    let enumeration_started = Instant::now();
    let mut entries = Vec::new();
    let children = fs::read_dir(&canonical_path)
        .map_err(io_error)
        .map_err(PrepareError::Error)?;

    for child in children {
        check_cancelled(cancelled)?;

        let child = child.map_err(io_error).map_err(PrepareError::Error)?;
        let child_path = child.path();
        let child_path_string = child_path.to_str().ok_or_else(|| {
            PrepareError::Error(unsupported_path("entry path is not valid Unicode"))
        })?;
        if child_path_string.len() > MAX_PATH_BYTES {
            return Err(PrepareError::Error(unsupported_path(
                "entry path is too long",
            )));
        }

        let name = child.file_name().into_string().map_err(|_| {
            PrepareError::Error(unsupported_path("entry name is not valid Unicode"))
        })?;
        let metadata = fs::symlink_metadata(&child_path)
            .map_err(io_error)
            .map_err(PrepareError::Error)?;
        let kind = classify_entry(&metadata);

        if entries.len() >= limit {
            return Err(PrepareError::Error(ServiceError {
                code: ErrorCode::LimitExceeded,
                message: "directory entry limit exceeded".to_owned(),
            }));
        }

        entries.push(Entry {
            path: child_path_string.to_owned(),
            name,
            kind,
        });
    }

    let enumeration_ms = enumeration_started.elapsed().as_secs_f64() * 1000.0;
    check_cancelled(cancelled)?;

    let filter_sort_started = Instant::now();
    let entries = apply_view(entries, options);
    check_cancelled(cancelled)?;
    let filter_sort_ms = filter_sort_started.elapsed().as_secs_f64() * 1000.0;

    Ok(PreparedListing {
        path: canonical_path,
        parent_path,
        entries,
        metrics: Metrics {
            enumeration_ms,
            filter_sort_ms,
        },
    })
}

fn check_cancelled(cancelled: &AtomicBool) -> Result<(), PrepareError> {
    if cancelled.load(Ordering::Relaxed) {
        return Err(PrepareError::Cancelled);
    }

    Ok(())
}

fn classify_entry(metadata: &fs::Metadata) -> EntryKind {
    #[cfg(windows)]
    if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
        return EntryKind::Symlink;
    }

    let file_type = metadata.file_type();
    if file_type.is_symlink() {
        EntryKind::Symlink
    } else if file_type.is_dir() {
        EntryKind::Directory
    } else if file_type.is_file() {
        EntryKind::File
    } else {
        EntryKind::Other
    }
}

pub fn validate_directory(path: &str) -> Result<(String, Option<String>), ServiceError> {
    validate_path_syntax(path)?;

    let input = Path::new(path);
    let mut current = Path::new("").to_path_buf();
    let mut rooted = false;

    for component in input.components() {
        match component {
            Component::Prefix(prefix) => current.push(prefix.as_os_str()),
            Component::RootDir => {
                current.push(component.as_os_str());
                rooted = true;
                continue;
            }
            Component::CurDir => continue,
            Component::Normal(name) => current.push(name),
            Component::ParentDir => unreachable!("path syntax validation rejects parent traversal"),
        }

        if !rooted && cfg!(windows) {
            continue;
        }

        match fs::symlink_metadata(&current) {
            Ok(metadata) => {
                #[cfg(windows)]
                if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
                    return Err(unsupported_path(
                        "reparse point components are not supported",
                    ));
                }

                #[cfg(unix)]
                if metadata.file_type().is_symlink() {
                    return Err(unsupported_path(
                        "symbolic link components are not supported",
                    ));
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Err(io_error(error));
            }
            Err(error) => return Err(io_error(error)),
        }
    }

    let canonical = fs::canonicalize(input).map_err(io_error)?;
    let metadata = fs::metadata(&canonical).map_err(io_error)?;
    if !metadata.is_dir() {
        return Err(ServiceError {
            code: ErrorCode::NotDirectory,
            message: "path is not a directory".to_owned(),
        });
    }

    let canonical_path = canonical
        .to_str()
        .ok_or_else(|| unsupported_path("path is not valid Unicode"))?
        .to_owned();
    let parent_path = canonical
        .parent()
        .map(|parent| {
            parent
                .to_str()
                .map(str::to_owned)
                .ok_or_else(|| unsupported_path("parent path is not valid Unicode"))
        })
        .transpose()?;

    Ok((canonical_path, parent_path))
}

fn unsupported_path(message: &str) -> ServiceError {
    ServiceError {
        code: ErrorCode::UnsupportedPath,
        message: message.to_owned(),
    }
}

fn io_error(error: std::io::Error) -> ServiceError {
    let code = match error.kind() {
        std::io::ErrorKind::NotFound => ErrorCode::NotFound,
        std::io::ErrorKind::PermissionDenied => ErrorCode::PermissionDenied,
        std::io::ErrorKind::NotADirectory => ErrorCode::NotDirectory,
        _ => ErrorCode::IoError,
    };

    ServiceError {
        code,
        message: error.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::{PrepareError, prepare_listing, validate_directory};
    use crate::protocol::{ErrorCode, KindFilter, ServiceError, SortDirection, ViewOptions};
    use std::sync::atomic::AtomicBool;

    fn all_options() -> ViewOptions {
        ViewOptions {
            name_contains: String::new(),
            kind: KindFilter::All,
            sort_direction: SortDirection::Asc,
        }
    }

    #[test]
    fn rejects_invalid_path_syntax() {
        for path in [
            "C:folder",
            "relative",
            "\\\\.\\C:\\",
            "C:\\bad\0path",
            "C:\\one\\..\\two",
        ] {
            assert!(validate_directory(path).is_err(), "accepted {path:?}");
        }
    }

    #[test]
    fn canonical_directory_has_a_parent() {
        let directory = tempfile::tempdir().unwrap();
        let input = directory.path().to_str().unwrap();
        let (canonical, parent) = validate_directory(input).unwrap();

        assert_eq!(
            canonical,
            directory.path().canonicalize().unwrap().to_str().unwrap()
        );
        assert_eq!(
            parent.as_deref(),
            directory
                .path()
                .canonicalize()
                .unwrap()
                .parent()
                .unwrap()
                .to_str()
        );
        assert_eq!(validate_directory(&canonical).unwrap().0, canonical);
    }

    #[test]
    fn file_path_is_not_a_directory() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("file");
        std::fs::write(&file, "contents").unwrap();
        let error = validate_directory(file.to_str().unwrap()).unwrap_err();

        assert!(matches!(error.code, ErrorCode::NotDirectory));
    }

    #[test]
    fn prepares_one_complete_top_level_fixture_listing() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../docs/live-browser-poc/fixtures/view-cases.json"
        ))
        .unwrap();
        let root = tempfile::tempdir().unwrap();
        for name in fixture["directories"].as_array().unwrap() {
            std::fs::create_dir(root.path().join(name.as_str().unwrap())).unwrap();
        }
        for name in fixture["files"].as_array().unwrap() {
            std::fs::write(root.path().join(name.as_str().unwrap()), "fixture").unwrap();
        }
        let nested = fixture["nestedFile"].as_str().unwrap();
        let nested_path = root.path().join(nested);
        std::fs::write(&nested_path, "nested").unwrap();

        let listing = prepare_listing(
            root.path().to_str().unwrap(),
            &all_options(),
            &AtomicBool::new(false),
            250_000,
        )
        .unwrap();
        let names = listing
            .entries
            .iter()
            .map(|entry| entry.name.as_str())
            .collect::<Vec<_>>();

        assert_eq!(listing.entries.len(), 8);
        assert!(names.contains(&".hidden"));
        assert!(names.contains(&"résumé.txt"));
        assert!(
            !listing
                .entries
                .iter()
                .any(|entry| entry.path == nested_path.to_str().unwrap())
        );
        assert!(
            listing.entries.iter().any(|entry| entry.name == "Alpha"
                && entry.kind == crate::protocol::EntryKind::Directory)
        );
    }

    #[test]
    fn preparation_reports_missing_path_and_cancellation() {
        let root = tempfile::tempdir().unwrap();
        let missing = root.path().join("missing");
        let error = prepare_listing(
            missing.to_str().unwrap(),
            &all_options(),
            &AtomicBool::new(false),
            10,
        )
        .unwrap_err();
        assert!(matches!(
            error,
            PrepareError::Error(ServiceError {
                code: ErrorCode::NotFound,
                ..
            })
        ));

        let cancelled = AtomicBool::new(true);
        assert!(matches!(
            prepare_listing(
                root.path().to_str().unwrap(),
                &all_options(),
                &cancelled,
                10
            ),
            Err(PrepareError::Cancelled)
        ));
    }

    #[test]
    fn entry_limit_applies_before_a_nonmatching_filter() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("one"), "").unwrap();
        std::fs::write(root.path().join("two"), "").unwrap();
        std::fs::write(root.path().join("three"), "").unwrap();
        let options = ViewOptions {
            name_contains: "no-entry-can-match".to_owned(),
            ..all_options()
        };

        let error = prepare_listing(
            root.path().to_str().unwrap(),
            &options,
            &AtomicBool::new(false),
            2,
        )
        .unwrap_err();

        assert!(matches!(
            error,
            PrepareError::Error(ServiceError {
                code: ErrorCode::LimitExceeded,
                ..
            })
        ));
    }

    #[test]
    fn io_error_kinds_have_stable_service_codes() {
        use super::io_error;
        use std::io::ErrorKind;

        let cases = [
            (ErrorKind::NotFound, ErrorCode::NotFound),
            (ErrorKind::PermissionDenied, ErrorCode::PermissionDenied),
            (ErrorKind::NotADirectory, ErrorCode::NotDirectory),
            (ErrorKind::Other, ErrorCode::IoError),
        ];

        for (kind, expected) in cases {
            assert!(
                matches!(io_error(std::io::Error::from(kind)).code, code if std::mem::discriminant(&code) == std::mem::discriminant(&expected))
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn symlink_is_classified_without_following_and_creation_may_be_unavailable() {
        use crate::protocol::EntryKind;
        use std::os::unix::fs::symlink;

        let root = tempfile::tempdir().unwrap();
        let target = root.path().join("target");
        std::fs::write(&target, "").unwrap();
        let link = root.path().join("link");
        if symlink(&target, &link).is_err() {
            eprintln!("skipped: symlink creation is unavailable on this filesystem");
            return;
        }

        let listing = prepare_listing(
            root.path().to_str().unwrap(),
            &all_options(),
            &AtomicBool::new(false),
            10,
        )
        .unwrap();
        assert!(
            listing
                .entries
                .iter()
                .any(|entry| entry.name == "link" && entry.kind == EntryKind::Symlink)
        );
    }
}
