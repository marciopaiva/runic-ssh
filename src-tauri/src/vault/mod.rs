//! Credentials, in the store the operating system already unlocked.
//!
//! ADR-0004 decided this: DPAPI on Windows, Keychain on macOS, a secret
//! service on Linux, reached through the `keyring` crate. The frontend holds
//! an opaque id and never the value; the core resolves it here, at the moment
//! of use, and the material is wiped when it drops.
//!
//! The Linux path is the one ADR-0004 called out as able to fail for reasons
//! we do not control. A minimal install, a container, a headless session over
//! SSH — none of them necessarily runs a secret service, and the answer has to
//! be an explanation rather than a crash. [`Vault::availability`] is what makes
//! that answerable before a user is asked to type anything.

use keyring::Entry;

use crate::error::Error;

pub mod internal;
mod secret;

pub use internal::{InternalVault, InternalVaultState};
pub use secret::Secret;

/// The service name every entry is filed under.
pub const SERVICE: &str = "com.runicssh.client";

/// An opaque reference to a stored secret.
///
/// Opaque to the *frontend*, which is what ADR-0004 asks for: holding one
/// lets the interface say "use the saved credential" and never lets it read
/// the credential. The keychain, not the id, is what enforces access.
#[derive(Debug, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(transparent)]
pub struct CredentialId(String);

impl CredentialId {
    /// Derives the id for a session's saved secret.
    ///
    /// Derived rather than random so a session and its secret cannot drift
    /// apart: there is no second thing to keep in step, and no id to lose.
    pub fn for_session(session_id: &str) -> Self {
        Self(format!("session:{session_id}"))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Rebuilds an id from what [`Self::as_str`] returned earlier, without
    /// deriving it again.
    ///
    /// [`internal::InternalVault`] stores entries keyed by that string, and
    /// reading one back for migration is not "the id for a session," which
    /// `for_session` would prepend `session:` to a second time.
    pub(crate) fn from_stored(raw: String) -> Self {
        Self(raw)
    }
}

/// Whether the platform can store anything at all.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Availability {
    /// Secrets can be saved and read back.
    Available,
    /// There is no store to use. The application must degrade to prompting per
    /// connection, with an explanation — never a silent failure and never a
    /// file of its own invention.
    Unavailable { reason: String },
}

/// The OS credential store.
#[derive(Debug, Clone)]
pub struct Vault {
    service: String,
}

impl Default for Vault {
    fn default() -> Self {
        Self::new(SERVICE)
    }
}

impl Vault {
    pub fn new(service: impl Into<String>) -> Self {
        Self {
            service: service.into(),
        }
    }

    fn entry(&self, id: &CredentialId) -> Result<Entry, Error> {
        Entry::new(&self.service, id.as_str()).map_err(|source| Error::KeychainUnavailable {
            reason: describe(&source),
        })
    }

    /// Saves a secret, replacing whatever was there.
    pub fn store(&self, id: &CredentialId, secret: &Secret) -> Result<(), Error> {
        self.entry(id)?
            .set_password(secret.expose())
            .map_err(|source| Error::KeychainWriteFailed {
                reason: describe(&source),
            })
    }

    /// Reads a secret back, wrapped so it is wiped when the caller drops it.
    pub fn resolve(&self, id: &CredentialId) -> Result<Secret, Error> {
        match self.entry(id)?.get_password() {
            Ok(secret) => Ok(Secret::new(secret)),
            Err(keyring::Error::NoEntry) => Err(Error::NoSavedCredential),
            Err(source) => Err(Error::KeychainReadFailed {
                reason: describe(&source),
            }),
        }
    }

    /// Removes a secret. A secret that was not there is not an error: the
    /// caller wanted it gone, and it is.
    pub fn forget(&self, id: &CredentialId) -> Result<(), Error> {
        match self.entry(id)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(source) => Err(Error::KeychainWriteFailed {
                reason: describe(&source),
            }),
        }
    }

    /// Asks whether the platform has a store, without storing anything.
    ///
    /// Called before offering to remember a credential, so a user on a machine
    /// with no secret service is told up front rather than after typing a
    /// password into a checkbox that could never have worked.
    pub fn availability(&self) -> Availability {
        let probe = CredentialId(String::from("availability-probe"));

        match self.entry(&probe).and_then(|entry| {
            match entry.get_password() {
                /* Either answer means the store responded. */
                Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
                Err(source) => Err(Error::KeychainUnavailable {
                    reason: describe(&source),
                }),
            }
        }) {
            Ok(()) => Availability::Available,
            Err(Error::KeychainUnavailable { reason }) => Availability::Unavailable { reason },
            Err(other) => Availability::Unavailable {
                reason: other.to_string(),
            },
        }
    }
}

