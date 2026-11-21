#[cfg(not(target_os = "macos"))]
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TrashReference {
    pub id: String,
    pub name: String,
    pub original_parent: String,
    pub time_deleted: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashOutcome {
    source: String,
    reference: Option<TrashReference>,
    error: Option<String>,
}

#[cfg(not(target_os = "macos"))]
fn path_key(path: &Path) -> String {
    let value = path.to_string_lossy().into_owned();

    #[cfg(windows)]
    {
        if let Some(unc) = value.strip_prefix(r"\\?\UNC\") {
            return format!(r"\\{unc}").to_lowercase();
        }

        value.strip_prefix(r"\\?\").unwrap_or(&value).to_lowercase()
    }

    #[cfg(not(windows))]
    {
        value
    }
}

#[cfg(not(target_os = "macos"))]
fn source_key(path: &Path) -> String {
    let canonical = path
        .parent()
        .and_then(|parent| parent.canonicalize().ok())
        .zip(path.file_name())
        .map(|(parent, name)| parent.join(name));

    path_key(canonical.as_deref().unwrap_or(path))
}

fn validate_sources(sources: &[String]) -> Result<(), String> {
    if sources.is_empty()
        || sources.iter().any(|source| {
            !Path::new(source).is_absolute()
                || source.contains('\0')
                || Path::new(source).parent().is_none()
        })
    {
        return Err("Trash requires absolute non-root paths".into());
    }

    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn matching(sources: &[String]) -> Result<Vec<trash::TrashItem>, String> {
    validate_sources(sources)?;
    let paths: HashSet<_> = sources
        .iter()
        .map(|source| source_key(Path::new(source)))
        .collect();

    Ok(trash::os_limited::list()
        .map_err(|error| error.to_string())?
        .into_iter()
        .filter(|item| paths.contains(&path_key(&item.original_path())))
        .collect())
}

/// Snapshot only matching identities, never copies of the user's data.
pub fn snapshot(sources: &[String]) -> Result<Vec<String>, String> {
    validate_sources(sources)?;

    #[cfg(not(target_os = "macos"))]
    {
        matching(sources)?
            .into_iter()
            .map(|item| {
                item.id
                    .into_string()
                    .map_err(|_| "Trash identity is not valid Unicode".into())
            })
            .collect()
    }

    #[cfg(target_os = "macos")]
    {
        Ok(Vec::new())
    }
}

pub fn recycle(sources: &[String], before: &[String]) -> Result<Vec<TrashOutcome>, String> {
    validate_sources(sources)?;
    let error = trash::delete_all(sources)
        .err()
        .map(|error| error.to_string());
    let mut outcomes = find(sources, before)?;

    if let Some(error) = error {
        for outcome in &mut outcomes {
            if outcome.reference.is_none() && outcome.error.is_some() {
                outcome.error = Some(error.clone());
            }
        }
    }

    Ok(outcomes)
}

/// Reconcile an interrupted request without deleting or moving anything again.
pub fn find(sources: &[String], before: &[String]) -> Result<Vec<TrashOutcome>, String> {
    validate_sources(sources)?;

    #[cfg(not(target_os = "macos"))]
    {
        let excluded: HashSet<_> = before.iter().map(String::as_str).collect();
        let mut grouped: HashMap<String, Vec<trash::TrashItem>> = HashMap::new();

        for item in matching(sources)? {
            if !excluded.contains(item.id.to_string_lossy().as_ref()) {
                grouped
                    .entry(path_key(&item.original_path()))
                    .or_default()
                    .push(item);
            }
        }

        sources.iter().map(|source| {
            let candidates = grouped.get(&source_key(Path::new(source)));
            let reference = match candidates.map(Vec::as_slice) {
                Some([item]) => Some(TrashReference {
                    id: item.id.to_str().ok_or("Invalid trash identity")?.into(),
                    name: item.name.to_str().ok_or("Invalid trash filename")?.into(),
                    original_parent: item.original_parent.to_str().ok_or("Invalid trash path")?.into(),
                    time_deleted: item.time_deleted,
                }),
                _ => None,
            };
            let missing = matches!(Path::new(source).symlink_metadata(), Err(error) if error.kind() == std::io::ErrorKind::NotFound);
            let error = if reference.is_some() && missing {
                None
            } else {
                Some("Could not prove this item's native trash identity. Inspect the original path and OS trash before retrying.".into())
            };

            Ok(TrashOutcome { source: source.clone(), reference, error })
        }).collect()
    }

    #[cfg(target_os = "macos")]
    {
        let _ = before;
        Ok(sources
            .iter()
            .map(|source| TrashOutcome {
                source: source.clone(),
                reference: None,
                error: Path::new(source)
                    .symlink_metadata()
                    .ok()
                    .map(|_| "Item remains at its original location".into()),
            })
            .collect())
    }
}

pub fn restore(reference: TrashReference) -> Result<(), String> {
    if reference.id.is_empty()
        || !Path::new(&reference.original_parent).is_absolute()
        || Path::new(&reference.name).file_name() != Some(std::ffi::OsStr::new(&reference.name))
    {
        return Err("Invalid native trash restore reference".into());
    }

    let original = PathBuf::from(&reference.original_parent).join(&reference.name);

    if original.symlink_metadata().is_ok() {
        return Err(format!(
            "Restore destination already exists: {}",
            original.display()
        ));
    }

    #[cfg(not(target_os = "macos"))]
    {
        let item = trash::TrashItem {
            id: reference.id.into(),
            name: reference.name.into(),
            original_parent: reference.original_parent.into(),
            time_deleted: reference.time_deleted,
        };
        trash::os_limited::restore_all([item]).map_err(|error| error.to_string())?;

        if original.symlink_metadata().is_err() {
            return Err(
                "The OS did not restore the item. It may have been removed from the trash.".into(),
            );
        }

        Ok(())
    }

    #[cfg(target_os = "macos")]
    {
        Err("Restore this item using Finder's Put Back command".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_sources_before_accessing_os_trash() {
        assert!(snapshot(&[]).is_err());
        assert!(recycle(&["relative".into()], &[]).is_err());
        assert!(find(&[String::new()], &[]).is_err());
    }

    #[test]
    fn refuses_restore_over_an_existing_entry() {
        let root = tempfile::tempdir().unwrap();
        let file = root.path().join("file.txt");
        std::fs::write(&file, "keep").unwrap();
        let reference = TrashReference {
            id: "unused".into(),
            name: "file.txt".into(),
            original_parent: root.path().to_str().unwrap().into(),
            time_deleted: 0,
        };
        assert!(restore(reference).unwrap_err().contains("already exists"));
        assert_eq!(std::fs::read_to_string(file).unwrap(), "keep");
    }
}
