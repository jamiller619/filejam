use std::fs::Metadata;
use std::path::Path;

/// Classify without another metadata read; enumeration already obtained it.
pub fn classify(path: &Path, name: &str, metadata: &Metadata) -> (bool, bool) {
    let mut hidden = name.starts_with('.');
    let mut system = false;

    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        let attributes = metadata.file_attributes();
        hidden |= attributes & 0x2 != 0; // FILE_ATTRIBUTE_HIDDEN
        system |= attributes & 0x4 != 0; // FILE_ATTRIBUTE_SYSTEM
    }
    #[cfg(target_os = "macos")]
    {
        use std::os::macos::fs::MetadataExt;
        hidden |= metadata.st_flags() & 0x8000 != 0; // UF_HIDDEN
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    let _ = metadata;

    system |= system_name(name, path.parent().is_some_and(volume_root));
    (hidden, system)
}

fn volume_root(path: &Path) -> bool {
    if path.parent().is_none() {
        return true;
    }

    // macOS mounts additional volumes here. Do not classify ordinary nested names.
    cfg!(target_os = "macos") && path.parent() == Some(Path::new("/Volumes"))
}

fn system_name(name: &str, at_volume_root: bool) -> bool {
    if cfg!(windows) && name.eq_ignore_ascii_case("desktop.ini") {
        return true;
    }
    if !at_volume_root {
        return false;
    }

    let name = name.to_ascii_lowercase();
    matches!(
        name.as_str(),
        "$recycle.bin"
            | ".fseventsd"
            | ".spotlight-v100"
            | ".trashes"
            | "system volume information"
            | "msdownld.tmp"
    ) || name
        .strip_prefix("found.")
        .is_some_and(|suffix| suffix.len() == 3 && suffix.bytes().all(|byte| byte.is_ascii_digit()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn system_names_are_scoped_to_volume_roots() {
        for name in [
            "$RECYCLE.BIN",
            ".fseventsd",
            ".Spotlight-V100",
            ".Trashes",
            "FOUND.000",
            "msdownld.tmp",
            "System Volume Information",
        ] {
            assert!(system_name(name, true), "{name}");
            assert!(!system_name(name, false), "{name}");
        }
        assert!(!system_name("FOUND.notes", true));
        assert!(!system_name("normal", true));
        assert_eq!(system_name("desktop.ini", false), cfg!(windows));
    }

    #[test]
    fn dotfiles_are_hidden_but_not_automatically_system_items() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join(".config");
        std::fs::write(&path, "").unwrap();
        assert_eq!(
            classify(&path, ".config", &std::fs::symlink_metadata(&path).unwrap()),
            (true, false)
        );
    }

    #[cfg(windows)]
    #[test]
    fn windows_attributes_classify_files_without_special_names() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("ordinary.txt");
        std::fs::write(&path, "").unwrap();
        assert!(
            std::process::Command::new("attrib")
                .args(["+H", "+S"])
                .arg(&path)
                .status()
                .unwrap()
                .success()
        );
        assert_eq!(
            classify(
                &path,
                "ordinary.txt",
                &std::fs::symlink_metadata(&path).unwrap()
            ),
            (true, true)
        );
        assert!(
            std::process::Command::new("attrib")
                .args(["-H", "-S"])
                .arg(&path)
                .status()
                .unwrap()
                .success()
        );
    }
}
