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

    fn position(&self, id: &str) -> Option<usize> {
        self.items.iter().position(|session| session.id == id)
    }
}

/// What the interface sends when saving. Deliberately not [`Session`].
///
/// There is no field here for a secret, and that is the point: the type the
/// webview can construct has nowhere to put one, so a password cannot reach
/// this file even by mistake. Credentials live in the OS keychain, referenced
/// by an opaque id the core assigns — ADR-0004.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDraft {
    /// Absent when creating. Present when editing the session it names.
    #[serde(default)]
    pub id: Option<String>,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    #[serde(default)]
    pub group: Option<String>,
}

/// Characters that must never reach a session name.
///
/// `char::is_control` is not enough, and finding that out is the reason this
/// function exists: `U+202E RIGHT-TO-LEFT OVERRIDE` is a *format* character
/// rather than a control one, so `is_control` returns false for the single
/// character most used to make a name read as something it is not. It is the
/// same trick the SFTP pane guards against in filenames a remote host sends —
/// and a name is not safer for having come from our own interface, because the
/// interface is the part an attacker reaches first.
fn is_deceptive(c: char) -> bool {
    c.is_control()
        // Bidirectional overrides, embeddings and isolates.
        || matches!(c, '\u{200e}' | '\u{200f}' | '\u{2066}'..='\u{2069}' | '\u{202a}'..='\u{202e}')
        // Zero-width characters, which hide a difference between two names.
        || matches!(c, '\u{200b}'..='\u{200d}' | '\u{feff}')
}

/// Refuses a draft the settings file should never be made to hold.
///
/// The webview is our own code, but `docs/architecture.md` says every value
/// crossing into the core is validated here regardless of what the frontend
/// claims to have checked.
pub fn validate_draft(draft: &SessionDraft) -> Result<(), Error> {
    let field = |name: &str, value: &str, max: usize| -> Result<(), Error> {
        let trimmed = value.trim();
        if trimmed.is_empty() || trimmed.len() > max {
            return Err(Error::InvalidSession {
                field: name.to_owned(),
            });
        }
        if trimmed.chars().any(is_deceptive) {
            return Err(Error::InvalidSession {
                field: name.to_owned(),
            });
        }
        Ok(())
    };

    field("name", &draft.name, 120)?;
    field("host", &draft.host, 253)?;
    field("user", &draft.user, 64)?;

    if let Some(group) = &draft.group {
        field("group", group, 120)?;
    }

    if draft.port == 0 {
        return Err(Error::InvalidSession {
            field: "port".to_owned(),
        });
    }

    Ok(())
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

/// A session id that is stable, opaque, and unique within the file.
///
/// No UUID crate: the input is a nanosecond clock plus the host, the user and
/// how many sessions already exist, hashed and truncated. Collision is
/// implausible, and the caller checks anyway — the file is already loaded, so
/// certainty is free.
fn new_id(sessions: &Sessions, draft: &SessionDraft) -> String {
    use sha2::{Digest, Sha256};

    for attempt in 0..64_u32 {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|since| since.as_nanos())
            .unwrap_or_default();

        let mut hasher = Sha256::new();
        hasher.update(nanos.to_le_bytes());
        hasher.update(attempt.to_le_bytes());
        hasher.update(sessions.items.len().to_le_bytes());
        hasher.update(draft.host.as_bytes());
        hasher.update(draft.user.as_bytes());

        let candidate: String = hasher
            .finalize()
            .iter()
            .take(8)
            .map(|byte| format!("{byte:02x}"))
            .collect();

        if sessions.find(&candidate).is_none() {
            return candidate;
        }
    }

    /* Sixty-four collisions in a row is not a thing that happens; if it did,
    falling back to something certainly unique beats looping forever. */
    format!("{}-{}", sessions.items.len(), draft.host)
}

/// Creates a session, or replaces the one the draft names.
///
/// Returns what was stored, including the id the core assigned, because the
/// interface needs it to reference the session and must not invent its own.
pub fn save_session(store: &SessionStore, draft: SessionDraft) -> Result<Session, Error> {
    validate_draft(&draft)?;

    let mut sessions = store.load()?;

    let session = match draft.id {
        Some(id) => {
            let index = sessions
                .position(&id)
                .ok_or_else(|| Error::UnknownSession { id: id.clone() })?;

            /* The credential reference survives an edit. Renaming a session or
            moving it to another group must not orphan its keychain entry. */
            let existing = &sessions.items[index];
            let session = Session {
                id,
                name: draft.name.trim().to_owned(),
                host: draft.host.trim().to_owned(),
                port: draft.port,
                user: draft.user.trim().to_owned(),
                group: draft.group.map(|g| g.trim().to_owned()),
                credential_id: existing.credential_id.clone(),
            };
            sessions.items[index] = session.clone();
            session
        }
        None => {
            let session = Session {
                id: new_id(&sessions, &draft),
                name: draft.name.trim().to_owned(),
                host: draft.host.trim().to_owned(),
                port: draft.port,
                user: draft.user.trim().to_owned(),
                group: draft.group.map(|g| g.trim().to_owned()),
                credential_id: None,
            };
            sessions.items.push(session.clone());
            session
        }
    };

    store.save(&sessions)?;
    Ok(session)
}

