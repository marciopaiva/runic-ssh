//! Session commands.
//!
//! Thin by design. Each handler resolves what it needs, calls into a domain
//! module, and maps the failure — the logic they call is testable without a
//! webview, which is the arrangement `docs/architecture.md` asks for.

use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime, State};

use crate::config::sessions::{
    check_proxy_jump, delete_session as remove_session, save_session as store_session, Session,
    SessionDraft, SessionStore,
};
use crate::error::{Error, IpcError};
use crate::ssh::connection::{
    close_shared, connect_reporting, connect_via, share, Connection, Credential, Endpoint, Hop,
    OfferedKey, Shared,
};
use crate::ssh::known_hosts::KnownHosts;
use crate::ssh::pending::{PendingHostKeys, PendingId};
use crate::ssh::registry::{Busy, Open, Registry, SessionHandle};
use crate::ssh::trust::Trust;
use crate::vault::{
    resolve_credential, Availability, CredentialId, Secret, SessionSecrets, StoredCredential, Vault,
};

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
    /// The name of the bastion this session is carried on, when there is one.
    ///
    /// Sent so the interface can say so. Going through another machine is a
    /// fact about where the keystrokes travel, and a user who does not know it
    /// is happening cannot reason about it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub via: Option<String>,
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
    /// Which host in a chain is being asked about.
    ///
    /// The screen has to say so. Two fingerprint prompts in a row, for two
    /// different hosts, are the same prompt to anybody not told which is which,
    /// and the one that gets read is the one rule 3 depends on.
    pub hop: Hop,
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
        hop: offered.hop,
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
    password: Option<Secret>,
    private_key: Option<Secret>,
    passphrase: Option<Secret>,
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
    secret: &Secret,
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
    secrets: State<'_, SessionSecrets>,
    handle: SessionHandle,
) -> Result<(), IpcError> {
    let session_id = registry
        .session_of(handle)
        .await
        .ok_or(Error::UnknownHandle)?;

    let stored = resolve_credential(&secrets, &vault, &CredentialId::for_session(&session_id))?;
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

fn endpoint_of(session: &Session) -> Endpoint {
    Endpoint {
        host: session.host.clone(),
        port: session.port,
    }
}

fn chain_failure(hop: Hop, inner: IpcError) -> IpcError {
    IpcError::ChainFailed {
        hop,
        inner: Box::new(inner),
    }
}

/// Turns a refused connection into what crosses to the webview.
///
/// A refusal has to survive the round trip to the interface. What was offered
/// is kept here, and the webview gets an id for it, never the decision and
/// never the key.
///
/// A host key refusal keeps its own shape whether or not there is a chain. The
/// interface finds a held decision by the code at the top of the error, so
/// wrapping this one in a chain failure would leave a host behind a bastion
/// with no way to accept its key at all. The hop travels inside the decision
/// instead, which is where the screen that has to name it reads from.
async fn refusal(
    pending: &PendingHostKeys,
    hop: Hop,
    chained: bool,
    error: crate::ssh::connection::ConnectionError,
    offered: Option<OfferedKey>,
) -> IpcError {
    let inner = IpcError::from(Box::new(error));

    if let Some(mut offered) = offered {
        /* Stamped here rather than in the transport, which cannot know what
        role a connection plays in a chain it was not told about. */
        offered.hop = hop;
        let id = pending.remember(offered).await;
        return IpcError::HostKeyDecision {
            pending: id,
            inner: Box::new(inner),
        };
    }

    if chained {
        return chain_failure(hop, inner);
    }

    inner
}

/// Opens the chain to a host that is behind a bastion.
///
/// The order is fixed and is the whole security content of ADR-0023: the
/// bastion's key is verified, the bastion is authenticated, the channel is
/// opened, and only then is the far host's key verified and its credential
/// used. Rule 3 applies at both hops, and the host that carries the others is
/// not the one to make an exception for.
///
/// Nothing is left open on any failure path. A bastion nobody can reach holds
/// a slot against the server's `MaxSessions` until the application restarts.
async fn open_through(
    pending: &PendingHostKeys,
    registry: &Registry,
    vault: &Vault,
    secrets: &SessionSecrets,
    bastion: &Session,
    target: &Session,
    known: KnownHosts,
) -> Result<Connection, IpcError> {
    /* A bastion already open is ridden rather than opened again. ADR-0024, and
    the reason a machine with no keychain can still reach a host behind one: the
    credential was used when that connection was made and is not needed twice.
    Six hosts behind a bastion cost it one login, not six. */
    let carrier = match registry.shared_of_session(&bastion.id).await {
        Some(open) => open,
        None => open_bastion(pending, vault, secrets, bastion, known.clone()).await?,
    };

    match connect_via(Arc::clone(&carrier), endpoint_of(target), known).await {
        Ok(connection) => Ok(connection),
        Err(failure) => {
            /* Letting go of our share. It closes only if nothing else was
            riding it, which is the whole of the lifetime rule. */
            let _ = close_shared(carrier).await;
            Err(refusal(pending, Hop::Target, true, failure.error, failure.offered).await)
        }
    }
}

/// Opens and authenticates a bastion nobody had open.
///
/// Registered by the caller so the next chain to the same host finds it, rather
/// than the core holding a connection it cannot name.
async fn open_bastion(
    pending: &PendingHostKeys,
    vault: &Vault,
    secrets: &SessionSecrets,
    bastion: &Session,
    known: KnownHosts,
) -> Result<Shared, IpcError> {
    let mut carrier = match connect_reporting(endpoint_of(bastion), known).await {
        Ok(connection) => connection,
        Err((error, offered)) => {
            return Err(refusal(pending, Hop::Bastion, true, error, offered).await)
        }
    };

    /* ADR-0023: the bastion authenticates from the keychain and never opens a
    window. A password prompt for the bastion on the way to every host behind
    it, on a machine crossed dozens of times a day, is what makes somebody stop
    using the feature. A bastion with nothing saved is refused, and the error
    says which host it is talking about. */
    let credential =
        match resolve_credential(secrets, vault, &CredentialId::for_session(&bastion.id))
            .and_then(|stored| StoredCredential::decode(&stored))
        {
            Ok(stored) => from_stored(stored),
            Err(error) => {
                let _ = carrier.disconnect().await;
                return Err(chain_failure(Hop::Bastion, IpcError::from(error)));
            }
        };

    if let Err(error) = carrier.authenticate(&bastion.user, credential).await {
        let _ = carrier.disconnect().await;
        return Err(chain_failure(Hop::Bastion, IpcError::from(Box::new(error))));
    }

    Ok(share(carrier))
}

/// Opens a connection to a saved session and verifies its host key.
///
/// Returns before authentication: the credential of the host the user asked
/// for is collected separately, in its own window, and submitted through
/// [`authenticate_session`]. See ADR-0008.
///
/// A session behind a bastion is the exception, and the only one: the bastion
/// has to be authenticated before it will open a channel, so its credential is
/// resolved here. It comes from the keychain and never from a window.
#[tauri::command]
pub async fn connect_session<R: Runtime>(
    app: AppHandle<R>,
    registry: State<'_, Registry>,
    pending: State<'_, PendingHostKeys>,
    vault: State<'_, Vault>,
    secrets: State<'_, SessionSecrets>,
    session_id: String,
) -> Result<OpenSession, IpcError> {
    let sessions = SessionStore::new(config_dir(&app)?).load()?;
    let session = sessions
        .find(&session_id)
        .cloned()
        .ok_or(Error::UnknownSession { id: session_id })?;
    let known = known_hosts(&app)?;

    let (connection, via) = match session.proxy_jump.clone() {
        None => (
            match connect_reporting(endpoint_of(&session), known).await {
                Ok(connection) => connection,
                Err((error, offered)) => {
                    return Err(refusal(&pending, Hop::Target, false, error, offered).await)
                }
            },
            None,
        ),
        Some(bastion_id) => {
            /* Checked again here, and this is the check that counts. The one in
            `save_session` is immediate feedback on a form; this one runs
            against the file as it is now, after the bastion may have been
            deleted or given a jump host of its own. */
            check_proxy_jump(&sessions, Some(&session.id), Some(&bastion_id))
                .map_err(|problem| Error::InvalidProxyJump { problem })?;

            let bastion = sessions
                .find(&bastion_id)
                .cloned()
                .ok_or(Error::UnknownSession { id: bastion_id })?;

            let connection = open_through(
                &pending, &registry, &vault, &secrets, &bastion, &session, known,
            )
            .await?;
            (connection, Some(bastion.name))
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
        via,
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
    password: Option<Secret>,
    private_key: Option<Secret>,
    passphrase: Option<Secret>,
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
    /* Closes the connection only when nothing else is riding it. A bastion
    serving five other sessions survives its own tab being closed, which is
    ADR-0024 and is what somebody watching the screen already expects. */
    registry
        .close(handle)
        .await
        .ok_or(Error::UnknownHandle)?
        .map_err(Box::new)?;
    Ok(())
}

/// Turns the three optional fields into something the keychain can hold.
///
/// Shares its refusals with [`build_credential`]: both are the same wire shape
/// arriving from the webview, and both refuse rather than guess.
pub fn to_stored(
    password: Option<Secret>,
    private_key: Option<Secret>,
    passphrase: Option<Secret>,
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
    match stored {
        StoredCredential::Password { secret } => Credential::Password(secret),
        StoredCredential::PrivateKey { pem, passphrase } => {
            Credential::PrivateKey { pem, passphrase }
        }
    }
}

/// Turns the three optional fields into exactly one credential.
///
/// Kept separate so the refusals are testable without a webview: the shape the
/// webview sends is a wire format, and a wire format is something to validate,
/// not to trust.
pub fn build_credential(
    password: Option<Secret>,
    private_key: Option<Secret>,
    passphrase: Option<Secret>,
) -> Result<Credential, Error> {
    match (password, private_key) {
        (Some(_), Some(_)) => Err(Error::AmbiguousCredential),
        (Some(password), None) => Ok(Credential::Password(password)),
        (None, Some(pem)) => Ok(Credential::PrivateKey { pem, passphrase }),
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
        let credential = build_credential(Some(Secret::new("hunter2")), None, None).expect("built");
        assert!(matches!(credential, Credential::Password(_)));
    }

    #[test]
    fn a_key_carries_its_passphrase() {
        let credential = build_credential(
            None,
            Some(Secret::new("-----BEGIN-----")),
            Some(Secret::new("phrase")),
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
            build_credential(Some(Secret::new("a")), Some(Secret::new("b")), None),
            Err(Error::AmbiguousCredential)
        ));
    }

    #[test]
    fn sending_neither_is_refused() {
        assert!(matches!(
            build_credential(None, None, Some(Secret::new("orphan"))),
            Err(Error::MissingCredential)
        ));
    }

    /* ---------------------------------------------------------------- *
     * How a refusal crosses when there is a chain. ADR-0023.
     * ---------------------------------------------------------------- */

    #[tokio::test]
    async fn a_host_key_refusal_is_never_wrapped_in_a_chain_failure() {
        /* The interface finds a held decision by the code at the top of the
        error. Wrapping this one would leave a host behind a bastion unable to
        have its key accepted at all, which is rule 3 defeated by a wrapper. */
        let pending = PendingHostKeys::new();

        let crossed = refusal(
            &pending,
            Hop::Target,
            true,
            crate::ssh::connection::ConnectionError::HostKeyRejected(Box::new(Trust::Unknown {
                fingerprint: "SHA256:x".to_owned(),
                other_types: Vec::new(),
            })),
            Some(offered(Trust::Unknown {
                fingerprint: "SHA256:x".to_owned(),
                other_types: Vec::new(),
            })),
        )
        .await;

        assert!(matches!(crossed, IpcError::HostKeyDecision { .. }));
    }

    #[tokio::test]
    async fn the_hop_is_stamped_on_what_the_prompt_reads() {
        /* The transport cannot know a connection's role in a chain it was not
        told about, so the command stamps it. The prompt reads it back by id. */
        let pending = PendingHostKeys::new();

        let crossed = refusal(
            &pending,
            Hop::Bastion,
            true,
            crate::ssh::connection::ConnectionError::HostKeyRejected(Box::new(Trust::Unknown {
                fingerprint: "SHA256:x".to_owned(),
                other_types: Vec::new(),
            })),
            Some(offered(Trust::Unknown {
                fingerprint: "SHA256:x".to_owned(),
                other_types: Vec::new(),
            })),
        )
        .await;

        let IpcError::HostKeyDecision { pending: id, .. } = crossed else {
            panic!("a held decision");
        };

        let held = pending.describe(id).await.expect("it is held");
        assert_eq!(held.hop, Hop::Bastion);
    }

    #[tokio::test]
    async fn a_chain_failure_says_which_hop_it_happened_at() {
        let pending = PendingHostKeys::new();

        let crossed = refusal(
            &pending,
            Hop::Bastion,
            true,
            crate::ssh::connection::ConnectionError::Unreachable,
            None,
        )
        .await;

        assert!(matches!(
            crossed,
            IpcError::ChainFailed {
                hop: Hop::Bastion,
                ref inner,
            } if **inner == IpcError::HostUnreachable
        ));
    }

    #[tokio::test]
    async fn a_direct_failure_is_not_dressed_up_as_a_chain() {
        /* Every session that is not behind a bastion goes through here, so a
        wrapper leaking onto the ordinary path would change every failure code
        the interface already handles. */
        let pending = PendingHostKeys::new();

        let crossed = refusal(
            &pending,
            Hop::Target,
            false,
            crate::ssh::connection::ConnectionError::Unreachable,
            None,
        )
        .await;

        assert_eq!(crossed, IpcError::HostUnreachable);
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
        let stored = to_stored(Some(Secret::new("hunter2")), None, None).expect("stored");
        let encoded = stored.encode().expect("encode");
        let decoded = StoredCredential::decode(&encoded).expect("decode");

        assert!(matches!(from_stored(decoded), Credential::Password(_)));
    }

    #[test]
    fn a_stored_key_keeps_its_passphrase() {
        let stored = to_stored(
            None,
            Some(Secret::new("-----BEGIN-----")),
            Some(Secret::new("phrase")),
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
            to_stored(Some(Secret::new("a")), Some(Secret::new("b")), None),
            Err(Error::AmbiguousCredential)
        ));
        assert!(matches!(
            to_stored(None, None, Some(Secret::new("orphan"))),
            Err(Error::MissingCredential)
        ));
    }

    #[test]
    fn what_is_stored_never_renders_itself() {
        /* It is a Debug away from a log. */
        let stored = to_stored(Some(Secret::new("hunter2")), None, None).expect("stored");
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
