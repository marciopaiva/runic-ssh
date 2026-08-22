//! Credential requests awaiting an answer from the prompt window.
//!
//! ADR-0008 decided the prompt lives in its own window, and left the protocol
//! as a follow-up: *the core issues an opaque request id, the window replies
//! with that id and the secret, and an unmatched or repeated id is refused.*
//! This is that protocol.
//!
//! The shape is [`crate::ssh::pending`]'s, for the same reason — the webview
//! names a thing it cannot forge — with one difference that matters. What is
//! kept here is the *sender*, not the answer. A submitted secret goes straight
//! down the channel to the task that is waiting for it and is never stored in
//! this map, so its life on the Rust side is one hop rather than however long
//! the map happens to hold it.
//!
//! Every request ends. Submitting ends it, dismissing ends it, and closing the
//! window ends it — the last one is why the window's own close event answers
//! [`Answer::Dismissed`]. A request that could be left open would leave a
//! connection waiting on a reply that never comes, which ADR-0008 names as the
//! worst failure this design can have, because it looks like the application
//! has hung rather than like an error.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};

use tokio::sync::{oneshot, Mutex};

use crate::vault::StoredCredential;

/// An opaque reference to a credential request.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(transparent)]
pub struct RequestId(u64);

impl std::fmt::Display for RequestId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "request-{}", self.0)
    }
}

/// What the prompt window is allowed to render.
///
/// Facts about the session and nothing else. No secret, obviously — but also
/// nothing that came from the remote host, because the whole argument for a
/// separate window is that it never renders a byte a host chose.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialPrompt {
    pub session_name: String,
    pub user: String,
    pub host: String,
    pub port: u16,
    /// Whether this machine has somewhere to keep it, so the window knows
    /// whether to offer.
    pub can_remember: bool,
}

/// How a request ended.
///
/// The secret travels in the shape the keychain holds rather than as a
/// [`Credential`](crate::ssh::connection::Credential), for one reason: a user
/// who asked to be remembered needs it written *and* used, and converting once
/// here means the secret is not copied a second time to satisfy the second
/// use.
pub enum Answer {
    Submitted {
        credential: StoredCredential,
        remember: bool,
    },
    /// The user cancelled, or closed the window.
    Dismissed,
}

impl std::fmt::Debug for Answer {
    /// Never prints the credential. Rule 2: a `Debug` that leaks is the usual
    /// way a secret reaches a log nobody meant to write.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Submitted { remember, .. } => f.write_fmt(format_args!(
                "Answer::Submitted {{ <redacted>, remember: {remember} }}"
            )),
            Self::Dismissed => f.write_str("Answer::Dismissed"),
        }
    }
}

struct Waiting {
    prompt: CredentialPrompt,
    reply: oneshot::Sender<Answer>,
}

/// Every credential request still waiting on an answer.
///
/// Deliberately not `Debug`: it holds host and user names, and a registry that
/// can print itself is one `dbg!` away from putting someone's infrastructure
/// in a log.
#[derive(Default)]
pub struct CredentialRequests {
    next: AtomicU64,
    waiting: Mutex<HashMap<RequestId, Waiting>>,
}

impl CredentialRequests {
    pub fn new() -> Self {
        Self::default()
    }

    /// Opens a request, returning its id and the channel its answer arrives on.
    pub async fn open(&self, prompt: CredentialPrompt) -> (RequestId, oneshot::Receiver<Answer>) {
        let id = RequestId(self.next.fetch_add(1, Ordering::Relaxed));
        let (reply, receive) = oneshot::channel();

        self.waiting
            .lock()
            .await
            .insert(id, Waiting { prompt, reply });

        (id, receive)
    }

    /// What the window should render, if this request is still open.
    pub async fn describe(&self, id: RequestId) -> Option<CredentialPrompt> {
        Some(self.waiting.lock().await.get(&id)?.prompt.clone())
    }

