//! Session commands.
//!
//! Thin by design. Each handler resolves what it needs, calls into a domain
//! module, and maps the failure — the logic they call is testable without a
//! webview, which is the arrangement `docs/architecture.md` asks for.

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime, State};

use crate::config::sessions::{
    delete_session as remove_session, save_session as store_session, Session, SessionDraft,
    SessionStore,
};
use crate::error::{Error, IpcError};
use crate::ssh::connection::{connect_reporting, Credential, Endpoint, OfferedKey};
use crate::ssh::known_hosts::KnownHosts;
use crate::ssh::pending::{PendingHostKeys, PendingId};
use crate::ssh::registry::{Busy, Open, Registry, SessionHandle};
use crate::ssh::trust::Trust;
use crate::vault::{Availability, CredentialId, StoredCredential, Vault};

pub const KNOWN_HOSTS_FILE: &str = "known_hosts";

/// What the frontend gets back from a successful connect.
///
/// A handle and the facts needed to label a tab. No socket, no key, no
/// credential — rule 1.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenSession {
    pub handle: SessionHandle,
    pub session_id: String,
    pub name: String,
    /// Whether the connection still needs a credential before it is usable.
    pub authenticated: bool,
}

fn config_dir<R: Runtime>(app: &AppHandle<R>) -> Result<std::path::PathBuf, Error> {
    app.path()
        .app_config_dir()
        .map_err(|_| Error::ConfigDirUnavailable)
}

pub fn saved_session<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<Session, Error> {
    let store = SessionStore::new(config_dir(app)?);
    store
        .load()?
        .find(id)
        .cloned()
        .ok_or_else(|| Error::UnknownSession { id: id.to_owned() })
}

fn known_hosts<R: Runtime>(app: &AppHandle<R>) -> Result<KnownHosts, Error> {
    let path = config_dir(app)?.join(KNOWN_HOSTS_FILE);

    match std::fs::read_to_string(&path) {
        Ok(text) => Ok(KnownHosts::parse(&text)),
        /* No file yet means no host is trusted yet, which is the correct
        starting point rather than an error. */
        Err(source) if source.kind() == std::io::ErrorKind::NotFound => Ok(KnownHosts::default()),
        Err(source) => Err(Error::SettingsUnreadable { path, source }),
    }
}

/// What the host key screens need to render.
///
/// Read by id rather than carried on the error: the prompt wants the key type
/// and the port as well as the fingerprint, and four more fields on an error
/// variant to serve one screen is the wrong place for them.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostKeyDecisionView {
    pub host: String,
    pub port: u16,
    pub key_type: String,
    pub verdict: String,
    /// The fingerprint the host offered.
    pub offered: String,
    /// The fingerprints already trusted for this host, if any.
    pub stored: Vec<String>,
}

/// Describes a host key decision the core is holding.
#[tauri::command]
pub async fn host_key_decision(
    pending: State<'_, PendingHostKeys>,
    pending_id: PendingId,
) -> Result<HostKeyDecisionView, IpcError> {
    let offered = pending
        .describe(pending_id)
        .await
        .ok_or(Error::UnknownDecision)?;

    let (verdict, fingerprint, stored) = match &offered.verdict {
        Trust::Unknown { fingerprint, .. } => ("unknown", fingerprint.clone(), Vec::new()),
        Trust::Changed {
            offered: shown,
            stored,
            ..
        } => ("changed", shown.clone(), stored.clone()),
        Trust::Revoked { fingerprint } => ("revoked", fingerprint.clone(), Vec::new()),
        Trust::CertificateRequired { fingerprint } => {
            ("certificateRequired", fingerprint.clone(), Vec::new())
        }
        /* A matched key is never held for a decision, so reaching this means
        the registry and the verdict disagree. Refusing beats rendering a
        prompt for a host that was already trusted. */
        Trust::Matched => return Err(Error::NotAwaitingDecision.into()),
    };

    Ok(HostKeyDecisionView {
        host: offered.host,
        port: offered.port,
        key_type: offered.key_type,
        verdict: verdict.to_owned(),
        offered: fingerprint,
        stored,
    })
}

/// Every saved session, in the order they were added.
#[tauri::command]
pub async fn list_sessions<R: Runtime>(app: AppHandle<R>) -> Result<Vec<Session>, IpcError> {
    let store = SessionStore::new(config_dir(&app)?);
    Ok(store.load()?.items)
}

