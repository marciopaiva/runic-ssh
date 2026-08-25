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