    /// Answers a request. Take-once: a second answer reaches nothing.
    ///
    /// Which is what stops a window left open from an earlier attempt from
    /// authenticating a session it was never asked about.
    pub async fn answer(&self, id: RequestId, answer: Answer) -> bool {
        let Some(waiting) = self.waiting.lock().await.remove(&id) else {
            return false;
        };

        /* The receiver is gone when the connection was abandoned while the
        prompt was up. The secret is dropped here, and zeroized with it. */
        waiting.reply.send(answer).is_ok()
    }

    pub async fn count(&self) -> usize {
        self.waiting.lock().await.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn prompt() -> CredentialPrompt {
        CredentialPrompt {
            session_name: "web-01".to_owned(),
            user: "deploy".to_owned(),
            host: "10.0.4.31".to_owned(),
            port: 22,
            can_remember: true,
        }
    }

    fn password() -> StoredCredential {
        StoredCredential::Password {
            secret: "hunter2".to_owned(),
        }
    }

    #[tokio::test]
    async fn an_answer_reaches_the_waiting_connection() {
        let requests = CredentialRequests::new();
        let (id, receive) = requests.open(prompt()).await;

        assert!(
            requests
                .answer(
                    id,
                    Answer::Submitted {
                        credential: password(),
                        remember: false
                    }
                )
                .await
        );
        assert!(matches!(
            receive.await.expect("answered"),
            Answer::Submitted { .. }
        ));
    }

    #[tokio::test]
    async fn a_request_can_be_answered_once() {
        /* A window left open from an earlier attempt must not be able to
        authenticate a session nobody asked it about. */
        let requests = CredentialRequests::new();
        let (id, _receive) = requests.open(prompt()).await;

        assert!(requests.answer(id, Answer::Dismissed).await);
        assert!(!requests.answer(id, Answer::Dismissed).await);
        assert_eq!(requests.count().await, 0);
    }

    #[tokio::test]
    async fn an_invented_id_reaches_nothing() {
        let requests = CredentialRequests::new();
        assert!(!requests.answer(RequestId(999), Answer::Dismissed).await);
        assert!(requests.describe(RequestId(999)).await.is_none());
    }

    #[tokio::test]
    async fn an_answered_request_describes_nothing_further() {
        let requests = CredentialRequests::new();
        let (id, _receive) = requests.open(prompt()).await;

        assert!(requests.describe(id).await.is_some());
        requests.answer(id, Answer::Dismissed).await;
        assert!(requests.describe(id).await.is_none());
    }

    #[tokio::test]
    async fn answering_an_abandoned_request_is_not_an_error() {
        /* The connection gave up while the prompt was up. The secret is
        dropped here rather than left in the map. */
        let requests = CredentialRequests::new();
        let (id, receive) = requests.open(prompt()).await;
        drop(receive);

        assert!(
            !requests
                .answer(
                    id,
                    Answer::Submitted {
                        credential: password(),
                        remember: false
                    }
                )
                .await
        );
        assert_eq!(requests.count().await, 0);
    }

    #[test]
    fn an_id_names_nothing_about_the_session() {
        let rendered = format!("{} {:?}", RequestId(7), RequestId(7));

        assert!(rendered.contains('7'));
        for forbidden in ["web-01", "deploy", "10.0."] {
            assert!(!rendered.contains(forbidden));
        }
    }

    #[test]
    fn an_answer_never_prints_the_secret() {
        let rendered = format!(
            "{:?}",
            Answer::Submitted {
                credential: password(),
                remember: true,
            }
        );

        assert!(
            !rendered.contains("hunter2"),
            "the secret reached a formatter"
        );
        assert!(rendered.contains("remember: true"));
    }

    #[test]
    fn the_prompt_carries_no_secret() {
        /* Everything on this struct is rendered in a window. If a field is
        ever added that a host chose, the argument for a separate window is
        gone with it. */
        let json = serde_json::to_string(&prompt()).expect("serializes");

        assert_eq!(
            json,
            r#"{"sessionName":"web-01","user":"deploy","host":"10.0.4.31","port":22,"canRemember":true}"#
        );
    }
}