/// Forgets a session.
///
/// Does not touch the keychain: an entry whose session is gone is dealt with
/// by the vault, which owns that lifetime. Deleting here and failing there
/// would leave a secret nobody can reach and nobody can remove.
pub fn delete_session(store: &SessionStore, id: &str) -> Result<(), Error> {
    let mut sessions = store.load()?;

    let index = sessions
        .position(id)
        .ok_or_else(|| Error::UnknownSession { id: id.to_owned() })?;

    sessions.items.remove(index);
    store.save(&sessions)
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

    fn draft(name: &str) -> SessionDraft {
        SessionDraft {
            id: None,
            name: name.to_owned(),
            host: "10.0.4.12".to_owned(),
            port: 22,
            user: "deploy".to_owned(),
            group: Some("Production".to_owned()),
        }
    }

    #[test]
    fn a_saved_session_survives_a_restart() {
        /* The whole issue, in one test: a store built fresh over the same
        directory, as a new launch would build it, sees what the last one
        wrote. */
        let dir = tempfile::tempdir().expect("a temporary directory");
        let saved = save_session(&SessionStore::new(dir.path()), draft("web-01")).expect("save");

        let after_restart = SessionStore::new(dir.path()).load().expect("load");

        assert_eq!(after_restart.find(&saved.id), Some(&saved));
    }

    #[test]
    fn the_core_assigns_the_id_not_the_caller() {
        let (store, _dir) = store();
        let session = save_session(&store, draft("web-01")).expect("save");

        assert_eq!(session.id.len(), 16, "expected a short opaque hex id");
    }

    #[test]
    fn two_sessions_never_share_an_id() {
        let (store, _dir) = store();
        let mut ids = std::collections::BTreeSet::new();

        for i in 0..50 {
            let session = save_session(&store, draft(&format!("host-{i}"))).expect("save");
            assert!(
                ids.insert(session.id.clone()),
                "id {} was reused",
                session.id
            );
        }
    }

    #[test]
    fn editing_keeps_the_credential_reference() {
        /* Renaming a session or moving it to another group must not orphan its
        keychain entry — the secret would still exist and nothing would be
        able to name it. */
        let (store, _dir) = store();
        let created = save_session(&store, draft("web-01")).expect("save");

        let mut sessions = store.load().expect("load");
        let index = sessions.position(&created.id).expect("present");
        sessions.items[index].credential_id = Some("keychain-4f21".to_owned());
        store.save(&sessions).expect("save");

        let edited = save_session(
            &store,
            SessionDraft {
                id: Some(created.id.clone()),
                name: "renamed".to_owned(),
                ..draft("x")
            },
        )
        .expect("edit");

        assert_eq!(edited.name, "renamed");
        assert_eq!(edited.credential_id.as_deref(), Some("keychain-4f21"));
    }

    #[test]
    fn editing_something_that_is_not_there_is_refused() {
        let (store, _dir) = store();

        let missing = save_session(
            &store,
            SessionDraft {
                id: Some("nope".to_owned()),
                ..draft("web-01")
            },
        );

        assert!(matches!(missing, Err(Error::UnknownSession { .. })));
    }

    #[test]
    fn whitespace_is_trimmed_rather_than_stored() {
        let (store, _dir) = store();
        let session = save_session(
            &store,
            SessionDraft {
                host: "  10.0.4.12  ".to_owned(),
                ..draft("  web-01  ")
            },
        )
        .expect("save");

        assert_eq!(session.name, "web-01");
        assert_eq!(session.host, "10.0.4.12");
    }

    #[test]
    fn a_deleted_session_stays_deleted() {
        let dir = tempfile::tempdir().expect("a temporary directory");
        let store = SessionStore::new(dir.path());
        let session = save_session(&store, draft("web-01")).expect("save");

        delete_session(&store, &session.id).expect("delete");

        assert!(SessionStore::new(dir.path())
            .load()
            .expect("load")
            .find(&session.id)
            .is_none());
    }

    #[test]
    fn deleting_something_that_is_not_there_is_refused() {
        let (store, _dir) = store();
        assert!(matches!(
            delete_session(&store, "nope"),
            Err(Error::UnknownSession { .. })
        ));
    }

    #[test]
    fn a_draft_missing_something_is_refused_by_name() {
        let (store, _dir) = store();

        let cases = [
            (
                "name",
                SessionDraft {
                    name: "  ".to_owned(),
                    ..draft("x")
                },
            ),
            (
                "host",
                SessionDraft {
                    host: String::new(),
                    ..draft("x")
                },
            ),
            (
                "user",
                SessionDraft {
                    user: "\t".to_owned(),
                    ..draft("x")
                },
            ),
            (
                "port",
                SessionDraft {
                    port: 0,
                    ..draft("x")
                },
            ),
            (
                "group",
                SessionDraft {
                    group: Some(String::new()),
                    ..draft("x")
                },
            ),
        ];

        for (expected, bad) in cases {
            match save_session(&store, bad) {
                Err(Error::InvalidSession { field }) => assert_eq!(field, expected),
                other => panic!("expected {expected} to be refused, got {other:?}"),
            }
        }
    }

    #[test]
    fn a_control_character_never_reaches_the_file() {
        /* It would reach the sidebar and the log. SFTP filenames taught this
        lesson about names we did not write; a name we did write is not safer
        just because it came from our own interface. */
        let (store, _dir) = store();

        for deceptive in [
            '\u{202e}', '\u{200f}', '\u{2066}', '\u{200b}', '\u{feff}', '\u{0007}',
        ] {
            let sneaky = SessionDraft {
                name: format!("web{deceptive}01"),
                ..draft("x")
            };
            assert!(
                matches!(
                    save_session(&store, sneaky),
                    Err(Error::InvalidSession { .. })
                ),
                "U+{:04X} was accepted into a session name",
                deceptive as u32
            );
        }
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