/// Creates a session, or replaces the one the draft names.
///
/// Returns what was stored, including the id the core assigned. The interface
/// does not invent ids: one that collided would silently overwrite a session
/// somebody else was using.
#[tauri::command]
pub async fn save_session<R: Runtime>(
    app: AppHandle<R>,
    draft: SessionDraft,
) -> Result<Session, IpcError> {
    let store = SessionStore::new(config_dir(&app)?);
    Ok(store_session(&store, draft)?)
}

/// Forgets a session. Does not touch its keychain entry — see the vault.
#[tauri::command]
pub async fn delete_session<R: Runtime>(
    app: AppHandle<R>,
    session_id: String,
) -> Result<(), IpcError> {
    let store = SessionStore::new(config_dir(&app)?);
    remove_session(&store, &session_id)?;
    Ok(())
}

/// Accepts a host key the user was shown, and writes it to `known_hosts`.
///
/// Takes the id of a refusal this core produced, not a host and a key. The
/// frontend cannot describe a key it wants trusted — it can only answer one it
/// was shown, which is what keeps rule 3's "deliberate override" from becoming
/// a boolean a future caller passes `true` to.
#[tauri::command]
pub async fn trust_host_key<R: Runtime>(
    app: AppHandle<R>,
    pending: State<'_, PendingHostKeys>,
    pending_id: PendingId,
    // For a changed key, the host name typed back. Ignored otherwise.
    confirmation: Option<String>,
) -> Result<(), IpcError> {
    let offered = pending
        .take(pending_id)
        .await
        .ok_or(Error::UnknownDecision)?;

    check_acceptance(&offered, confirmation.as_deref())?;

    let path = config_dir(&app)?.join(KNOWN_HOSTS_FILE);
    let text = std::fs::read_to_string(&path).unwrap_or_default();
    let mut known = KnownHosts::parse(&text);

    if matches!(offered.verdict, Trust::Changed { .. }) {
        known.remove_matching(&offered.host, offered.port, &offered.key_type);
    }

    known.add(KnownHosts::entry_for(
        &offered.host,
        offered.port,
        &offered.key_type,
        offered.key.clone(),
    ));

    write_known_hosts(&path, &known.to_file())?;
    Ok(())
}

/// Decides whether an offered key may be accepted at all.
///
/// Separate from the command so every refusal is reachable without a webview,
/// which matters more here than anywhere else in this file: these five
/// branches are rule 3.
pub fn check_acceptance(offered: &OfferedKey, confirmation: Option<&str>) -> Result<(), Error> {
    match &offered.verdict {
        // Nothing to do, and nothing that should have asked.
        Trust::Matched => Err(Error::NotAwaitingDecision),

        // The file says this key must never be accepted. An override here would
        // make the marker mean nothing — ADR-0009.
        Trust::Revoked { .. } => Err(Error::HostKeyRevoked),

        // The host authenticates with a certificate. Trusting a bare key
        // instead is precisely the substitution the marker warns about.
        Trust::CertificateRequired { .. } => Err(Error::HostKeyCertificateRequired),

        Trust::Unknown { .. } => Ok(()),

        Trust::Changed { .. } => {
            // Typed back, and checked *here*. Enforced only in the interface it
            // would be decoration: the core is what writes the file.
            if confirmation.unwrap_or_default().trim() == offered.host {
                Ok(())
            } else {
                Err(Error::ConfirmationMismatch)
            }
        }
    }
}

/// Writes `known_hosts` through a temporary file, as the settings store does.
///
/// A truncated `known_hosts` is worse than a missing one: a host whose entry
/// was half-written reads as *unknown* rather than *changed*, which prompts
/// where it should block.
fn write_known_hosts(path: &std::path::Path, contents: &str) -> Result<(), Error> {
    let directory = path.parent().ok_or(Error::ConfigDirUnavailable)?;

    std::fs::create_dir_all(directory).map_err(|source| Error::SettingsUnwritable {
        path: directory.to_path_buf(),
        source,
    })?;

    let temporary = directory.join("known_hosts.tmp");
    std::fs::write(&temporary, contents).map_err(|source| Error::SettingsUnwritable {
        path: temporary.clone(),
        source,
    })?;

    std::fs::rename(&temporary, path).map_err(|source| Error::SettingsUnwritable {
        path: path.to_path_buf(),
        source,
    })
}

/// Whether this machine can remember a credential at all.
///
/// Asked before offering to save one, so somebody on a machine with no secret
/// service is told up front rather than after typing a password into a
/// checkbox that could never have worked. ADR-0004 required a real answer here
/// rather than an opaque failure.
#[tauri::command]
pub async fn credential_store_status(vault: State<'_, Vault>) -> Result<Availability, IpcError> {
    Ok(vault.availability())
}

