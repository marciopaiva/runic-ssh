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

/// What a host is, for recognising a row rather than for reaching it.
///
/// ADR-0031. A closed set on purpose: the request was four named kinds with an
/// icon each, not an open taxonomy, and a free-text label reintroduces the
/// exact defect #221 already named in the group field — two hosts a person
/// thinks of as the same kind, spelled differently by a typo. Growing this
/// enum later is an ordinary change; `Trust` and `ConnectionKind` have both
/// grown variants without needing a decision this size again.
///
/// No behaviour reads this. It is not a secret, it is not part of how a
/// connection is made, and rule 7 has nothing to say about it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HostKind {
    JumpServer,
    Database,
    Web,
    /// What a host has until somebody says otherwise, and `#[serde(default)]`
    /// is what a `sessions.json` written before this field existed reads as.
    #[default]
    Other,
}

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
    /// The saved session to reach this host through, if it is behind one.
    ///
    /// A reference rather than an address, because a bastion is a host in its
    /// own right: it has its own key to verify and its own credential, and
    /// duplicating its address here would leave two copies to keep in step.
    /// ADR-0023.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proxy_jump: Option<String>,
    /// Every host has one; `Other` is the answer nobody has chosen yet.
    /// ADR-0031.
    #[serde(default)]
    pub kind: HostKind,
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
    /// The id of the saved session to reach this host through.
    #[serde(default)]
    pub proxy_jump: Option<String>,
    #[serde(default)]
    pub kind: HostKind,
}

/// Why a jump host reference cannot be used.
///
/// A code rather than a sentence: ADR-0007 puts the wording in the frontend,
/// and the three cases need three different things from the reader.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProxyJumpProblem {
    /// The session names itself as its own jump host.
    Itself,
    /// Nothing saved has that id. Also what a deleted bastion looks like.
    Unknown,
    /// The jump host is itself reached through one. ADR-0023 allows one hop,
    /// and refuses the rest rather than connecting to the first and behaving as
    /// if the whole chain had been honoured.
    Chained,
    /// The session being saved is itself a jump host for other saved sessions,
    /// so giving it one of its own would make their chains two hops long.
    ///
    /// The same limit as [`Chained`], seen from the other end. Both refuse a
    /// chain of two; this one refuses building it by editing the middle rather
    /// than the far host.
    ///
    /// [`Chained`]: ProxyJumpProblem::Chained
    Serving,
}

/// Checks a jump host reference against what is saved.
///
/// Separate from [`validate_draft`] because none of it can be answered from the
/// draft alone: whether the id names anything, and whether that thing is itself
/// behind a bastion, are questions about the file.
///
/// `editing` is the id of the session being saved, when one is being edited.
/// Without it a session could be made to name itself on the way in.
pub fn check_proxy_jump(
    sessions: &Sessions,
    editing: Option<&str>,
    proxy_jump: Option<&str>,
) -> Result<(), ProxyJumpProblem> {
    let Some(bastion) = proxy_jump else {
        return Ok(());
    };

    if editing == Some(bastion) {
        return Err(ProxyJumpProblem::Itself);
    }

    let Some(session) = sessions.find(bastion) else {
        return Err(ProxyJumpProblem::Unknown);
    };

    if session.proxy_jump.is_some() {
        return Err(ProxyJumpProblem::Chained);
    }

    Ok(())
}

/// Refuses giving a jump host to a session that is already serving as one.
///
/// The limit is ADR-0023's, the same one [`check_proxy_jump`] enforces when a
/// bastion is chosen. What this catches is the other order: `web-01` is saved
/// behind `bastion`, and `bastion` is then edited and given a jump host of its
/// own. Nothing about that edit looks wrong, and the host it breaks is a host
/// the user did not open.
///
/// Deliberately its own function, called only from [`save_session`]. The
/// connect path calls `check_proxy_jump` with the id of the session it is
/// opening, and a bastion that carries other hosts is perfectly connectable on
/// its own; folding this rule in there would refuse a connection that works.
/// This is about what the file may come to hold, not about what may be opened.
pub fn check_not_serving(
    sessions: &Sessions,
    editing: Option<&str>,
    proxy_jump: Option<&str>,
) -> Result<(), ProxyJumpProblem> {
    /* Nothing to refuse for a session that is not being given a jump host, and
    a session that does not exist yet cannot be carrying anything. */
    let (Some(editing), Some(_)) = (editing, proxy_jump) else {
        return Ok(());
    };

    let carries = sessions
        .items
        .iter()
        .any(|session| session.proxy_jump.as_deref() == Some(editing));

    if carries {
        return Err(ProxyJumpProblem::Serving);
    }

    Ok(())
}

