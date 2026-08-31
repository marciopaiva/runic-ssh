//! Listing a local directory, for the SFTP panel's own side. ADR-0043.
//!
//! Unlike `sftp::path`, nothing here defends against a hostile name: a path
//! given to this module is the user's own, on their own machine, never a
//! name a remote server chose. What this module refuses is a path that
//! is not a real, readable directory, nothing more.

use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum LocalError {
    #[error("the directory does not exist")]
    NotFound,
    #[error("the path is not a directory")]
    NotADirectory,
    #[error("the operating system refused to read it")]
    PermissionDenied,
    #[error("the local filesystem refused the operation")]
    Io,
}

impl From<std::io::Error> for LocalError {
    fn from(error: std::io::Error) -> Self {
        match error.kind() {
            std::io::ErrorKind::NotFound => Self::NotFound,
            std::io::ErrorKind::PermissionDenied => Self::PermissionDenied,
            _ => Self::Io,
        }
    }
}

/// One local directory entry.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LocalEntry {
    pub name: String,
    pub path: PathBuf,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: u64,
    pub modified_unix_secs: Option<i64>,
}

/// A listing: the directory's own entries, resolved names for what is
/// showing and what is above it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Listing {
    pub path: PathBuf,
    pub parent: Option<PathBuf>,
    pub entries: Vec<LocalEntry>,
}

/// Lists `path`, refusing anything that is not a real, readable directory.
///
/// Entries are sorted directories first, then alphabetically within each
/// group: the shape a person expects from a file manager, and one this
/// module can guarantee since it is not, unlike a remote SFTP listing,
/// working from an order a hostile party chose.
pub fn list(path: &Path) -> Result<Listing, LocalError> {
    let metadata = fs::metadata(path)?;
    if !metadata.is_dir() {
        return Err(LocalError::NotADirectory);
    }

    let mut entries = Vec::new();
    for item in fs::read_dir(path)? {
        let item = item?;
        let file_type = item.file_type()?;
        let item_metadata = item.metadata()?;

        entries.push(LocalEntry {
            name: item.file_name().to_string_lossy().into_owned(),
            path: item.path(),
            is_dir: file_type.is_dir(),
            is_symlink: file_type.is_symlink(),
            size: item_metadata.len(),
            modified_unix_secs: item_metadata.modified().ok().and_then(|time| {
                time.duration_since(std::time::UNIX_EPOCH)
                    .ok()
                    .map(|elapsed| elapsed.as_secs() as i64)
            }),
        });
    }

    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(Listing {
        path: path.to_path_buf(),
        parent: path.parent().map(Path::to_path_buf),
        entries,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(dir: &Path, name: &str, contents: &[u8]) {
        fs::write(dir.join(name), contents).expect("writes the fixture");
    }

    #[test]
    fn lists_files_and_directories() {
        let dir = tempfile::tempdir().expect("a scratch directory");
        write(dir.path(), "b.txt", b"hello");
        fs::create_dir(dir.path().join("a-dir")).expect("creates a subdirectory");

        let listing = list(dir.path()).expect("lists");
        let names: Vec<&str> = listing.entries.iter().map(|e| e.name.as_str()).collect();

        assert_eq!(names, ["a-dir", "b.txt"], "directories sort before files");
        assert!(listing.entries[0].is_dir);
        assert!(!listing.entries[1].is_dir);
        assert_eq!(listing.entries[1].size, 5);
    }

    #[test]
    fn the_parent_is_named_unless_this_is_the_root() {
        let dir = tempfile::tempdir().expect("a scratch directory");
        let listing = list(dir.path()).expect("lists");
        assert_eq!(listing.parent.as_deref(), dir.path().parent());
    }

    #[test]
    fn an_absent_path_is_a_typed_not_found() {
        let dir = tempfile::tempdir().expect("a scratch directory");
        let missing = dir.path().join("does-not-exist");

        assert_eq!(list(&missing), Err(LocalError::NotFound));
    }

    #[test]
    fn a_file_is_refused_as_not_a_directory() {
        let dir = tempfile::tempdir().expect("a scratch directory");
        let file = dir.path().join("plain.txt");
        write(dir.path(), "plain.txt", b"x");

        assert_eq!(list(&file), Err(LocalError::NotADirectory));
    }

    #[test]
    fn entries_within_one_kind_are_case_insensitively_alphabetical() {
        let dir = tempfile::tempdir().expect("a scratch directory");
        for name in ["Banana.txt", "apple.txt", "Cherry.txt"] {
            write(dir.path(), name, b"x");
        }

        let listing = list(dir.path()).expect("lists");
        let names: Vec<&str> = listing.entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, ["apple.txt", "Banana.txt", "Cherry.txt"]);
    }
}