/// Remembers a session's secret in the OS credential store.
///
/// The value passes through and is gone: it is written to the keychain and
/// dropped, never echoed back and never written anywhere else.
#[tauri::command]
pub async fn remember_credential<R: Runtime>(
    app: AppHandle<R>,
    vault: State<'_, Vault>,
    session_id: String,
    password: Option<String>,
    private_key: Option<String>,
    passphrase: Option<String>,
) -> Result<(), IpcError> {
    /* Checked before anything is written: a keychain entry for a session that
    does not exist is a secret nobody can reach and nobody knows to delete. */
    if SessionStore::new(config_dir(&app)?)
        .load()?
        .find(&session_id)
        .is_none()
    {
        return Err(Error::UnknownSession { id: session_id }.into());
    }

    let secret = to_stored(password, private_key, passphrase)?.encode()?;
    persist_credential(&app, &vault, &session_id, &secret)?;

    Ok(())
}

/// Writes a secret to the keychain and points the saved session at it.
///
/// Both halves or neither: a keychain entry no session references is a secret
/// nobody can reach and nobody knows to delete, and a session pointing at an
/// entry that was never written fails at connect time with a missing
/// credential the user never chose to remove.
pub fn persist_credential<R: Runtime>(
    app: &AppHandle<R>,
    vault: &Vault,
    session_id: &str,
    secret: &zeroize::Zeroizing<String>,
) -> Result<(), Error> {
    let store = SessionStore::new(config_dir(app)?);
    let mut sessions = store.load()?;

    let id = CredentialId::for_session(session_id);
    vault.store(&id, secret)?;

    if let Some(session) = sessions
        .items
        .iter_mut()
        .find(|session| session.id == session_id)
    {
        session.credential_id = Some(id.as_str().to_owned());
    }
    store.save(&sessions)?;

    Ok(())
}

/// Forgets a session's saved secret.
#[tauri::command]
pub async fn forget_credential<R: Runtime>(
    app: AppHandle<R>,
    vault: State<'_, Vault>,
    session_id: String,
) -> Result<(), IpcError> {
    vault.forget(&CredentialId::for_session(&session_id))?;

    let store = SessionStore::new(config_dir(&app)?);
    let mut sessions = store.load()?;
    if let Some(session) = sessions
        .items
        .iter_mut()
        .find(|session| session.id == session_id)
    {
        session.credential_id = None;
    }
    store.save(&sessions)?;

    Ok(())
}

/// Authenticates using the credential saved for this session.
///
/// The frontend names the session and nothing else. The secret is resolved
/// here, used, and wiped — it never crosses toward the webview, which is rule
/// 1 and the reason the vault exists.
#[tauri::command]
pub async fn authenticate_with_saved(
    registry: State<'_, Registry>,
    vault: State<'_, Vault>,
    handle: SessionHandle,
) -> Result<(), IpcError> {
    let session_id = registry
        .session_of(handle)
        .await
        .ok_or(Error::UnknownHandle)?;

    let stored = vault.resolve(&CredentialId::for_session(&session_id))?;
    let credential = from_stored(StoredCredential::decode(&stored)?);

    let outcome = registry
        .with(handle, |mut busy: Busy| async move {
            let result = busy.connection.authenticate(&busy.user, credential).await;
            (busy, result)
        })
        .await
        .ok_or(Error::UnknownHandle)?;

    outcome.map_err(Box::new)?;
    Ok(())
}

/// Opens a connection to a saved session and verifies its host key.
///
/// Returns before authentication: the credential is collected separately, in
/// its own window, and submitted through [`authenticate_session`]. See
/// ADR-0008.
#[tauri::command]
pub async fn connect_session<R: Runtime>(
    app: AppHandle<R>,
    registry: State<'_, Registry>,
    pending: State<'_, PendingHostKeys>,
    session_id: String,
) -> Result<OpenSession, IpcError> {
    let session = saved_session(&app, &session_id)?;
    let known = known_hosts(&app)?;

    let endpoint = Endpoint {
        host: session.host.clone(),
        port: session.port,
    };

    let connection = match connect_reporting(endpoint, known).await {
        Ok(connection) => connection,
        Err((error, offered)) => {
            /* A refusal has to survive the round trip to the interface. What
            was offered is kept here, and the webview gets an id for it —
            never the decision, and never the key. */
            if let Some(offered) = offered {
                let id = pending.remember(offered).await;
                return Err(IpcError::HostKeyDecision {
                    pending: id,
                    inner: Box::new(IpcError::from(Box::new(error))),
                });
            }
            return Err(IpcError::from(Box::new(error)));
        }
    };

    let handle = registry
        .insert(Open {
            connection,
            session_id: session.id.clone(),
            user: session.user.clone(),
            input: None,
        })
        .await;

    Ok(OpenSession {
        handle,
        session_id: session.id,
        name: session.name,
        authenticated: false,
    })
}

