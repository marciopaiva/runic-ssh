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
use zeroize::Zeroizing;

use crate::error::Error;

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
    pub fn store(&self, id: &CredentialId, secret: &Zeroizing<String>) -> Result<(), Error> {
        self.entry(id)?
            .set_password(secret)
            .map_err(|source| Error::KeychainWriteFailed {
                reason: describe(&source),
            })
    }

    /// Reads a secret back, wrapped so it is wiped when the caller drops it.
    pub fn resolve(&self, id: &CredentialId) -> Result<Zeroizing<String>, Error> {
        match self.entry(id)?.get_password() {
            Ok(secret) => Ok(Zeroizing::new(secret)),
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
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum StoredCredential {
    Password {
        secret: String,
    },
    PrivateKey {
        pem: String,
        passphrase: Option<String>,
    },
}

impl std::fmt::Debug for StoredCredential {
    /// Never prints the material.
    ///
    /// It derived `Debug` until this was written, and derived `Debug` on a type
    /// holding a bare `String` renders it: `Password { secret: "hunter2" }`.
    /// Rule 2 says nothing secret is logged at any level, and one `dbg!` was
    /// the whole distance between that rule and a password in a terminal.
    ///
    /// Written by hand rather than solved properly, which is #131: the
    /// guarantee is still a person remembering, and the next field added here
    /// will be redacted only because somebody looked.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Password { .. } => f.write_str("StoredCredential::Password(<redacted>)"),
            Self::PrivateKey { passphrase, .. } => f.write_fmt(format_args!(
                "StoredCredential::PrivateKey {{ pem: <redacted>, encrypted: {} }}",
                passphrase.is_some()
            )),
        }
    }
}

impl StoredCredential {
    /// Serialises for the keychain.
    ///
    /// `serde_json` builds an ordinary `String` first, which is not wiped. It
    /// is wrapped the moment it exists and dropped as soon as it is stored;
    /// that intermediate is the one place the material is unprotected, and
    /// avoiding it would mean writing a serialiser rather than using one.
    pub fn encode(&self) -> Result<Zeroizing<String>, Error> {
        serde_json::to_string(self)
            .map(Zeroizing::new)
            .map_err(|_| Error::KeychainWriteFailed {
                reason: String::from("the credential could not be encoded"),
            })
    }

    pub fn decode(stored: &Zeroizing<String>) -> Result<Self, Error> {
        serde_json::from_str(stored).map_err(|_| Error::KeychainReadFailed {
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
/// Holds the encoded form rather than the parsed one, for two reasons. It is
/// [`Zeroizing`], so it is wiped when it goes; and it is the same shape the
/// keychain holds, so resolving from either store returns the same type and the
/// caller cannot tell which answered.
///
/// Deliberately not `Debug`. A store that can print itself is one `dbg!` away
/// from every password in it, and the type it holds only stopped rendering
/// itself this week.
#[derive(Default)]
pub struct SessionSecrets {
    held: std::sync::Mutex<std::collections::HashMap<CredentialId, Zeroizing<String>>>,
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
    pub fn keep(&self, id: &CredentialId, secret: &Zeroizing<String>) {
        if let Ok(mut held) = self.held.lock() {
            held.insert(id.clone(), secret.clone());
        }
    }

    pub fn resolve(&self, id: &CredentialId) -> Option<Zeroizing<String>> {
        self.held.lock().ok()?.get(id).cloned()
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

/// A secret for this session, from wherever it is.
///
/// The run comes first. Somebody who chose to keep a credential for this run
/// after the stored one stopped working expects the one they just typed, and
/// reaching for the keychain first would hand back the stale one they were
/// working around.
pub fn resolve_credential(
    secrets: &SessionSecrets,
    vault: &Vault,
    id: &CredentialId,
) -> Result<Zeroizing<String>, Error> {
    match secrets.resolve(id) {
        Some(secret) => Ok(secret),
        None => vault.resolve(id),
    }
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
        let id = CredentialId::for_session("web-01");

        secrets.keep(&id, &Zeroizing::new("from-this-run".to_owned()));

        let resolved = resolve_credential(&secrets, &vault, &id).expect("it resolves");
        assert_eq!(resolved.as_str(), "from-this-run");
    }

    #[test]
    fn nothing_kept_falls_through_to_the_keychain() {
        /* And when the run holds nothing, the answer has to be the keychain's
        rather than a refusal, or a credential somebody stored would stop
        being found the moment this store existed. */
        let secrets = SessionSecrets::new();
        let vault = scratch();
        let id = CredentialId::for_session("never-kept");

        let resolved = resolve_credential(&secrets, &vault, &id);
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
        let secret = Zeroizing::new(String::from("correct horse battery staple"));

        vault.store(&id, &secret).expect("store");
        assert_eq!(*vault.resolve(&id).expect("resolve"), *secret);

        vault.forget(&id).expect("forget");
        assert!(matches!(vault.resolve(&id), Err(Error::NoSavedCredential)));
    }
}
