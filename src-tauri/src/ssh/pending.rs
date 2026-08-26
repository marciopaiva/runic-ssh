//! Host keys a server offered and we refused.
//!
//! A refusal has to survive the round trip to the interface and back. The user
//! sees a fingerprint, decides, and answers — and by then the connection that
//! produced the verdict is long gone.
//!
//! What crosses to the webview is an opaque id, never the decision itself.
//! That is the same shape as a session handle and a credential reference, for
//! the same reason: the frontend can name a thing it cannot forge. Asking the
//! server again instead would let a *different* key be written than the one
//! the user was shown, which is the exact substitution rule 3 exists to catch.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};

use tokio::sync::Mutex;

use crate::ssh::connection::OfferedKey;
use crate::vault::Secret;

/// An opaque reference to a host key awaiting a decision.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(transparent)]
pub struct PendingId(u64);

impl std::fmt::Display for PendingId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "pending-{}", self.0)
    }
}

/// Every refusal still waiting on an answer.
///
/// Deliberately not `Debug`: it holds host names, and a registry that can print
/// itself is one `dbg!` away from putting someone's infrastructure in a log.
#[derive(Default)]
pub struct PendingHostKeys {
    next: AtomicU64,
    waiting: Mutex<HashMap<PendingId, OfferedKey>>,
}

impl PendingHostKeys {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn remember(&self, offered: OfferedKey) -> PendingId {
        let id = PendingId(self.next.fetch_add(1, Ordering::Relaxed));
        self.waiting.lock().await.insert(id, offered);
        id
    }

    /// Reads a decision without answering it.
    ///
    /// The prompt needs more than the error carried: the key type and the port
    /// as well as the fingerprint. Sending those through the error would put
    /// four fields on a variant to serve one screen; reading them back by id is
    /// the same shape the credential prompt uses.
    pub async fn describe(&self, id: PendingId) -> Option<OfferedKey> {
        self.waiting.lock().await.get(&id).cloned()
    }

    /// Takes a decision out. Answering twice reaches nothing the second time,
    /// which is what stops a stale window writing a key over a newer one.
    pub async fn take(&self, id: PendingId) -> Option<OfferedKey> {
        self.waiting.lock().await.remove(&id)
    }

    pub async fn count(&self) -> usize {
        self.waiting.lock().await.len()
    }
}

/// A bastion's credential, held for the retry a host key decision will cause.
///
/// Accepting the far host's key rebuilds the whole chain, because the transport
/// has no "accept for this session" path and ADR-0023 chose not to invent one.
/// That was invisible while the bastion authenticated from the keychain in
/// silence. Once it can ask, the rebuild asks a second time, in the position
/// where the user is expecting the *other* host's prompt, and the password that
/// gets typed there goes to the wrong machine. Measured on 2026-08-26, by
/// somebody doing exactly that on their first attempt.
///
/// So the answer is held against the decision that is about to interrupt it,
/// and the retry says which decision it is continuing. Three things follow from
/// keying it this way rather than parking it in [`SessionSecrets`]:
///
/// * it is consumed once, by the one retry it belongs to;
/// * `Keep::Never` keeps meaning what it says, because this is not the store
///   that survives a connection;
/// * a decision nobody answers can be dropped, and dropping it takes the
///   secret with it.
///
/// [`SessionSecrets`]: crate::vault::SessionSecrets
///
/// Held in the shape the vault holds one, which is the shape every other
/// resolver already speaks, so the retry decodes it through exactly the path a
/// saved credential takes.
///
/// Deliberately not `Debug`. `Secret` renders as `<redacted>` since ADR-0026,
/// so this would print nothing secret; it would still print how many
/// connections are mid-flight and against which decisions, which is nobody's
/// business either.
#[derive(Default)]
pub struct CarriedCredentials {
    held: Mutex<HashMap<PendingId, Carried>>,
}

/// A credential waiting on a decision, and what the user asked to happen to it.
///
/// The flag travels with the secret because it has nowhere else to wait. A
/// keychain that refuses at the bastion is a fact about an attempt, and an
/// attempt that ends in a host key decision produces no session for it to be
/// reported on. Without this it is lost on exactly the connection where it is
/// most likely to happen: the first one to a host behind a bastion, where the
/// far host's key is unknown and the bastion's password has just been typed.
/// See #191.
pub struct Carried {
    pub credential: Secret,
    /// The user asked to keep it and the store said no.
    pub keep_refused: bool,
}

impl CarriedCredentials {
    pub fn new() -> Self {
        Self::default()
    }

    /// Holds a credential for one decision, replacing anything under that id.
    pub async fn hold(&self, id: PendingId, carried: Carried) {
        self.held.lock().await.insert(id, carried);
    }

    /// Takes it out. Take-once, so a retry that arrives twice prompts the
    /// second time rather than reusing a secret nobody has re-authorised.
    pub async fn take(&self, id: PendingId) -> Option<Carried> {
        self.held.lock().await.remove(&id)
    }

    /// Drops one without using it, for a decision the user walked away from.
    pub async fn forget(&self, id: PendingId) {
        self.held.lock().await.remove(&id);
    }

    #[cfg(test)]
    pub async fn count(&self) -> usize {
        self.held.lock().await.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ssh::trust::Trust;

    fn offered() -> OfferedKey {
        OfferedKey {
            host: "web-01".to_owned(),
            port: 22,
            key_type: "ssh-ed25519".to_owned(),
            key: vec![1, 2, 3],
            verdict: Trust::Unknown {
                fingerprint: "SHA256:x".to_owned(),
                other_types: Vec::new(),
            },
            hop: crate::ssh::connection::Hop::Target,
        }
    }

    #[tokio::test]
    async fn a_decision_can_be_answered_once() {
        let pending = PendingHostKeys::new();
        let id = pending.remember(offered()).await;

        assert!(pending.take(id).await.is_some());
        /* A window left open from an earlier attempt must not be able to write
        a key over a newer decision. */
        assert!(pending.take(id).await.is_none());
        assert_eq!(pending.count().await, 0);
    }

    #[tokio::test]
    async fn an_invented_id_reaches_nothing() {
        let pending = PendingHostKeys::new();
        assert!(pending.take(PendingId(999)).await.is_none());
        assert!(pending.describe(PendingId(999)).await.is_none());
    }

    #[tokio::test]
    async fn reading_a_decision_does_not_answer_it() {
        /* The prompt reads it to render, and the user answers afterwards. A
        read that consumed the decision would leave the answer with nothing
        to write. */
        let pending = PendingHostKeys::new();
        let id = pending.remember(offered()).await;

        assert!(pending.describe(id).await.is_some());
        assert!(pending.describe(id).await.is_some());
        assert!(pending.take(id).await.is_some());
        assert!(pending.describe(id).await.is_none());
    }

    #[test]
    fn an_id_names_nothing_about_the_host() {
        let rendered = format!("{}", PendingId(7));
        assert!(rendered.contains('7'));
        for forbidden in ["web-01", "10.0.", "SHA256"] {
            assert!(!rendered.contains(forbidden));
        }
    }
}
