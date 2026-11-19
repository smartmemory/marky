use std::{
    fs::{self, File, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

const DISK_CONFLICT: &str = "document_save_conflict";

pub(crate) fn disk_conflicts(expected: &[u8], current: Option<&[u8]>) -> bool {
    current.is_some_and(|current| current != expected)
}

fn check_disk(path: &Path, expected: &[u8]) -> io::Result<()> {
    let current = match fs::read(path) {
        Ok(bytes) => Some(bytes),
        Err(error) if error.kind() == io::ErrorKind::NotFound => None,
        Err(error) => return Err(error),
    };
    if disk_conflicts(expected, current.as_deref()) {
        return Err(io::Error::other(DISK_CONFLICT));
    }
    Ok(())
}

pub(crate) fn write_document(path: &Path, text: &str, expected: Option<&str>) -> io::Result<()> {
    let expected = expected.map(str::as_bytes);
    if let Some(expected) = expected {
        check_disk(path, expected)?;
    }
    atomic_write_with(path, |file| file.write_all(text.as_bytes()), expected)
}

pub(crate) fn atomic_write_with(
    path: &Path,
    write: impl FnOnce(&mut File) -> io::Result<()>,
    expected: Option<&[u8]>,
) -> io::Result<()> {
    let original_permissions = match fs::metadata(path) {
        Ok(metadata) if metadata.is_file() => {
            // Preserve the write-access check of an in-place save without truncating.
            let original = OpenOptions::new().write(true).open(path)?;
            Some(original.metadata()?.permissions())
        }
        Ok(_) => {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Save target is not a regular file",
            ));
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => None,
        Err(error) => return Err(error),
    };
    let (temp_path, mut file) = create_sibling(path, original_permissions.is_some())?;
    let prepared = (|| {
        write(&mut file)?;
        file.sync_all()?;
        if let Some(permissions) = original_permissions {
            file.set_permissions(permissions)?;
        }
        Ok(())
    })();
    drop(file);
    let result = prepared.and_then(|()| {
        // Compare after staging so slow writes do not widen the window before replacement.
        if let Some(expected) = expected {
            check_disk(path, expected)?;
        }
        fs::rename(&temp_path, path)
    });
    if let Err(error) = result {
        if let Err(cleanup) = fs::remove_file(&temp_path) {
            if cleanup.kind() != io::ErrorKind::NotFound {
                return Err(io::Error::new(
                    error.kind(),
                    format!("{error}. Could not remove {}: {cleanup}", temp_path.display()),
                ));
            }
        }
        return Err(error);
    }
    Ok(())
}

fn create_sibling(path: &Path, replacing: bool) -> io::Result<(PathBuf, File)> {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    if replacing {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    loop {
        let sibling = path.with_file_name(format!(
            ".marky-save-{}-{}.tmp",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        // A missing destination can itself be named like a temp file.
        if sibling == path {
            continue;
        }
        match options.open(&sibling) {
            Ok(file) => return Ok((sibling, file)),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
        }
    }
}
