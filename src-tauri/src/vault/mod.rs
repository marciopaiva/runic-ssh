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
pub const SERVICE: &str = "com.runicssh.app";

/// An opaque reference to a stored secret.
///
/// Opaque to the *frontend*, which is what ADR-0004 asks for: holding one
/// lets the interface say "use the saved credential" and never lets it read
/// the credential. The keychain, not the id, is what enforces access.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
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
#[derive(Debug, serde::Serialize, serde::Deserialize)]
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
