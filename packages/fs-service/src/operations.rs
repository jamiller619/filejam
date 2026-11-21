//! Small serialized mutation worker, separate from interactive directory readers.
use std::io::{self, BufReader, BufWriter, Write};
use std::path::Path;

use serde::Deserialize;

use crate::line_reader::read_frame;

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
enum OperationRequest {
    Move {
        source: String,
        target: String,
    },
    TrashSnapshot {
        sources: Vec<String>,
    },
    Trash {
        sources: Vec<String>,
        before: Vec<String>,
    },
    FindTrash {
        sources: Vec<String>,
        before: Vec<String>,
    },
    RestoreTrash {
        reference: crate::trash::TrashReference,
    },
}

pub fn run() -> io::Result<()> {
    let mut input = BufReader::new(io::stdin().lock());
    let mut output = BufWriter::new(io::stdout().lock());

    while let Some(frame) =
        read_frame(&mut input).map_err(|error| io::Error::other(error.message))?
    {
        let request: OperationRequest = serde_json::from_slice(&frame)?;
        let response = match request {
            OperationRequest::Move { source, target } => {
                let result = if !Path::new(&source).is_absolute()
                    || !Path::new(&target).is_absolute()
                    || source.contains('\0')
                    || target.contains('\0')
                {
                    Err(io::Error::new(
                        io::ErrorKind::InvalidInput,
                        "absolute paths required",
                    ))
                } else {
                    move_exclusive(Path::new(&source), Path::new(&target))
                };
                match result {
                    Ok(()) => serde_json::json!({ "ok": true }),
                    Err(error) => {
                        let code = match error.kind() {
                            io::ErrorKind::AlreadyExists => "EEXIST",
                            io::ErrorKind::CrossesDevices => "EXDEV",
                            io::ErrorKind::NotFound => "ENOENT",
                            io::ErrorKind::PermissionDenied => "EACCES",
                            _ => "EIO",
                        };
                        serde_json::json!({ "ok": false, "code": code, "error": error.to_string() })
                    }
                }
            }
            OperationRequest::TrashSnapshot { sources } => {
                trash_response(crate::trash::snapshot(&sources))
            }
            OperationRequest::Trash { sources, before } => {
                trash_response(crate::trash::recycle(&sources, &before))
            }
            OperationRequest::FindTrash { sources, before } => {
                trash_response(crate::trash::find(&sources, &before))
            }
            OperationRequest::RestoreTrash { reference } => {
                trash_response(crate::trash::restore(reference))
            }
        };

        serde_json::to_writer(&mut output, &response)?;
        output.write_all(b"\n")?;
        output.flush()?;
    }

    Ok(())
}

fn trash_response<T: serde::Serialize>(result: Result<T, String>) -> serde_json::Value {
    match result {
        Ok(data) => serde_json::json!({ "ok": true, "data": data }),
        Err(error) => serde_json::json!({ "ok": false, "code": "ETRASH", "error": error }),
    }
}

#[cfg(windows)]
pub fn move_exclusive(source: &Path, target: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn MoveFileExW(source: *const u16, target: *const u16, flags: u32) -> i32;
    }

    let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let target: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();

    // Zero flags deliberately excludes MOVEFILE_REPLACE_EXISTING and COPY_ALLOWED.
    if unsafe { MoveFileExW(source.as_ptr(), target.as_ptr(), 0) } == 0 {
        return Err(io::Error::last_os_error());
    }

    Ok(())
}

#[cfg(target_os = "linux")]
pub fn move_exclusive(source: &Path, target: &Path) -> io::Result<()> {
    use std::ffi::{CString, c_char};
    use std::os::unix::ffi::OsStrExt;

    unsafe extern "C" {
        fn renameat2(
            old_dir: i32,
            old: *const c_char,
            new_dir: i32,
            new: *const c_char,
            flags: u32,
        ) -> i32;
    }

    let source = CString::new(source.as_os_str().as_bytes())?;
    let target = CString::new(target.as_os_str().as_bytes())?;

    if unsafe { renameat2(-100, source.as_ptr(), -100, target.as_ptr(), 1) } != 0 {
        return Err(io::Error::last_os_error());
    }

    Ok(())
}

#[cfg(target_os = "macos")]
pub fn move_exclusive(source: &Path, target: &Path) -> io::Result<()> {
    use std::ffi::{CString, c_char};
    use std::os::unix::ffi::OsStrExt;

    unsafe extern "C" {
        fn renamex_np(old: *const c_char, new: *const c_char, flags: u32) -> i32;
    }

    let source = CString::new(source.as_os_str().as_bytes())?;
    let target = CString::new(target.as_os_str().as_bytes())?;

    if unsafe { renamex_np(source.as_ptr(), target.as_ptr(), 4) } != 0 {
        return Err(io::Error::last_os_error());
    }

    Ok(())
}

#[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
pub fn move_exclusive(_source: &Path, _target: &Path) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "exclusive moves unsupported on this platform",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn never_replaces_files_or_folders() {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("source");
        let target = root.path().join("target");
        fs::write(&source, "source").unwrap();
        fs::write(&target, "target").unwrap();
        assert!(move_exclusive(&source, &target).is_err());
        assert_eq!(fs::read_to_string(&source).unwrap(), "source");
        assert_eq!(fs::read_to_string(&target).unwrap(), "target");

        let folder = root.path().join("folder");
        let existing = root.path().join("existing");
        fs::create_dir(&folder).unwrap();
        fs::create_dir(&existing).unwrap();
        assert!(move_exclusive(&folder, &existing).is_err());
        assert!(folder.is_dir());
        assert!(existing.is_dir());
    }

    #[test]
    fn moves_files_and_folders() {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("source");
        let target = root.path().join("target");
        fs::create_dir(&source).unwrap();
        fs::write(source.join("file"), "bytes").unwrap();
        move_exclusive(&source, &target).unwrap();
        assert!(!source.exists());
        assert_eq!(fs::read_to_string(target.join("file")).unwrap(), "bytes");
    }
}
