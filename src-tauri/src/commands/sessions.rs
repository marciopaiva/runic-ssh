//! Session commands.
//!
//! Thin by design. Each handler resolves what it needs, calls into a domain
//! module, and maps the failure — the logic they call is testable without a
//! webview, which is the arrangement `docs/architecture.md` asks for.

use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime, State};

use crate::commands::credential::{ask, ask_inline};
use crate::config::sessions::{
    check_proxy_jump, delete_session as remove_session, save_session as store_session, Session,
    SessionDraft, SessionStore,
};
use crate::error::{Error, IpcError};
use crate::ssh::connection::{
    close_shared, connect_reporting, connect_via, share, Connection, Credential, Endpoint, Hop,
    OfferedKey, Shared,
};
use crate::ssh::credentials::{CredentialPrompt, CredentialRequests, Keep};
use crate::ssh::known_hosts::KnownHosts;
use crate::ssh::pending::{Carried, CarriedCredentials, PendingHostKeys, PendingId};
use crate::ssh::registry::{Busy, ChainedBastions, Open, Registry, SessionHandle};
use crate::ssh::trust::Trust;
use crate::vault::{
    can_remember, resolve_credential, store_credential, Availability, CredentialId, InternalVault,
    Secret, SessionSecrets, StoredCredential, Vault,
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
    /// Whether the jump host's credential was asked to be kept and refused.
    ///
    /// Only about the hop the user has no tab for. The credential of the host
    /// they clicked is answered by `authenticate_interactively`, which returns
    /// `Keeping` and is where #167 is already reported.
    ///
    /// Always serialized, never skipped when false. A field that is absent
    /// rather than `false` arrives as `undefined`, and a frontend comparing it
    /// against `false` reads every session as a refusal. That is the trap
    /// `credentialId` and `proxyJump` have both sprung, and a bool has no
    /// reason to pay for it.
    pub keep_refused: bool,
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

/// Drops a decision nobody answered, and whatever it was carrying.
///
/// Cancelling a host key prompt used to reach the core not at all: the
/// interface bumped a generation, dropped the attempt, and the entry sat in
/// `PendingHostKeys` until the process ended. That was one host name and one
/// key, which is untidy rather than dangerous.
///
/// ADR-0027 makes it dangerous. A decision can now be holding the credential
/// somebody typed for the jump host, and a secret the user asked us not to keep
/// must not outlive the attempt they abandoned. So the way out has to be told
/// as well as the way through.
///
/// Answering an id that is not there is not an error. The user cancelled;
/// whether anything was still held is our bookkeeping, not theirs.
#[tauri::command]
pub async fn dismiss_host_key(
    pending: State<'_, PendingHostKeys>,
    carried: State<'_, CarriedCredentials>,
    pending_id: PendingId,
) -> Result<(), IpcError> {
    pending.take(pending_id).await;
    carried.forget(pending_id).await;

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
///
/// ADR-0035 folded a second store into this answer rather than leaving it
/// asking only about the OS keychain: `InlineCredentialForm` reads this to
/// decide what it tells the wizard's own test will happen to the secret, and
/// an installation that opted into the internal vault instead would
/// otherwise be told nothing is available when something plainly is.
#[tauri::command]
pub async fn credential_store_status(
    vault: State<'_, Vault>,
    internal: State<'_, InternalVault>,
) -> Result<Availability, IpcError> {
    if can_remember(&vault, &internal) {
        return Ok(Availability::Available);
    }

    Ok(vault.availability())
}

/// Whether the internal vault (ADR-0035) is set up, and if so, whether this
/// session has unlocked it. `Availability` above is a different question and
/// stays a different question: this answers "has the maintainer opted in and
/// unlocked it," not "does the OS have a keychain."
#[tauri::command]
pub async fn internal_vault_status(
    internal: State<'_, InternalVault>,
) -> Result<crate::vault::InternalVaultState, IpcError> {
    Ok(internal.status()?)
}

/// Turns the internal vault on: creates it under `password`, and migrates
/// every credential currently in the OS keychain into it.
///
/// Nothing is removed from the OS keychain by this call. An entry nothing
/// reads any more is inert, and leaving it is simpler and safer than adding a
/// delete path whose own failure would need its own handling. See ADR-0035.
#[tauri::command]
pub async fn enable_internal_vault<R: Runtime>(
    app: AppHandle<R>,
    vault: State<'_, Vault>,
    internal: State<'_, InternalVault>,
    password: Secret,
) -> Result<(), IpcError> {
    let sessions = SessionStore::new(config_dir(&app)?).load()?;

    let mut existing = Vec::new();
    for session in &sessions.items {
        if session.credential_id.is_none() {
            continue;
        }
        let id = CredentialId::for_session(&session.id);
        if let Ok(secret) = vault.resolve(&id) {
            existing.push((id, secret));
        }
    }

    internal.enable(&password, &existing)?;
    Ok(())
}

/// Unlocks the internal vault for the rest of this session.
#[tauri::command]
pub async fn unlock_internal_vault(
    internal: State<'_, InternalVault>,
    password: Secret,
) -> Result<(), IpcError> {
    internal.unlock(&password)?;
    Ok(())
}

/// Turns the internal vault back off: writes every credential it holds back
/// into the OS keychain under the key this session already unlocked it
/// with, then deletes the internal vault's file.
///
/// The mirror of `enable_internal_vault`. No password: unlocking already
/// proved it once, and this is not asked for it again any more than
/// resolving one saved credential is. Refuses with `vaultLocked` if called
/// without having unlocked first, which the frontend no longer offers a way
/// to do.
#[tauri::command]
pub async fn disable_internal_vault(
    vault: State<'_, Vault>,
    internal: State<'_, InternalVault>,
) -> Result<(), IpcError> {
    let migrated = internal.disable()?;

    for (id, secret) in &migrated {
        vault.store(id, secret)?;
    }

    Ok(())
}

/// The "I forgot the password" exit: wipes the internal vault outright, no
/// password needed. Every credential that lived only there has to be typed
/// again. Named on the toggle before it is ever turned on, not discovered
/// after the fact.
#[tauri::command]
pub async fn reset_internal_vault(internal: State<'_, InternalVault>) -> Result<(), IpcError> {
    internal.reset()?;
    Ok(())
}

/// Remembers a session's secret in whichever store this installation uses.
///
/// The value passes through and is gone: it is written to the store and
/// dropped, never echoed back and never written anywhere else.
#[tauri::command]
pub async fn remember_credential<R: Runtime>(
    app: AppHandle<R>,
    vault: State<'_, Vault>,
    internal: State<'_, InternalVault>,
    session_id: String,
    password: Option<Secret>,
    private_key: Option<Secret>,
    passphrase: Option<Secret>,
) -> Result<(), IpcError> {
    /* Checked before anything is written: a store entry for a session that
    does not exist is a secret nobody can reach and nobody knows to delete. */
    if SessionStore::new(config_dir(&app)?)
        .load()?
        .find(&session_id)
        .is_none()
    {
        return Err(Error::UnknownSession { id: session_id }.into());
    }

    let secret = to_stored(password, private_key, passphrase)?.encode()?;
    persist_credential(&app, &vault, &internal, &session_id, &secret)?;

    Ok(())
}

/// Keeps a secret for the life of this run, without writing it anywhere.
///
/// ADR-0032. The wizard's own inline test authenticates through
/// [`authenticate_session`] rather than the credential window, which is the
/// one place `SessionSecrets::keep` was previously reached from. Without
/// this, "until Runic SSH closes, in memory only", the middle tier
/// ADR-0025 built because it is what most people actually want, would be
/// unreachable from that path, leaving two of its three answers instead of
/// three.
#[tauri::command]
pub async fn keep_credential_for_run<R: Runtime>(
    app: AppHandle<R>,
    secrets: State<'_, SessionSecrets>,
    session_id: String,
    password: Option<Secret>,
    private_key: Option<Secret>,
    passphrase: Option<Secret>,
) -> Result<(), IpcError> {
    /* The same check `remember_credential` makes, for the same reason: a run
    holding a secret keyed to a session that does not exist is a secret with
    nothing to be used for. */
    if SessionStore::new(config_dir(&app)?)
        .load()?
        .find(&session_id)
        .is_none()
    {
        return Err(Error::UnknownSession { id: session_id }.into());
    }

    let secret = to_stored(password, private_key, passphrase)?.encode()?;
    secrets.keep(&CredentialId::for_session(&session_id), &secret);

    Ok(())
}

/// Whether a credential is kept for this session for the life of the run.
///
/// ADR-0038: the counterpart to `credential_id` on a saved [`Session`], which
/// only ever named the keychain half. The editor already has that field; this
/// is the only way it has to ask about the other one.
#[tauri::command]
pub async fn session_credential_kept(
    secrets: State<'_, SessionSecrets>,
    session_id: String,
) -> Result<bool, IpcError> {
    Ok(secrets.is_held(&CredentialId::for_session(&session_id)))
}

/// Writes a secret to whichever store this installation uses and points the
/// saved session at it.
///
/// Both halves or neither: a store entry no session references is a secret
/// nobody can reach and nobody knows to delete, and a session pointing at an
/// entry that was never written fails at connect time with a missing
/// credential the user never chose to remove.
pub fn persist_credential<R: Runtime>(
    app: &AppHandle<R>,
    vault: &Vault,
    internal: &InternalVault,
    session_id: &str,
    secret: &Secret,
) -> Result<(), Error> {
    let store = SessionStore::new(config_dir(app)?);
    let mut sessions = store.load()?;

    let id = CredentialId::for_session(session_id);
    store_credential(vault, internal, &id, secret)?;

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
    internal: State<'_, InternalVault>,
    secrets: State<'_, SessionSecrets>,
    session_id: String,
) -> Result<(), IpcError> {
    /* Both copies, and the run's first. Clearing only the store would leave
    `resolve_credential` answering exactly as before, so the next connection
    would still not ask and the button would have said something it did not
    do. See `vault::forget_credential`. */
    crate::vault::forget_credential(
        &secrets,
        &vault,
        &internal,
        &CredentialId::for_session(&session_id),
    )?;

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
    internal: State<'_, InternalVault>,
    secrets: State<'_, SessionSecrets>,
    handle: SessionHandle,
) -> Result<(), IpcError> {
    let session_id = registry
        .session_of(handle)
        .await
        .ok_or(Error::UnknownHandle)?;

    let stored = resolve_credential(
        &secrets,
        &vault,
        &internal,
        &CredentialId::for_session(&session_id),
    )?;
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
    /* What the bastion was authenticated with, when it was typed rather than
    read, and only for the hop whose decision causes a rebuild. Answering this
    decision reopens the chain from the beginning; without this the user is
    asked for the same host a second time, at the moment they are expecting to
    be asked for the other one. */
    carry: Option<(&CarriedCredentials, Carried)>,
) -> IpcError {
    let inner = IpcError::from(Box::new(error));

    if let Some(mut offered) = offered {
        /* Stamped here rather than in the transport, which cannot know what
        role a connection plays in a chain it was not told about. */
        offered.hop = hop;
        let id = pending.remember(offered).await;

        if let Some((store, carrying)) = carry {
            store.hold(id, carrying).await;
        }

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

/// What opening a chain needs from the application, in one value.
///
/// Seven references that always travel together, and which clippy is right to
/// refuse as seven parameters. Grouping them also says something true: these
/// belong to the application rather than to the chain, and the chain borrows
/// all of them for exactly as long as one connect attempt lasts.
struct Chain<'a, R: Runtime> {
    app: &'a AppHandle<R>,
    pending: &'a PendingHostKeys,
    carried: &'a CarriedCredentials,
    registry: &'a Registry,
    /// Bastions a chain has already opened, checked before opening another.
    /// ADR-0037.
    chained_bastions: &'a ChainedBastions,
    requests: &'a CredentialRequests,
    vault: &'a Vault,
    internal: &'a InternalVault,
    secrets: &'a SessionSecrets,
    /// The decision this attempt is continuing, when it is a retry.
    continuing: Option<PendingId>,
    /// Whether a bastion's credential, if one is needed, should be asked for
    /// inline rather than through the separate window. ADR-0033: set only by
    /// the wizard's own test, which has nowhere else for the answer to be
    /// typed that would not reopen the problem ADR-0032 already closed for
    /// the target's own credential.
    inline: bool,
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
///
/// Returns whether the bastion's credential was asked to be kept and refused,
/// because this is the only place that learns it and the session it belongs to
/// is the one being opened here. #191.
async fn open_through<R: Runtime>(
    chain: &Chain<'_, R>,
    bastion: &Session,
    target: &Session,
    known: KnownHosts,
) -> Result<(Connection, bool), IpcError> {
    /* A bastion already open is ridden rather than opened again. ADR-0024, and
    the reason a machine with no keychain can still reach a host behind one: the
    credential was used when that connection was made and is not needed twice.
    Six hosts behind a bastion cost it one login, not six. Nothing was asked of
    the keychain on this attempt either, which is why it reports no refusal.

    Two places to look, in order: a bastion the user opened as a session of
    their own, findable by its handle in the registry; then one a chain opened
    on somebody else's behalf, findable only through the weak trace ADR-0037
    leaves for exactly this. Opening a fresh one is the last resort, not the
    default. */
    let crossed = match chain.registry.shared_of_session(&bastion.id).await {
        Some(carrier) => Crossed {
            carrier,
            typed: None,
            keep_refused: false,
        },
        None => match chain.chained_bastions.find(&bastion.id).await {
            Some(carrier) => Crossed {
                carrier,
                typed: None,
                keep_refused: false,
            },
            None => {
                let opened = open_bastion(chain, bastion, &target.name, known.clone()).await?;
                chain
                    .chained_bastions
                    .remember(bastion.id.clone(), &opened.carrier)
                    .await;
                opened
            }
        },
    };

    let Crossed {
        carrier,
        typed,
        keep_refused,
    } = crossed;

    match connect_via(Arc::clone(&carrier), endpoint_of(target), known).await {
        Ok(connection) => Ok((connection, keep_refused)),
        Err(failure) => {
            /* Letting go of our share. It closes only if nothing else was
            riding it, which is the whole of the lifetime rule. */
            let _ = close_shared(carrier).await;

            /* A typed bastion credential travels with the decision, and only
            when there is a decision. Any other failure drops it: reusing a
            password the far host refused would retry it forever, and holding
            one for a chain that ended is holding a secret nobody asked us to
            keep. `refusal` stores it only on the branch that makes an id. */
            Err(refusal(
                chain.pending,
                Hop::Target,
                true,
                failure.error,
                failure.offered,
                typed.map(|credential| {
                    (
                        chain.carried,
                        Carried {
                            credential,
                            keep_refused,
                        },
                    )
                }),
            )
            .await)
        }
    }
}

/// Whether a bastion with no usable saved credential should be asked about.
///
/// ADR-0027 lets the bastion prompt, and deliberately does not let it prompt on
/// everything. Two failures mean nothing was ever saved and asking is the only
/// way forward: no entry for this session, and a machine with no credential
/// store at all. Every other failure means a store exists and said no, and a
/// locked keyring is a different thing from an absent one. Falling back on both
/// would teach people to retype a password whenever the keyring is locked,
/// which is how a keyring stops being worth having.
fn worth_asking(error: &Error) -> bool {
    matches!(
        error,
        Error::NoSavedCredential | Error::KeychainUnavailable { .. }
    )
}

/// Opens and authenticates a bastion nobody had open.
///
/// Registered by the caller so the next chain to the same host finds it, rather
/// than the core holding a connection it cannot name.
///
/// The credential comes from three places, in this order: the decision this
/// attempt is continuing, the keychain, and a window. ADR-0027, and the order
/// ADR-0008 depends on is intact: `connect_reporting` has verified this host's
/// key before anything here can ask for a password.
///
/// Returns the credential when it was typed at this hop and kept nowhere,
/// encoded the way the vault holds one, because the caller may have to hand it
/// to a host key decision rather than ask for it a second time.
/// What crossing a bastion produced, beyond the connection itself.
struct Crossed {
    carrier: Shared,
    /// The credential typed here and kept nowhere, when there is one.
    typed: Option<Secret>,
    /// The user asked for it to be kept and the store refused. #191.
    keep_refused: bool,
}

async fn open_bastion<R: Runtime>(
    chain: &Chain<'_, R>,
    bastion: &Session,
    carrying: &str,
    known: KnownHosts,
) -> Result<Crossed, IpcError> {
    let mut carrier = match connect_reporting(endpoint_of(bastion), known).await {
        Ok(connection) => connection,
        Err((error, offered)) => {
            return Err(refusal(chain.pending, Hop::Bastion, true, error, offered, None).await)
        }
    };

    let id = CredentialId::for_session(&bastion.id);

    /* Answered already, on the attempt this one is continuing. Accepting the
    far host's key rebuilds the chain from the beginning, so without this the
    same host is asked a second time, in the position where the user is
    expecting to be asked for the other one. Taken rather than read: one
    answer, one retry. */
    let continued = match chain.continuing {
        Some(decision) => chain.carried.take(decision).await,
        None => None,
    };

    /* Carried from the attempt this one is continuing, when there was one. A
    keychain that refused before this rebuild refused for good: the rebuild
    authenticates with the credential it was handed and asks nothing of the
    store, so recomputing it here would report success for a save that never
    happened. #191. */
    let refused_before = continued
        .as_ref()
        .is_some_and(|carrying| carrying.keep_refused);

    /* Saved first, always. ADR-0023's argument survives ADR-0027 whole: a
    bastion is crossed dozens of times a day, and a window on the way to every
    host behind it is what makes somebody stop using the feature. The prompt is
    for the case where there is nothing to read, not an alternative to reading
    it. */
    let saved = || {
        resolve_credential(chain.secrets, chain.vault, chain.internal, &id)
            .and_then(|stored| StoredCredential::decode(&stored))
    };

    /* `carry` is the whole of the difference: whether this answer has anywhere
    else to be found if the chain is rebuilt. One read back out of the keychain
    does; one typed into a window and not kept does not. */
    let (stored, keep, carry) = match continued.map(|carrying| carrying.credential) {
        Some(secret) => match StoredCredential::decode(&secret) {
            Ok(stored) => (stored, Keep::Never, true),
            Err(error) => {
                let _ = carrier.disconnect().await;
                return Err(chain_failure(Hop::Bastion, IpcError::from(error)));
            }
        },
        None => match saved() {
            Ok(stored) => (stored, Keep::Never, false),
            Err(error) if worth_asking(&error) => {
                let prompt = CredentialPrompt {
                    session_name: bastion.name.clone(),
                    user: bastion.user.clone(),
                    host: bastion.host.clone(),
                    port: bastion.port,
                    can_remember: can_remember(chain.vault, chain.internal),
                    /* What makes this window tellable from the one that follows
                    it. Without it they are two identical prompts in a row for
                    two different hosts, which is what ADR-0023 refused to
                    ship. */
                    carrying: Some(carrying.to_owned()),
                    /* Nobody has an opinion about a bastion's credential kind
                    ahead of time; only the editor's own test, on the host the
                    user clicked, ever suggests one. ADR-0030. */
                    suggested_method: None,
                };

                let answer = if chain.inline {
                    ask_inline(chain.app, chain.requests, prompt).await
                } else {
                    ask(chain.app, chain.requests, prompt).await
                };

                match answer {
                    Ok((stored, keep)) => (stored, keep, keep == Keep::Never),
                    Err(error) => {
                        /* Including a dismissal. A bastion left open on a
                        refusal holds a slot against the server's `MaxSessions`
                        until the application restarts, and nothing on screen
                        would name it. */
                        let _ = carrier.disconnect().await;
                        return Err(chain_failure(Hop::Bastion, IpcError::from(error)));
                    }
                }
            }
            Err(error) => {
                let _ = carrier.disconnect().await;
                return Err(chain_failure(Hop::Bastion, IpcError::from(error)));
            }
        },
    };

    /* Encoded before authenticating, because authenticating consumes it, and
    acted on only after the host has accepted. Saving a secret the server
    refused is how a keychain fills up with typos, and carrying one forward is
    how a wrong password gets retried until somebody gives up. */
    let keepsake = match keep {
        Keep::Never if !carry => None,
        _ => Some(stored.encode().map_err(IpcError::from)?),
    };

    let credential = from_stored(stored);

    if let Err(error) = carrier.authenticate(&bastion.user, credential).await {
        let _ = carrier.disconnect().await;
        return Err(chain_failure(Hop::Bastion, IpcError::from(Box::new(error))));
    }

    let mut typed = None;
    let mut keep_refused = refused_before;

    if let Some(secret) = keepsake {
        match keep {
            /* Nowhere near a disk, so nothing can refuse it. This is the answer
            that makes a machine with no keychain usable: one prompt for this
            bastion serves every host behind it for the life of the process,
            because `resolve_credential` reads this store before the vault. */
            Keep::ForThisRun => chain.secrets.keep(&id, &secret),
            /* A keychain that refuses must not undo a connection that worked.
            The far hop is still to come and it is the one the user asked for.

            But a refusal here means nothing will find this credential on the
            rebuild, and a rebuild is one accepted host key away. Without the
            carry, asking to save it and being refused puts the second window
            back, in the one case where the user has least reason to expect it.
            This is #167's shape at a hop that cannot report it yet. */
            Keep::Stored => {
                if persist_credential(chain.app, chain.vault, chain.internal, &bastion.id, &secret)
                    .is_err()
                {
                    keep_refused = true;
                    typed = Some(secret);
                }
            }
            /* Kept by nothing, so it goes back to the caller and lives exactly
            as long as the decision it is about to be attached to. */
            Keep::Never => typed = Some(secret),
        }
    }

    Ok(Crossed {
        carrier: share(carrier),
        typed,
        keep_refused,
    })
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
/* Eleven, of which eight are state Tauri injects and one is the handle it
builds. There is one call site and it is generated. Grouping them would mean
wrapping the framework's own injection to satisfy a lint about human call
sites that this function does not have. */
#[allow(clippy::too_many_arguments)]
pub async fn connect_session<R: Runtime>(
    app: AppHandle<R>,
    registry: State<'_, Registry>,
    chained_bastions: State<'_, ChainedBastions>,
    pending: State<'_, PendingHostKeys>,
    carried: State<'_, CarriedCredentials>,
    requests: State<'_, CredentialRequests>,
    vault: State<'_, Vault>,
    internal: State<'_, InternalVault>,
    secrets: State<'_, SessionSecrets>,
    session_id: String,
    /* The decision this attempt continues, when the interface is retrying after
    a host key was accepted. An opaque id, the same shape the decision itself
    crosses as: it names a thing the webview cannot forge and carries nothing
    about the session. */
    continuing: Option<PendingId>,
    /* Whether a bastion's own credential, if this session needs one and
    nothing is saved, should be asked for inline rather than through the
    separate window. ADR-0033. */
    inline: bool,
) -> Result<OpenSession, IpcError> {
    let sessions = SessionStore::new(config_dir(&app)?).load()?;
    let session = sessions
        .find(&session_id)
        .cloned()
        .ok_or(Error::UnknownSession { id: session_id })?;
    let known = known_hosts(&app)?;

    let (connection, via, keep_refused) = match session.proxy_jump.clone() {
        None => (
            match connect_reporting(endpoint_of(&session), known).await {
                Ok(connection) => connection,
                Err((error, offered)) => {
                    return Err(refusal(&pending, Hop::Target, false, error, offered, None).await)
                }
            },
            None,
            false,
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

            let chain = Chain {
                app: &app,
                pending: &pending,
                carried: &carried,
                registry: &registry,
                chained_bastions: &chained_bastions,
                requests: &requests,
                vault: &vault,
                internal: &internal,
                secrets: &secrets,
                continuing,
                inline,
            };

            let (connection, keep_refused) =
                open_through(&chain, &bastion, &session, known).await?;
            (connection, Some(bastion.name), keep_refused)
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
        keep_refused,
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
            None,
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
            None,
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

    /// ADR-0027 lets a bastion prompt, and the whole of the restraint in that
    /// decision is which failures reach the window. A store that exists and
    /// said no is not a store that was never there.
    #[test]
    fn nothing_saved_and_nowhere_to_save_are_the_two_that_ask() {
        assert!(worth_asking(&Error::NoSavedCredential));
        assert!(worth_asking(&Error::KeychainUnavailable {
            reason: "this machine has no credential store configured".to_owned(),
        }));
    }

    /// The defect this whole mechanism exists for, at the level a test reaches.
    ///
    /// Accepting the far host's key rebuilds the chain, so the credential typed
    /// for the jump host has to survive the round trip or the same host is
    /// asked a second time, in the position where the user is expecting to be
    /// asked for the other one. Somebody typed the far host's password into
    /// that second window on their first attempt, on 2026-08-26, which is how
    /// this was found.
    #[tokio::test]
    async fn a_typed_credential_travels_with_the_decision_that_interrupts_it() {
        let pending = PendingHostKeys::new();
        let carried = CarriedCredentials::new();

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
            Some((
                &carried,
                Carried {
                    credential: Secret::new("what the user typed"),
                    keep_refused: false,
                },
            )),
        )
        .await;

        let IpcError::HostKeyDecision { pending: id, .. } = crossed else {
            panic!("a decision is what the far host's key produces");
        };

        assert_eq!(carried.count().await, 1);

        let held = carried.take(id).await.expect("the retry finds it");
        assert_eq!(held.credential.expose(), "what the user typed");

        /* Take-once. A retry that arrives twice asks again rather than reusing
        a secret nobody has re-authorised. */
        assert!(carried.take(id).await.is_none());
    }

    #[tokio::test]
    async fn a_refused_keep_travels_with_the_decision_too() {
        /* #191. The refusal happens at the bastion, and the attempt it happened
        on can end in a host key decision at the far host rather than in a
        session. That is not a rare corner: it is the first connection to a host
        behind a bastion, which is exactly when somebody is typing that
        bastion's password for the first time. Without this the fact is dropped
        and the user finds out on a later run, by being asked again for a host
        they believed they had saved. */
        let pending = PendingHostKeys::new();
        let carried = CarriedCredentials::new();

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
            Some((
                &carried,
                Carried {
                    credential: Secret::new("what the user typed"),
                    keep_refused: true,
                },
            )),
        )
        .await;

        let IpcError::HostKeyDecision { pending: id, .. } = crossed else {
            panic!("a decision is what the far host's key produces");
        };

        let held = carried.take(id).await.expect("the retry finds it");
        assert!(held.keep_refused, "the refusal survives the decision");
    }

    #[tokio::test]
    async fn a_failure_that_is_not_a_decision_carries_nothing() {
        /* There is no retry coming, so holding it would be holding a secret
        the user asked us not to keep, for no purpose. */
        let pending = PendingHostKeys::new();
        let carried = CarriedCredentials::new();

        let crossed = refusal(
            &pending,
            Hop::Target,
            true,
            crate::ssh::connection::ConnectionError::Unreachable,
            None,
            Some((
                &carried,
                Carried {
                    credential: Secret::new("what the user typed"),
                    keep_refused: false,
                },
            )),
        )
        .await;

        assert!(matches!(crossed, IpcError::ChainFailed { .. }));
        assert_eq!(carried.count().await, 0);
    }

    #[tokio::test]
    async fn walking_away_from_a_decision_takes_the_secret_with_it() {
        /* Cancelling used to reach the core not at all. That was one host name
        left behind, which is untidy; it is now a credential, which is not. */
        let pending = PendingHostKeys::new();
        let carried = CarriedCredentials::new();

        let id = pending
            .remember(offered(Trust::Unknown {
                fingerprint: "SHA256:x".to_owned(),
                other_types: Vec::new(),
            }))
            .await;
        carried
            .hold(
                id,
                Carried {
                    credential: Secret::new("what the user typed"),
                    keep_refused: false,
                },
            )
            .await;

        pending.take(id).await;
        carried.forget(id).await;

        assert_eq!(carried.count().await, 0);
        assert_eq!(pending.count().await, 0);
    }

    #[test]
    fn a_store_that_refused_keeps_refusing() {
        /* A locked keyring. Prompting here would teach somebody to retype a
        password every time their session bus is not up yet, and the fix they
        actually need is to unlock it. */
        assert!(!worth_asking(&Error::KeychainReadFailed {
            reason: "the credential store refused access".to_owned(),
        }));

        /* And a secret that is there and unreadable is not a missing one. */
        assert!(!worth_asking(&Error::KeychainWriteFailed {
            reason: "the stored value is not readable".to_owned(),
        }));
        assert!(!worth_asking(&Error::UnknownHandle));
    }
}