/// The saved session already reaching this exact host, port and user, if
/// there is one.
///
/// Case-insensitive on the host, the way a hostname is looked up; exact on
/// the port and the user, because two accounts on the same machine are two
/// different ways in and neither refuses the other. `deploy@web-01:22` and
/// `admin@web-01:22` are both legitimate saved sessions; `deploy@web-01:22`
/// twice, under two names, is the mistake this catches.
///
/// `editing` excludes the session being saved from matching itself — without
/// it, editing any field but the connection target on an existing session
/// would report it as a duplicate of itself.
pub fn duplicate_of<'a>(
    sessions: &'a Sessions,
    editing: Option<&str>,
    host: &str,
    port: u16,
    user: &str,
) -> Option<&'a Session> {
    let host = host.trim().to_lowercase();
    let user = user.trim();

    sessions.items.iter().find(|session| {
        Some(session.id.as_str()) != editing
            && session.host.trim().to_lowercase() == host
            && session.port == port
            && session.user.trim() == user
    })
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

    /* Checked here rather than in `validate_draft` because it needs the file.
    Enforced again at connect time, which is the check that cannot be
    outmanoeuvred: a bastion can grow a jump host of its own, or be deleted,
    long after the session naming it was saved. */
    let proxy_jump = draft
        .proxy_jump
        .as_deref()
        .map(str::trim)
        .filter(|jump| !jump.is_empty());
    check_proxy_jump(&sessions, draft.id.as_deref(), proxy_jump)
        .map_err(|problem| Error::InvalidProxyJump { problem })?;
    check_not_serving(&sessions, draft.id.as_deref(), proxy_jump)
        .map_err(|problem| Error::InvalidProxyJump { problem })?;
    let proxy_jump = proxy_jump.map(str::to_owned);

    if let Some(existing) = duplicate_of(
        &sessions,
        draft.id.as_deref(),
        &draft.host,
        draft.port,
        &draft.user,
    ) {
        return Err(Error::DuplicateSession {
            name: existing.name.clone(),
        });
    }

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
                proxy_jump,
                kind: draft.kind,
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
                proxy_jump,
                kind: draft.kind,
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
            proxy_jump: None,
            kind: HostKind::Other,
        }
    }

    fn store() -> (SessionStore, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("a temporary directory");
        (SessionStore::new(dir.path()), dir)
    }

    /* ---------------------------------------------------------------- *
     * Jump hosts. ADR-0023.
     * ---------------------------------------------------------------- */

    /// Saves a bastion and returns its id.
    fn a_saved_bastion(store: &SessionStore) -> String {
        let mut draft = draft("bastion");
        draft.host = "bastion.example.com".to_owned();
        save_session(store, draft).expect("the bastion saves").id
    }

    #[test]
    fn a_file_written_before_jump_hosts_existed_still_loads() {
        /* The whole migration, such as it is. A build that never heard of a
        jump host, or of a host kind (ADR-0031), wrote this, and a build that
        has must not treat it as a malformed file and take every saved
        session down with it. */
        let (store, _dir) = store();
        std::fs::write(
            store.path(),
            r#"[{"id":"a1","name":"web-01","host":"10.0.4.12","port":22,"user":"deploy"}]"#,
        )
        .expect("the file writes");

        let sessions = store.load().expect("an older file still loads");
        assert_eq!(sessions.items.len(), 1);
        assert_eq!(sessions.items[0].proxy_jump, None);
        assert_eq!(sessions.items[0].kind, HostKind::Other);
    }

    #[test]
    fn a_kind_is_spelled_the_same_on_both_sides() {
        /* Pinned as a literal, the way `Keep` and `SuggestedMethod` both are:
        a renamed variant compiles here and leaves the wizard's icon picker
        silently matching nothing. The matching assertion lives in
        tests/ipc-contract.test.ts. */
        for (kind, wire) in [
            (HostKind::JumpServer, r#""jumpServer""#),
            (HostKind::Database, r#""database""#),
            (HostKind::Web, r#""web""#),
            (HostKind::Other, r#""other""#),
        ] {
            assert_eq!(serde_json::to_string(&kind).expect("serializes"), wire);
        }
    }

    #[test]
    fn a_session_without_a_jump_host_writes_no_field_at_all() {
        /* So a build that never heard of one reads back exactly what it wrote.
        The field is absent rather than null. */
        let (store, _dir) = store();
        save_session(&store, draft("web-01")).expect("it saves");

        let json = std::fs::read_to_string(store.path()).expect("the file reads");
        assert!(!json.contains("proxyJump"), "wrote: {json}");
    }

    #[test]
    fn a_jump_host_is_stored_and_survives_an_edit() {
        let (store, _dir) = store();
        let bastion = a_saved_bastion(&store);

        let mut draft = draft("web-01");
        draft.proxy_jump = Some(bastion.clone());
        let saved = save_session(&store, draft).expect("it saves");
        assert_eq!(saved.proxy_jump.as_deref(), Some(bastion.as_str()));

        /* Renaming must not quietly drop the route to the host. */
        let mut edit = self::draft("web-01 renamed");
        edit.id = Some(saved.id.clone());
        edit.proxy_jump = Some(bastion.clone());
        let edited = save_session(&store, edit).expect("the edit saves");
        assert_eq!(edited.proxy_jump.as_deref(), Some(bastion.as_str()));
    }

    #[test]
    fn a_session_cannot_be_its_own_jump_host() {
        let (store, _dir) = store();
        let saved = save_session(&store, draft("web-01")).expect("it saves");

        let mut edit = draft("web-01");
        edit.id = Some(saved.id.clone());
        edit.proxy_jump = Some(saved.id.clone());

        assert!(matches!(
            save_session(&store, edit),
            Err(Error::InvalidProxyJump {
                problem: ProxyJumpProblem::Itself
            })
        ));
    }

    #[test]
    fn a_jump_host_that_is_not_saved_is_refused() {
        let (store, _dir) = store();
        let mut draft = draft("web-01");
        draft.proxy_jump = Some("no-such-session".to_owned());

        assert!(matches!(
            save_session(&store, draft),
            Err(Error::InvalidProxyJump {
                problem: ProxyJumpProblem::Unknown
            })
        ));
    }

    #[test]
    fn a_jump_host_behind_another_jump_host_is_refused() {
        /* One hop, per ADR-0023. Refused here rather than connecting to the
        first and behaving as if the whole chain had been honoured. */
        let (store, _dir) = store();
        let first = a_saved_bastion(&store);

        let mut middle = draft("middle");
        middle.proxy_jump = Some(first);
        let middle = save_session(&store, middle).expect("one hop is fine");

        let mut far = draft("far");
        far.proxy_jump = Some(middle.id);

        assert!(matches!(
            save_session(&store, far),
            Err(Error::InvalidProxyJump {
                problem: ProxyJumpProblem::Chained
            })
        ));
    }

    #[test]
    fn a_jump_host_cannot_be_given_one_of_its_own() {
        /* The same two hops as the test above, built from the other end: the
        far host is saved first and correctly, and the bastion under it is
        edited afterwards. #171. */
        let (store, _dir) = store();
        let bastion = a_saved_bastion(&store);
        let gateway = save_session(&store, draft("gateway")).expect("it saves");

        let mut far = draft("web-01");
        far.proxy_jump = Some(bastion.clone());
        save_session(&store, far).expect("one hop is fine");

        let mut edit = draft("bastion");
        edit.id = Some(bastion);
        edit.proxy_jump = Some(gateway.id);

        assert!(matches!(
            save_session(&store, edit),
            Err(Error::InvalidProxyJump {
                problem: ProxyJumpProblem::Serving
            })
        ));
    }

    #[test]
    fn a_jump_host_can_still_be_edited_without_being_given_one() {
        /* The refusal is about the field, not about the host. A bastion that
        carries other sessions is renamed and moved like any other. */
        let (store, _dir) = store();
        let bastion = a_saved_bastion(&store);

        let mut far = draft("web-01");
        far.proxy_jump = Some(bastion.clone());
        save_session(&store, far).expect("one hop is fine");

        let mut edit = draft("bastion renamed");
        edit.id = Some(bastion);
        let saved = save_session(&store, edit).expect("the edit saves");
        assert_eq!(saved.name, "bastion renamed");
        assert_eq!(saved.proxy_jump, None);
    }

    #[test]
    fn a_session_carrying_nothing_may_be_given_a_jump_host() {
        /* The guard reads the file rather than assuming: a session nobody is
        reached through takes a jump host as it always did, and so does one
        that has not been saved yet. */
        let (store, _dir) = store();
        let bastion = a_saved_bastion(&store);
        let plain = save_session(&store, draft("plain")).expect("it saves");

        let mut edit = draft("plain");
        edit.id = Some(plain.id);
        edit.proxy_jump = Some(bastion);
        assert!(save_session(&store, edit)
            .expect("it saves")
            .proxy_jump
            .is_some());
    }

    /* ---------------------------------------------------------------- *
     * A second session at the same connection target. The check the
     * maintainer asked for after registering the same fixture host twice
     * while driving ADR-0030's wizard.
     * ---------------------------------------------------------------- */

    #[test]
    fn a_second_session_at_the_same_host_port_and_user_is_refused() {
        let (store, _dir) = store();
        let first = save_session(
            &store,
            SessionDraft {
                host: "web-01.example.com".to_owned(),
                ..draft("web-01")
            },
        )
        .expect("the first saves");

        let second = SessionDraft {
            host: "web-01.example.com".to_owned(),
            ..draft("web-01 again")
        };

        match save_session(&store, second) {
            Err(Error::DuplicateSession { name }) => assert_eq!(name, first.name),
            other => panic!("expected a duplicate refusal, got {other:?}"),
        }
    }

    #[test]
    fn different_users_on_the_same_host_and_port_are_not_duplicates() {
        /* Two accounts on one machine are two different ways in, and neither
        namesake refuses the other. */
        let (store, _dir) = store();
        let host = "web-01.example.com".to_owned();

        save_session(
            &store,
            SessionDraft {
                host: host.clone(),
                user: "deploy".to_owned(),
                ..draft("deploy on web-01")
            },
        )
        .expect("deploy saves");

        assert!(save_session(
            &store,
            SessionDraft {
                host,
                user: "admin".to_owned(),
                ..draft("admin on web-01")
            },
        )
        .is_ok());
    }

    #[test]
    fn different_ports_on_the_same_host_are_not_duplicates() {
        let (store, _dir) = store();
        let host = "web-01.example.com".to_owned();

        save_session(
            &store,
            SessionDraft {
                host: host.clone(),
                port: 22,
                ..draft("web-01 on 22")
            },
        )
        .expect("port 22 saves");

        assert!(save_session(
            &store,
            SessionDraft {
                host,
                port: 2222,
                ..draft("web-01 on 2222")
            },
        )
        .is_ok());
    }

    #[test]
    fn the_host_comparison_ignores_case_and_surrounding_space() {
        let (store, _dir) = store();
        save_session(
            &store,
            SessionDraft {
                host: "Web-01.Example.com".to_owned(),
                ..draft("web-01")
            },
        )
        .expect("the first saves");

        let second = SessionDraft {
            host: "  web-01.example.com  ".to_owned(),
            ..draft("web-01 again")
        };

        assert!(matches!(
            save_session(&store, second),
            Err(Error::DuplicateSession { .. })
        ));
    }

    #[test]
    fn editing_a_session_is_not_a_duplicate_of_itself() {
        /* `editing` excludes the session being saved from matching itself —
        without it, saving any other field on an existing session would
        report it as a duplicate of the very row it is. */
        let (store, _dir) = store();
        let saved = save_session(
            &store,
            SessionDraft {
                host: "web-01.example.com".to_owned(),
                ..draft("web-01")
            },
        )
        .expect("it saves");

        let edit = SessionDraft {
            id: Some(saved.id.clone()),
            host: "web-01.example.com".to_owned(),
            group: Some("Staging".to_owned()),
            ..draft("web-01")
        };

        assert_eq!(
            save_session(&store, edit).expect("the edit saves").group,
            Some("Staging".to_owned())
        );
    }

    #[test]
    fn an_empty_jump_host_is_no_jump_host() {
        /* An empty select reaches the core as an empty string, and a session
        stored with `Some("")` would be refused as unknown forever after. */
        let (store, _dir) = store();
        let mut draft = draft("web-01");
        draft.proxy_jump = Some("   ".to_owned());

        let saved = save_session(&store, draft).expect("it saves");
        assert_eq!(saved.proxy_jump, None);
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

    /// A draft naming its own host, derived from `name`.
    ///
    /// Every draft used to share one constant host, which made every pair of
    /// them a duplicate the moment `duplicate_of` existed to notice — three
    /// tests across this module were building two or more sessions this way
    /// without meaning to test that. Deriving the host from the name is what
    /// they already intended: two different names were always meant to be
    /// two different hosts here, and now they are.
    fn draft(name: &str) -> SessionDraft {
        SessionDraft {
            id: None,
            name: name.to_owned(),
            host: format!("{}.internal", name.trim()),
            port: 22,
            user: "deploy".to_owned(),
            group: Some("Production".to_owned()),
            proxy_jump: None,
            kind: HostKind::Other,
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