/// What a keychain entry holds.
///
/// A credential is either a password or a key with an optional passphrase, and
/// the store takes one string — so the shape is written down rather than
/// guessed at on the way back out. A password read as a private key would fail
/// authentication in a way that looks like the server rejecting the user.
///
/// `Debug` is derived and safe, which is ADR-0026 working: it derived `Debug`
/// once before and rendered `Password { secret: "hunter2" }`, because the field
/// was a bare `String`. The redaction now lives in the field's type, so the
/// next field added here is redacted whether or not anybody looks.
///
/// `Serialize` is deliberately absent, so this cannot become a field of
/// something an IPC command returns. What the keychain needs is provided by
/// [`Wire`], below.
#[derive(Debug, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum StoredCredential {
    Password {
        secret: Secret,
    },
    PrivateKey {
        pem: Secret,
        passphrase: Option<Secret>,
    },
}

/// The one place in the tree where secret material is named to serde.
///
/// Borrows through [`Secret::expose`] rather than owning, so encoding copies
/// the material once, inside `serde_json`, instead of twice. It is private, it
/// is four lines, and it sits against the type it serializes: ADR-0026 asks
/// that the exception be small enough to read in one go rather than absent,
/// because the keychain takes a string and something has to build it.
#[derive(serde::Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum Wire<'a> {
    Password {
        secret: &'a str,
    },
    PrivateKey {
        pem: &'a str,
        passphrase: Option<&'a str>,
    },
}

impl StoredCredential {
    fn wire(&self) -> Wire<'_> {
        match self {
            Self::Password { secret } => Wire::Password {
                secret: secret.expose(),
            },
            Self::PrivateKey { pem, passphrase } => Wire::PrivateKey {
                pem: pem.expose(),
                passphrase: passphrase.as_ref().map(Secret::expose),
            },
        }
    }

    /// Serialises for the keychain.
    ///
    /// `serde_json` builds an ordinary `String` first, which is not wiped. It
    /// is wrapped the moment it exists and dropped as soon as it is stored;
    /// that intermediate is the one place the material is unprotected, and
    /// avoiding it would mean writing a serialiser rather than using one.
    pub fn encode(&self) -> Result<Secret, Error> {
        serde_json::to_string(&self.wire())
            .map(Secret::new)
            .map_err(|_| Error::KeychainWriteFailed {
                reason: String::from("the credential could not be encoded"),
            })
    }

    pub fn decode(stored: &Secret) -> Result<Self, Error> {
        serde_json::from_str(stored.expose()).map_err(|_| Error::KeychainReadFailed {
            reason: String::from("the stored credential is not readable"),
        })
    }
}

/// Credentials kept for the life of this run, and never written anywhere.
///
/// ADR-0025. The middle answer between keeping a secret until somebody says
/// otherwise and asking for it on every connection: a machine with no secret
/// service can still stop asking for the afternoon somebody is working.
///
/// Holds the encoded form rather than the parsed one, for two reasons. It is a
/// [`Secret`], so it is wiped when it goes; and it is the same shape the
/// keychain holds, so resolving from either store returns the same type and the
/// caller cannot tell which answered.
///
/// Deliberately not `Debug`. A store that can print itself is one `dbg!` away
/// from every password in it. Since ADR-0026 that would print `<redacted>`
/// rather than the material, and the reason to keep refusing is the count and
/// the ids: which sessions somebody has unlocked this afternoon is not ours to
/// put in a log either.
#[derive(Default)]
pub struct SessionSecrets {
    held: std::sync::Mutex<std::collections::HashMap<CredentialId, Secret>>,
}

impl SessionSecrets {
    pub fn new() -> Self {
        Self::default()
    }

    /// Keeps a secret until the process ends.
    ///
    /// Nothing here reaches a disk, a log or the frontend. That is the whole
    /// of what makes this acceptable under a threat model that does not defend
    /// against a local attacker already running as the user: a secret this
    /// process holds is not reachable by anything that model claims to stop.
    pub fn keep(&self, id: &CredentialId, secret: &Secret) {
        if let Ok(mut held) = self.held.lock() {
            held.insert(id.clone(), secret.clone());
        }
    }

