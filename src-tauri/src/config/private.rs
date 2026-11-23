//! Files only the user can read.
//!
//! Everything the core keeps on disk is written through here. The session
//! inventory says which servers a person logs in to and as whom, the Logbook
//! says when, `macros.json` can hold a token a person pasted into a script,
//! `known_hosts` is the list of keys trusted, and the internal vault is a
//! password-encrypted file whose only defence against being copied is the
//! password. None of that is a secret from the user, and none of it is the
//! business of another account on the machine. Security model adversary 3 is
//! another local process without root; the default of 0644 files in a 0755
//! directory is not a defence against it.
//!
//! On Unix a directory is made 0700 and a file 0600, and an existing
//! directory from an older install is brought back to 0700 the next time
//! anything is written to it. Windows files inherit the permissions of the
//! user's profile, which already excludes other accounts, so nothing is done
//! there.

use std::fs;
use std::io;
use std::path::Path;

/// Creates `directory` and any missing parents, and makes `directory` 0700.
///
/// Only the leaf is tightened: its parents are not ours (`~/.config`).
pub fn create_dir(directory: &Path) -> io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
        fs::DirBuilder::new()
            .recursive(true)
            .mode(0o700)
            .create(directory)?;
        /* `create` leaves an existing directory as it found it, which is how an
        install from before this change keeps its old mode. */
        fs::set_permissions(directory, fs::Permissions::from_mode(0o700))
    }
    #[cfg(not(unix))]
    {
        fs::create_dir_all(directory)
    }
}

/// Writes `contents` to `path`, creating it 0600.
///
/// The mode is set on the open handle as well as at creation, so a temporary
/// file left behind by a crash, with whatever mode it had, is not reused as is.
pub fn write(path: &Path, contents: impl AsRef<[u8]>) -> io::Result<()> {
    use std::io::Write;

    let mut options = fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(fs::Permissions::from_mode(0o600))?;
    }
    file.write_all(contents.as_ref())
}

#[cfg(all(test, unix))]
mod tests {
    use std::os::unix::fs::PermissionsExt;

    use super::*;

    fn mode(path: &Path) -> u32 {
        fs::metadata(path).expect("metadata").permissions().mode() & 0o777
    }

    #[test]
    fn a_directory_is_created_0700_and_so_are_the_ones_made_on_the_way() {
        let root = tempfile::tempdir().expect("a temporary directory");
        let leaf = root.path().join("a").join("logbook");

        create_dir(&leaf).expect("created");

        assert_eq!(mode(&leaf), 0o700);
        assert_eq!(mode(&root.path().join("a")), 0o700);
    }

    #[test]
    fn an_existing_directory_from_an_older_install_is_tightened() {
        let root = tempfile::tempdir().expect("a temporary directory");
        let old = root.path().join("com.runicssh.client");
        fs::create_dir(&old).expect("created");
        fs::set_permissions(&old, fs::Permissions::from_mode(0o755)).expect("loosened");

        create_dir(&old).expect("tightened");

        assert_eq!(mode(&old), 0o700);
    }

    #[test]
    fn a_file_is_created_0600() {
        let root = tempfile::tempdir().expect("a temporary directory");
        let path = root.path().join("sessions.json");

        write(&path, "[]").expect("written");

        assert_eq!(mode(&path), 0o600);
        assert_eq!(fs::read_to_string(&path).expect("read"), "[]");
    }

    #[test]
    fn a_loose_file_left_behind_is_not_reused_as_it_was() {
        let root = tempfile::tempdir().expect("a temporary directory");
        let path = root.path().join("sessions.json.tmp");
        fs::write(&path, "stale").expect("written");
        fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).expect("loosened");

        write(&path, "fresh").expect("overwritten");

        assert_eq!(mode(&path), 0o600);
        assert_eq!(fs::read_to_string(&path).expect("read"), "fresh");
    }

    /// The reason this module exists: every store the core writes through ends
    /// up private. Red before the stores used it, since each used `fs::write`
    /// and `create_dir_all` under whatever umask the process had.
    #[test]
    fn every_store_the_core_writes_ends_up_private() {
        use crate::config::logbook::{record, Kind, LogbookStore};
        use crate::config::macros::{save_macro, MacroDraft, MacroKind, MacroStore};
        use crate::config::sessions::{save_session, HostKind, SessionDraft, SessionStore};
        use crate::config::spaces::{save_space, SpaceDraft, SpaceStore, SpaceWeight};
        use crate::config::{Settings, SettingsStore};
        use crate::vault::{InternalVault, Secret};

        let root = tempfile::tempdir().expect("a temporary directory");
        let dir = root.path().join("com.runicssh.client");

        save_session(
            &SessionStore::new(&dir),
            SessionDraft {
                id: None,
                name: "web".to_owned(),
                host: "web.internal".to_owned(),
                port: 22,
                user: "deploy".to_owned(),
                group: None,
                proxy_jump: None,
                kind: HostKind::Direct,
                forwards: Vec::new(),
                multiplexer: None,
                keepalive: true,
                space: None,
            },
        )
        .expect("a session");
        save_macro(
            &MacroStore::new(&dir),
            MacroDraft {
                id: None,
                name: "m".to_owned(),
                kind: MacroKind::Sequential,
                text: "ls".to_owned(),
            },
        )
        .expect("a macro");
        save_space(
            &SpaceStore::new(&dir),
            SpaceDraft {
                id: None,
                name: "Lab".to_owned(),
                weight: SpaceWeight::Normal,
            },
        )
        .expect("a space");
        record(&LogbookStore::new(&dir), "host-1", Kind::Connected);
        SettingsStore::new(&dir)
            .save(&Settings::default())
            .expect("settings");
        InternalVault::new(&dir)
            .enable(&Secret::new("correct horse battery staple"), &[])
            .expect("a vault");

        assert_eq!(mode(&dir), 0o700, "the configuration directory");
        assert_eq!(mode(&dir.join("logbook")), 0o700, "the logbook directory");
        for file in [
            dir.join("sessions.json"),
            dir.join("macros.json"),
            dir.join("spaces.json"),
            dir.join("settings.json"),
            dir.join("logbook").join("host-1.json"),
            dir.join("internal_vault.json"),
        ] {
            assert_eq!(mode(&file), 0o600, "{}", file.display());
        }
    }
}