/// Proves who we are on an already-open connection.
///
/// The secret arrives, is used, and is dropped inside this call. It is never
/// stored, never echoed back, and never reaches a log.
#[tauri::command]
pub async fn authenticate_session(
    registry: State<'_, Registry>,
    handle: SessionHandle,
    password: Option<String>,
    private_key: Option<String>,
    passphrase: Option<String>,
) -> Result<(), IpcError> {
    let credential = build_credential(password, private_key, passphrase)?;

    /* The user comes from the handle, not from the session file. Re-reading the
    file here would authenticate as whoever it happens to list now, which is
    not necessarily who this connection was opened as. */
    let outcome = registry
        .with(handle, |mut busy: Busy| async move {
            let result = busy.connection.authenticate(&busy.user, credential).await;
            (busy, result)
        })
        .await
        .ok_or(Error::UnknownHandle)?;

    outcome.map_err(Box::new)?;
    Ok(())
}

/// Closes a connection politely and forgets its handle.
#[tauri::command]
pub async fn disconnect_session(
    registry: State<'_, Registry>,
    handle: SessionHandle,
) -> Result<(), IpcError> {
    let open = registry.take(handle).await.ok_or(Error::UnknownHandle)?;
    open.connection.disconnect().await.map_err(Box::new)?;
    Ok(())
}

/// Turns the three optional fields into something the keychain can hold.
///
/// Shares its refusals with [`build_credential`]: both are the same wire shape
/// arriving from the webview, and both refuse rather than guess.
pub fn to_stored(
    password: Option<String>,
    private_key: Option<String>,
    passphrase: Option<String>,
) -> Result<StoredCredential, Error> {
    match (password, private_key) {
        (Some(_), Some(_)) => Err(Error::AmbiguousCredential),
        (Some(secret), None) => Ok(StoredCredential::Password { secret }),
        (None, Some(pem)) => Ok(StoredCredential::PrivateKey { pem, passphrase }),
        (None, None) => Err(Error::MissingCredential),
    }
}

/// Turns what the keychain held back into something to authenticate with.
pub fn from_stored(stored: StoredCredential) -> Credential {
    use zeroize::Zeroizing;

    match stored {
        StoredCredential::Password { secret } => Credential::Password(Zeroizing::new(secret)),
        StoredCredential::PrivateKey { pem, passphrase } => Credential::PrivateKey {
            pem: Zeroizing::new(pem),
            passphrase: passphrase.map(Zeroizing::new),
        },
    }
}

