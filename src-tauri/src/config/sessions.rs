//! Saved sessions.
//!
//! A session names a host, not a way into it. There is no credential here and
//! there never will be: ADR-0004 puts secrets in the OS keychain, referenced by
//! an opaque id, and this file is readable by any process running as the user.
//!
//! What the file does carry — host names, addresses, user names — is a map of
//! someone's infrastructure, which `docs/security-model.md` lists as an asset
//! in its own right. That is a deliberate scope limit rather than an oversight:
//! we do not defend against a local attacker already running as the user.

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::error::Error;

pub const SESSIONS_FILE: &str = "sessions.json";

/// A host the user has saved.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    /// Stable across renames, so a credential reference stays valid.
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    /// Which group it appears under in the sidebar, if any.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
    /// The keychain entry holding this session's secret, if one was saved.
    /// An opaque id: the frontend never sees more, and neither does this file.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub credential_id: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Sessions {
    pub items: Vec<Session>,
}

impl Sessions {
    pub fn find(&self, id: &str) -> Option<&Session> {
        self.items.iter().find(|session| session.id == id)
    }
}

/// Reads and writes [`Sessions`] under a directory the caller owns.
#[derive(Debug, Clone)]
pub struct SessionStore {
    directory: PathBuf,
}

impl SessionStore {
    pub fn new(directory: impl Into<PathBuf>) -> Self {
        Self {
            directory: directory.into(),
        }
    }

    pub fn path(&self) -> PathBuf {
        self.directory.join(SESSIONS_FILE)
    }

    /// Loads the sessions, or none at all when there is no file yet.
    ///
    /// As with settings, a missing file is a first launch and a malformed one
    /// is an error: quietly starting with an empty list would look identical to
    /// every saved session having been deleted.
    pub fn load(&self) -> Result<Sessions, Error> {
        let path = self.path();

        let text = match fs::read_to_string(&path) {
            Ok(text) => text,
            Err(source) if source.kind() == std::io::ErrorKind::NotFound => {
                return Ok(Sessions::default())
            }
            Err(source) => return Err(Error::SettingsUnreadable { path, source }),
        };

        serde_json::from_str(&text).map_err(|source| Error::SettingsMalformed { path, source })
    }

    pub fn save(&self, sessions: &Sessions) -> Result<(), Error> {
        let path = self.path();

        fs::create_dir_all(&self.directory).map_err(|source| Error::SettingsUnwritable {
            path: self.directory.clone(),
            source,
        })?;

        let json =
            serde_json::to_string_pretty(sessions).map_err(|source| Error::SettingsMalformed {
                path: path.clone(),
                source,
            })?;

        let temporary = self.directory.join(format!("{SESSIONS_FILE}.tmp"));
        fs::write(&temporary, json).map_err(|source| Error::SettingsUnwritable {
            path: temporary.clone(),
            source,
        })?;

        fs::rename(&temporary, &path).map_err(|source| Error::SettingsUnwritable { path, source })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session(id: &str) -> Session {
        Session {
            id: id.to_owned(),
            name: "web-01".to_owned(),
            host: "10.0.4.12".to_owned(),
            port: 22,
            user: "deploy".to_owned(),
            group: Some("Production".to_owned()),
            credential_id: Some("keychain-4f21".to_owned()),
        }
    }

    fn store() -> (SessionStore, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("a temporary directory");
        (SessionStore::new(dir.path()), dir)
    }

    #[test]
    fn no_file_means_no_sessions_yet() {
        let (store, _dir) = store();
        assert_eq!(store.load().expect("defaults"), Sessions::default());
    }

    #[test]
    fn sessions_survive_a_round_trip() {
        let (store, _dir) = store();
        let sessions = Sessions {
            items: vec![session("a"), session("b")],
        };

        store.save(&sessions).expect("save");
        assert_eq!(store.load().expect("load"), sessions);
    }

    #[test]
    fn a_malformed_file_is_not_an_empty_list() {
        /* Starting empty looks exactly like every saved session having been
        deleted, and the user would have no way to tell. */
        let (store, _dir) = store();
        fs::write(store.path(), "{ not json").expect("write");

        assert!(matches!(store.load(), Err(Error::SettingsMalformed { .. })));
    }

    #[test]
    fn the_file_never_holds_a_secret() {
        let sessions = Sessions {
            items: vec![session("a")],
        };
        let json = serde_json::to_string(&sessions).expect("serialize");

        for forbidden in ["password", "passphrase", "secret", "privateKey", "token"] {
            assert!(
                !json.contains(forbidden),
                "sessions.json must not carry {forbidden}"
            );
        }
        /* The credential reference is an opaque id and may stay. */
        assert!(json.contains("keychain-4f21"));
    }

    #[test]
    fn finds_by_id() {
        let sessions = Sessions {
            items: vec![session("a"), session("b")],
        };

        assert_eq!(sessions.find("b").map(|s| s.id.as_str()), Some("b"));
        assert!(sessions.find("missing").is_none());
    }
}