    pub fn resolve(&self, id: &CredentialId) -> Option<Secret> {
        self.held.lock().ok()?.get(id).cloned()
    }

    /// Whether a secret is held for this id, without touching it.
    ///
    /// ADR-0038: the editor needs to ask this store the same question
    /// `credential_id` already answers about the keychain, and it must not
    /// need the [`Secret`] to do it. A presence check against the same map
    /// [`resolve`](Self::resolve) reads, so there is nothing here for a
    /// future caller to log.
    pub fn is_held(&self, id: &CredentialId) -> bool {
        self.held.lock().is_ok_and(|held| held.contains_key(id))
    }

    /// Drops a secret before the process ends, wiping it.
    pub fn forget(&self, id: &CredentialId) {
        if let Ok(mut held) = self.held.lock() {
            held.remove(id);
        }
    }

    pub fn count(&self) -> usize {
        self.held.lock().map(|held| held.len()).unwrap_or_default()
    }
}

/// Whether this installation can remember a credential at all, through
/// either store.
///
/// Asked before offering to save one, the same reason [`Vault::availability`]
/// exists on its own: a checkbox offered on a machine that cannot honour it
/// is worse than one not offered. `Locked` still counts: the internal vault
/// exists and will accept a secret once unlocked, which is a question for the
/// moment it is stored, not for whether to offer the choice at all.
pub fn can_remember(vault: &Vault, internal: &InternalVault) -> bool {
    match internal.status() {
        Ok(InternalVaultState::NotConfigured) | Err(_) => {
            matches!(vault.availability(), Availability::Available)
        }
        Ok(InternalVaultState::Locked | InternalVaultState::Unlocked) => true,
    }
}

/// Which store a `store`/`resolve`/`forget` past `SessionSecrets` reaches.
///
/// ADR-0035: an installation uses one or the other, never both, and the
/// internal vault's own file existing is what says which. Computed once per
/// call rather than cached, because the file can change out from under a
/// running session (`enable_internal_vault`/`disable_internal_vault`/
/// `reset_internal_vault` all run mid-session, not only at launch).
fn backend<'a>(vault: &'a Vault, internal: &'a InternalVault) -> Result<&'a dyn Backend, Error> {
    Ok(match internal.status()? {
        InternalVaultState::NotConfigured => vault,
        InternalVaultState::Locked | InternalVaultState::Unlocked => internal,
    })
}

/// What [`resolve_credential`], [`forget_credential`] and [`store_credential`]
/// need from either backend, so the dispatch above is the one place that
/// branches.
trait Backend {
    fn store(&self, id: &CredentialId, secret: &Secret) -> Result<(), Error>;
    fn resolve(&self, id: &CredentialId) -> Result<Secret, Error>;
    fn forget(&self, id: &CredentialId) -> Result<(), Error>;
}

impl Backend for Vault {
    fn store(&self, id: &CredentialId, secret: &Secret) -> Result<(), Error> {
        Vault::store(self, id, secret)
    }

    fn resolve(&self, id: &CredentialId) -> Result<Secret, Error> {
        Vault::resolve(self, id)
    }

    fn forget(&self, id: &CredentialId) -> Result<(), Error> {
        Vault::forget(self, id)
    }
}

impl Backend for InternalVault {
    fn store(&self, id: &CredentialId, secret: &Secret) -> Result<(), Error> {
        InternalVault::store(self, id, secret)
    }

    fn resolve(&self, id: &CredentialId) -> Result<Secret, Error> {
        InternalVault::resolve(self, id)
    }

    fn forget(&self, id: &CredentialId) -> Result<(), Error> {
        InternalVault::forget(self, id)
    }
}

/// Saves a secret to whichever store is this installation's own.
///
/// The counterpart `resolve_credential` and `forget_credential` already had:
/// `persist_credential` in `commands/sessions.rs` called `vault.store`
/// directly because there was only one place to store to. ADR-0035 gave it a
/// second, so this is the dispatch that call site now goes through instead.
pub fn store_credential(
    vault: &Vault,
    internal: &InternalVault,
    id: &CredentialId,
    secret: &Secret,
) -> Result<(), Error> {
    backend(vault, internal)?.store(id, secret)
}

