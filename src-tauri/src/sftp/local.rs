//! Listing a local directory, for the SFTP panel's own side (ADR-0043), and
//! creating, renaming or removing an entry in one (ADR-0048).
//!
//! Unlike `sftp::path`, nothing here defends against a hostile name for an
//! entry already on disk: a path given to this module to *list* is the
//! user's own, on their own machine, never a name a remote server chose.
//! [`create_dir`] and [`rename`] are the one exception: the *new* name they
//! are given is typed into this application's own UI, and `check_name`
//! still runs on it, not because it is hostile but because a text field
//! that is supposed to hold one path segment is not a path field, and a
//! stray `/` typed into it by accident should refuse rather than silently
//! reach somewhere else on disk.

use std::fs;
use std::path::{Path, PathBuf};

use crate::sftp::path::{check_name, PathError};

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
    /// A name meant for [`create_dir`] or [`rename`] failed `check_name`.
    /// ADR-0048.
    #[error("the name was refused: {0}")]
    RefusedName(#[from] PathError),
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

/// Creates a directory named `name` inside `dir`. ADR-0048.
pub fn create_dir(dir: &Path, name: &str) -> Result<PathBuf, LocalError> {
    check_name(name)?;
    let path = dir.join(name);
    fs::create_dir(&path)?;
    Ok(path)
}

/// Renames `old_name` to `new_name`, within `dir`. Never moves an entry to
/// a different directory: this is the pane's "rename" action, not a
/// general move.
pub fn rename(dir: &Path, old_name: &str, new_name: &str) -> Result<PathBuf, LocalError> {
    check_name(new_name)?;
    let new_path = dir.join(new_name);
    fs::rename(dir.join(old_name), &new_path)?;
    Ok(new_path)
}

/// Removes `name` inside `dir`. A directory is removed recursively: this
/// application gives a deleted entry nowhere to go on either side of a
/// transfer, so there is no "trash" for `remove_dir` alone to defer to.
pub fn remove(dir: &Path, name: &str, is_dir: bool) -> Result<(), LocalError> {
    let path = dir.join(name);
    if is_dir {
        fs::remove_dir_all(&path)?;
    } else {
        fs::remove_file(&path)?;
    }
    Ok(())
}

#[cfg(test)]
mod ops_tests {
    use super::*;

    #[test]
    fn a_directory_is_created_under_the_given_base() {
        let dir = tempfile::tempdir().expect("a scratch directory");
        let created = create_dir(dir.path(), "sub").expect("creates");

        assert_eq!(created, dir.path().join("sub"));
        assert!(created.is_dir());
    }

    #[test]
    fn a_hostile_new_directory_name_is_refused() {
        let dir = tempfile::tempdir().expect("a scratch directory");
        assert_eq!(
            create_dir(dir.path(), "../escape"),
            Err(LocalError::RefusedName(PathError::NotASingleSegment))
        );
    }

    #[test]
    fn a_file_is_renamed_within_its_own_directory() {
        let dir = tempfile::tempdir().expect("a scratch directory");
        fs::write(dir.path().join("old.txt"), b"x").expect("writes the fixture");

        let renamed = rename(dir.path(), "old.txt", "new.txt").expect("renames");

        assert_eq!(renamed, dir.path().join("new.txt"));
        assert!(!dir.path().join("old.txt").exists());
        assert!(renamed.exists());
    }

    #[test]
    fn a_hostile_rename_target_is_refused() {
        let dir = tempfile::tempdir().expect("a scratch directory");
        fs::write(dir.path().join("old.txt"), b"x").expect("writes the fixture");

        assert_eq!(
            rename(dir.path(), "old.txt", "..").expect_err("a dot entry is refused"),
            LocalError::RefusedName(PathError::DotEntry)
        );
        assert!(dir.path().join("old.txt").exists(), "nothing moved");
    }

    #[test]
    fn a_file_is_removed() {
        let dir = tempfile::tempdir().expect("a scratch directory");
        fs::write(dir.path().join("gone.txt"), b"x").expect("writes the fixture");

        remove(dir.path(), "gone.txt", false).expect("removes");
        assert!(!dir.path().join("gone.txt").exists());
    }

    #[test]
    fn a_non_empty_directory_is_removed_recursively() {
        let dir = tempfile::tempdir().expect("a scratch directory");
        let sub = dir.path().join("sub");
        fs::create_dir(&sub).expect("creates the fixture directory");
        fs::write(sub.join("inner.txt"), b"x").expect("writes the fixture");

        remove(dir.path(), "sub", true).expect("removes");
        assert!(!sub.exists());
    }
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