/// Turns the three optional fields into exactly one credential.
///
/// Kept separate so the refusals are testable without a webview: the shape the
/// webview sends is a wire format, and a wire format is something to validate,
/// not to trust.
pub fn build_credential(
    password: Option<String>,
    private_key: Option<String>,
    passphrase: Option<String>,
) -> Result<Credential, Error> {
    use zeroize::Zeroizing;

    match (password, private_key) {
        (Some(_), Some(_)) => Err(Error::AmbiguousCredential),
        (Some(password), None) => Ok(Credential::Password(Zeroizing::new(password))),
        (None, Some(pem)) => Ok(Credential::PrivateKey {
            pem: Zeroizing::new(pem),
            passphrase: passphrase.map(Zeroizing::new),
        }),
        (None, None) => Err(Error::MissingCredential),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ssh::known_hosts::KnownHosts;
    use crate::ssh::trust::decide;

    #[test]
    fn a_password_becomes_a_password_credential() {
        let credential = build_credential(Some("hunter2".to_owned()), None, None).expect("built");
        assert!(matches!(credential, Credential::Password(_)));
    }

    #[test]
    fn a_key_carries_its_passphrase() {
        let credential = build_credential(
            None,
            Some("-----BEGIN-----".to_owned()),
            Some("phrase".to_owned()),
        )
        .expect("built");

        assert!(matches!(
            credential,
            Credential::PrivateKey {
                passphrase: Some(_),
                ..
            }
        ));
    }

    #[test]
    fn sending_both_is_refused_rather_than_guessed() {
        /* Picking one would mean the frontend and the core disagree about
        which secret was used, and the user would be told the wrong thing
        when it fails. */
        assert!(matches!(
            build_credential(Some("a".to_owned()), Some("b".to_owned()), None),
            Err(Error::AmbiguousCredential)
        ));
    }

    #[test]
    fn sending_neither_is_refused() {
        assert!(matches!(
            build_credential(None, None, Some("orphan".to_owned())),
            Err(Error::MissingCredential)
        ));
    }

    fn offered(verdict: Trust) -> OfferedKey {
        OfferedKey {
            host: "web-01".to_owned(),
            port: 22,
            key_type: "ssh-ed25519".to_owned(),
            key: b"the key the server offered".to_vec(),
            verdict,
            hop: crate::ssh::connection::Hop::Target,
        }
    }

    fn a_real_change() -> Trust {
        let mut known = KnownHosts::default();
        known.add(KnownHosts::entry_for(
            "web-01",
            22,
            "ssh-ed25519",
            b"yesterday".to_vec(),
        ));
        decide(&known, "web-01", 22, "ssh-ed25519", b"today")
    }

    #[test]
    fn a_stored_password_comes_back_as_a_password() {
        /* A password read back as a private key would fail authentication in a
        way that looks like the server rejecting the user, which is the
        worst possible place for a shape to be guessed. */
        let stored = to_stored(Some("hunter2".to_owned()), None, None).expect("stored");
        let encoded = stored.encode().expect("encode");
        let decoded = StoredCredential::decode(&encoded).expect("decode");

        assert!(matches!(from_stored(decoded), Credential::Password(_)));
    }

    #[test]
    fn a_stored_key_keeps_its_passphrase() {
        let stored = to_stored(
            None,
            Some("-----BEGIN-----".to_owned()),
            Some("phrase".to_owned()),
        )
        .expect("stored");

        let decoded = StoredCredential::decode(&stored.encode().expect("encode")).expect("decode");

        assert!(matches!(
            from_stored(decoded),
            Credential::PrivateKey {
                passphrase: Some(_),
                ..
            }
        ));
    }

    #[test]
    fn storing_both_or_neither_is_refused_the_same_way() {
        /* The same refusals as the inline path: the wire shape is identical,
        and a credential that is guessed here is a credential remembered
        wrongly forever. */
        assert!(matches!(
            to_stored(Some("a".to_owned()), Some("b".to_owned()), None),
            Err(Error::AmbiguousCredential)
        ));
        assert!(matches!(
            to_stored(None, None, Some("orphan".to_owned())),
            Err(Error::MissingCredential)
        ));
    }

    #[test]
    fn what_is_stored_never_renders_itself() {
        /* It is a Debug away from a log. */
        let stored = to_stored(Some("hunter2".to_owned()), None, None).expect("stored");
        let credential = from_stored(stored);

        assert!(!format!("{credential:?}").contains("hunter2"));
    }

    #[test]
    fn an_unknown_host_may_be_accepted() {
        let unknown = Trust::Unknown {
            fingerprint: "SHA256:x".to_owned(),
            other_types: Vec::new(),
        };
        assert!(check_acceptance(&offered(unknown), None).is_ok());
    }

    #[test]
    fn a_changed_key_needs_the_host_name_typed_back() {
        let change = offered(a_real_change());

        assert!(matches!(
            check_acceptance(&change, None),
            Err(Error::ConfirmationMismatch)
        ));
        assert!(matches!(
            check_acceptance(&change, Some("")),
            Err(Error::ConfirmationMismatch)
        ));
        assert!(matches!(
            check_acceptance(&change, Some("web-02")),
            Err(Error::ConfirmationMismatch)
        ));
        assert!(check_acceptance(&change, Some("  web-01  ")).is_ok());
    }

    #[test]
    fn a_revoked_key_can_never_be_accepted() {
        /* Not "needs a stronger confirmation" — cannot. An override would make
        the marker mean nothing, and the marker exists to override
        acceptance. */
        let revoked = offered(Trust::Revoked {
            fingerprint: "SHA256:x".to_owned(),
        });

        for typed in [None, Some("web-01"), Some("yes I am sure")] {
            assert!(matches!(
                check_acceptance(&revoked, typed),
                Err(Error::HostKeyRevoked)
            ));
        }
    }

    #[test]
    fn a_certificate_host_cannot_have_a_bare_key_trusted_instead() {
        let certificate = offered(Trust::CertificateRequired {
            fingerprint: "SHA256:x".to_owned(),
        });

        assert!(matches!(
            check_acceptance(&certificate, Some("web-01")),
            Err(Error::HostKeyCertificateRequired)
        ));
    }

    #[test]
    fn a_key_that_already_matched_is_not_a_decision() {
        assert!(matches!(
            check_acceptance(&offered(Trust::Matched), None),
            Err(Error::NotAwaitingDecision)
        ));
    }
}