/// A secret for this session, from wherever it is.
///
/// The run comes first. Somebody who chose to keep a credential for this run
/// after the stored one stopped working expects the one they just typed, and
/// reaching for the keychain first would hand back the stale one they were
/// working around.
pub fn resolve_credential(
    secrets: &SessionSecrets,
    vault: &Vault,
    internal: &InternalVault,
    id: &CredentialId,
) -> Result<Secret, Error> {
    match secrets.resolve(id) {
        Some(secret) => Ok(secret),
        None => backend(vault, internal)?.resolve(id),
    }
}

/// [`resolve_credential`], off the async runtime's own thread for the part
/// that can block it.
///
/// `SessionSecrets::resolve` never leaves memory, so it still runs on the
/// caller's own thread; only the fallback, a real read from the OS secret
/// store, moves to `spawn_blocking`. On Linux that read is a synchronous
/// D-Bus round trip, and section 6 of `CLAUDE.md` already states the rule
/// this is: nothing here is the network or the filesystem in the literal
/// sense, but it is exactly the class of syscall-shaped wait that rule
/// exists to keep off the IPC thread. #251 was this: a connect attempt hung
/// on "Reaching <host>..." for 30s+, non-deterministically, on a fixture a
/// real `ssh` client reached instantly every time. The difference was this
/// call, blocking whichever worker thread `authenticate_with_saved` happened
/// to run on.
///
/// `Vault` and `InternalVault` are both cheap to clone (a label, and a
/// `PathBuf` plus an `Arc`), so the clone this needs to hand the closure its
/// own owned data costs nothing worth avoiding.
pub async fn resolve_credential_async(
    secrets: &SessionSecrets,
    vault: &Vault,
    internal: &InternalVault,
    id: &CredentialId,
) -> Result<Secret, Error> {
    if let Some(secret) = secrets.resolve(id) {
        return Ok(secret);
    }

    let vault = vault.clone();
    let internal = internal.clone();
    let id = id.clone();
    tokio::task::spawn_blocking(move || backend(&vault, &internal)?.resolve(&id))
        .await
        .map_err(|_| Error::KeychainUnavailable {
            reason: String::from("the keychain lookup did not finish"),
        })?
}

/// Forgets a secret wherever it is: the copy this run is holding, and
/// whichever of the two stores is this installation's own.
///
/// The pair to [`resolve_credential`], and it has to be a pair. That function
/// answers from the run first, so clearing only the store leaves the answer
/// unchanged: the user is told the password is gone, the next connection does
/// not ask, and the control has said one thing and done another.
///
/// The run's copy goes first and whatever happens next. A store that refuses
/// is reported, but it must not leave a secret behind that would still be
/// handed out by `resolve_credential`.
pub fn forget_credential(
    secrets: &SessionSecrets,
    vault: &Vault,
    internal: &InternalVault,
    id: &CredentialId,
) -> Result<(), Error> {
    secrets.forget(id);
    backend(vault, internal)?.forget(id)
}

/// Turns a keyring failure into something safe to show.
///
/// Deliberately a fixed phrase per kind rather than the underlying message.
/// Rule 2: the platform's text is not ours, we cannot audit it, and this is
/// the value most likely to end up in a bug report someone pastes publicly.
fn describe(error: &keyring::Error) -> String {
    match error {
        keyring::Error::NoEntry => "no entry",
        keyring::Error::NoStorageAccess(_) => "the credential store refused access",
        keyring::Error::PlatformFailure(_) => "the platform credential store is not available",
        keyring::Error::BadEncoding(_) => "the stored value is not readable",
        keyring::Error::TooLong(_, _) => "the value is too long for this store",
        keyring::Error::Invalid(_, _) => "the entry name is not valid for this store",
        keyring::Error::Ambiguous(_) => "the store holds more than one matching entry",
        /* What a machine with no secret service actually reports, and the case
        ADR-0004 said had to have a real answer rather than an opaque
        failure. Found by asking the crate rather than guessing: this
        repository's own environment produces it. */
        keyring::Error::NoDefaultStore => "this machine has no credential store configured",
        _ => "the credential store failed",
    }
    .to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A service name no other test or install would collide with.
    fn scratch() -> Vault {
        Vault::new(format!("com.runicssh.test.{}", std::process::id()))
    }

    /// A never-configured internal vault, so `resolve_credential` and
    /// `forget_credential`'s own tests exercise the OS keychain path exactly
    /// as they did before ADR-0035 gave that dispatch a second backend.
    fn scratch_internal() -> (InternalVault, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("tempdir");
        (InternalVault::new(dir.path()), dir)
    }

    #[test]
    fn the_wire_shape_is_pinned() {
        /* The frontend declares this shape by hand, and nothing else checks
        that the two agree — the IPC contract test covers the error enum and
        only that. Without a tag serde sends a bare string for one variant
        and a nested object for the other, which is what this type did until
        the shape was actually looked at. The matching assertion lives in
        tests/ipc-contract.test.ts. */
        assert_eq!(
            serde_json::to_string(&Availability::Available).expect("serializes"),
            r#"{"kind":"available"}"#
        );
        assert_eq!(
            serde_json::to_string(&Availability::Unavailable {
                reason: "no store".to_owned()
            })
            .expect("serializes"),
            r#"{"kind":"unavailable","reason":"no store"}"#
        );
    }

    #[test]
    fn the_run_answers_before_the_keychain() {
        /* Somebody who chose to keep a credential for this run after the
        stored one stopped working expects the one they just typed. Reaching
        for the keychain first would hand back the stale one they were
        working around. ADR-0025. */
        let secrets = SessionSecrets::new();
        let vault = scratch();
        let (internal, _dir) = scratch_internal();
        let id = CredentialId::for_session("web-01");

        secrets.keep(&id, &Secret::new("from-this-run"));

        let resolved = resolve_credential(&secrets, &vault, &internal, &id).expect("it resolves");
        assert_eq!(resolved.expose(), "from-this-run");
    }

    #[test]
    fn is_held_answers_without_resolving() {
        /* ADR-0038: the editor asks this, not `resolve`, so a machine with
        nothing kept never has to hand the caller a `Secret` just to find out
        there is none. */
        let secrets = SessionSecrets::new();
        let id = CredentialId::for_session("web-01");

        assert!(!secrets.is_held(&id), "nothing kept yet");

        secrets.keep(&id, &Secret::new("from-this-run"));
        assert!(secrets.is_held(&id), "kept for this run");

        secrets.forget(&id);
        assert!(!secrets.is_held(&id), "forgotten");
    }

    #[test]
    fn forgetting_takes_the_run_copy_too() {
        /* The whole of the decision. `resolve_credential` answers from the run
        first, so a forget that only reached the keychain would change nothing
        the next connection sees: the interface would say the password was gone
        and the host would still not be asked for one. */
        let secrets = SessionSecrets::new();
        let vault = scratch();
        let (internal, _dir) = scratch_internal();
        let id = CredentialId::for_session("web-01");

        secrets.keep(&id, &Secret::new("from-this-run"));
        assert!(secrets.resolve(&id).is_some(), "kept for this run");

        /* The keychain half is allowed to fail here. A machine with no secret
        service is exactly where the run copy is the only copy, and it is the
        one this test is about. */
        let _ = forget_credential(&secrets, &vault, &internal, &id);

        assert!(secrets.resolve(&id).is_none(), "the run copy is gone");
        assert!(resolve_credential(&secrets, &vault, &internal, &id).is_err());
    }

    #[test]
    fn nothing_kept_falls_through_to_the_keychain() {
        /* And when the run holds nothing, the answer has to be the keychain's
        rather than a refusal, or a credential somebody stored would stop
        being found the moment this store existed. */
        let secrets = SessionSecrets::new();
        let vault = scratch();
        let (internal, _dir) = scratch_internal();
        let id = CredentialId::for_session("never-kept");

        let resolved = resolve_credential(&secrets, &vault, &internal, &id);
        assert!(resolved.is_err(), "nothing is kept and nothing is stored");
    }

    /* #251: the async twin answers exactly what the sync one does, run first
    and the keychain as its fallback, the two behaviours `resolve_credential`
    already had and the only two `resolve_credential_async` is allowed to
    change nothing about. What moved is only which thread the fallback runs
    on, which neither test below can observe from here, only the join
    surviving proves `spawn_blocking` was reached and returned at all. */
    #[tokio::test]
    async fn the_async_run_answers_before_the_keychain_too() {
        let secrets = SessionSecrets::new();
        let vault = scratch();
        let (internal, _dir) = scratch_internal();
        let id = CredentialId::for_session("web-01-async");

        secrets.keep(&id, &Secret::new("from-this-run"));

        let resolved = resolve_credential_async(&secrets, &vault, &internal, &id)
            .await
            .expect("it resolves");
        assert_eq!(resolved.expose(), "from-this-run");
    }

    #[tokio::test]
    async fn the_async_fallback_reaches_the_keychain_too() {
        let secrets = SessionSecrets::new();
        let vault = scratch();
        let (internal, _dir) = scratch_internal();
        let id = CredentialId::for_session("never-kept-async");

        let resolved = resolve_credential_async(&secrets, &vault, &internal, &id).await;
        assert!(resolved.is_err(), "nothing is kept and nothing is stored");
    }

    #[test]
    fn what_the_run_keeps_is_never_written_anywhere() {
        /* The whole of what makes ADR-0025 acceptable. The store has no path
        to a disk: it takes a secret, hands it back, and drops it. If a
        write is ever added, this file is where the argument for it has to
        be made. */
        let source = include_str!("mod.rs");
        let store = source
            .split("pub struct SessionSecrets")
            .nth(1)
            .and_then(|rest| rest.split("/// Turns a keyring failure").next())
            .expect("the store is in this file");

        for reaching in ["fs::", "File::", "write", "keyring", "Entry::new"] {
            assert!(
                !store.contains(reaching),
                "the session store reached for {reaching}"
            );
        }
    }

    #[test]
    fn an_id_is_derived_from_the_session_and_nothing_else() {
        /* Derived rather than random so a session and its secret cannot drift
        apart: there is no second thing to keep in step. */
        let first = CredentialId::for_session("abc123");
        let second = CredentialId::for_session("abc123");

        assert_eq!(first, second);
        assert_ne!(first, CredentialId::for_session("abc124"));
    }

    #[test]
    fn an_id_carries_no_secret() {
        let id = CredentialId::for_session("abc123");
        let rendered = format!("{id:?} {}", id.as_str());

        for forbidden in ["password", "hunter2", "BEGIN"] {
            assert!(!rendered.contains(forbidden));
        }
    }

    #[test]
    fn every_failure_describes_itself_without_the_platform_speaking() {
        /* Rule 2. The platform's own text is not ours, we cannot audit it, and
        it is the value most likely to end up in a bug report someone pastes
        in public. Each kind maps to a phrase we wrote. */
        let phrases = [
            describe(&keyring::Error::NoEntry),
            describe(&keyring::Error::Ambiguous(Vec::new())),
        ];

        for phrase in phrases {
            assert!(!phrase.is_empty());
            assert!(phrase.is_ascii(), "a described failure must be plain text");
        }
    }

    #[test]
    fn availability_answers_rather_than_panicking() {
        /* The whole point of #35: on a machine with no secret service — a
        container, a minimal install, this repository's own WSL environment
        — asking must produce an answer the interface can act on. */
        match scratch().availability() {
            Availability::Available => {}
            Availability::Unavailable { reason } => {
                assert!(!reason.is_empty(), "an unavailable store must say why");
                assert_ne!(
                    reason, "the credential store failed",
                    "the generic phrase means a failure kind nobody described; \
                     find out which and give it words a user can act on"
                );
            }
        }
    }

    #[test]
    fn a_missing_secret_is_its_own_answer() {
        /* Distinguishable from a broken store: one means "ask the user", the
        other means "tell the user their machine cannot remember". */
        let vault = scratch();
        let id = CredentialId::for_session("never-stored");

        match vault.resolve(&id) {
            Err(Error::NoSavedCredential) => {}
            Err(Error::KeychainUnavailable { .. } | Error::KeychainReadFailed { .. }) => {
                /* No store on this machine. Also a valid answer, and the one
                this environment gives. */
            }
            other => panic!("expected a missing secret or an unavailable store, got {other:?}"),
        }
    }

    #[test]
    fn forgetting_something_that_was_never_there_succeeds() {
        /* The caller wanted it gone. It is gone. Erroring would make cleaning
        up after a deleted session harder than leaving the secret behind. */
        let vault = scratch();
        let id = CredentialId::for_session("never-stored");

        match vault.forget(&id) {
            Ok(()) => {}
            Err(Error::KeychainUnavailable { .. } | Error::KeychainWriteFailed { .. }) => {}
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    #[ignore = "needs a working secret service; run locally on a desktop session"]
    fn a_secret_survives_a_round_trip() {
        let vault = scratch();
        let id = CredentialId::for_session("round-trip");
        let secret = Secret::new("correct horse battery staple");

        vault.store(&id, &secret).expect("store");
        assert_eq!(
            vault.resolve(&id).expect("resolve").expose(),
            secret.expose()
        );

        vault.forget(&id).expect("forget");
        assert!(matches!(vault.resolve(&id), Err(Error::NoSavedCredential)));
    }
}
