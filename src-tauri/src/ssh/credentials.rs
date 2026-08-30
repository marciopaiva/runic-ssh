//! Credential requests awaiting an answer.
//!
//! ADR-0008 decided the prompt lived in its own window and left the protocol
//! as a follow-up: *the core issues an opaque request id, the answer arrives
//! tagged with that id, and an unmatched or repeated id is refused.* ADR-0039
//! retired the window; the protocol is unchanged and now answers the wizard's
//! own bastion prompt (ADR-0033) instead.
//!
//! The shape is [`crate::ssh::pending`]'s, for the same reason — the webview
//! names a thing it cannot forge — with one difference that matters. What is
//! kept here is the *sender*, not the answer. A submitted secret goes straight
//! down the channel to the task that is waiting for it and is never stored in
//! this map, so its life on the Rust side is one hop rather than however long
//! the map happens to hold it.
//!
//! Every request ends: submitting ends it, dismissing ends it. A request that
//! could be left open would leave a connection waiting on a reply that never
//! comes, the worst failure this design can have, because it looks like the
//! application has hung rather than like an error.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};

use tokio::sync::{oneshot, Mutex};

use crate::vault::StoredCredential;

/// An opaque reference to a credential request.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(transparent)]
pub struct RequestId(u64);

impl std::fmt::Display for RequestId {
    /// Writes `request-N`, so an id in a log names nothing about the session.
    ///
    /// Which is right in a log and wrong everywhere a bare number is wanted.
    /// Use [`RequestId::raw`] there — putting this in the prompt window's URL
    /// sent `?request=request-0`, the window parsed it as `NaN`, and every
    /// credential prompt opened straight onto "this prompt is no longer
    /// valid".
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "request-{}", self.0)
    }
}

impl RequestId {
    /// The bare number, for the event the wizard's inline bastion form
    /// listens on (ADR-0033).
    #[must_use]
    pub fn raw(self) -> u64 {
        self.0
    }

    /// Builds an id without a registry. Tests only.
    #[cfg(test)]
    #[must_use]
    pub fn default_for_test(value: u64) -> Self {
        Self(value)
    }
}

/// What the bastion's inline form is allowed to render.
///
/// Facts about the session and nothing else. No secret, obviously — but also
/// nothing that came from the remote host.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialPrompt {
    pub session_name: String,
    pub user: String,
    pub host: String,
    pub port: u16,
    /// Whether this machine has somewhere to keep it *beyond this run*.
    ///
    /// Keeping it for the run needs nothing and is always offered, so the
    /// form has one control that is always there and one that appears only
    /// when the machine can honour it. ADR-0025.
    pub can_remember: bool,
    /// The session this hop is being crossed for, when this is a jump host.
    ///
    /// `None` is an ordinary prompt for the host the user clicked. `Some` says
    /// the form is asking about a machine the user did not name, on the way
    /// to one they did, and it carries the name so the form can say which.
    ///
    /// This is not decoration. ADR-0023 refused to let a bastion prompt at all
    /// until it could say which hop was asking, because two identical prompts
    /// in sequence for two different hosts is worse than one refusal with an
    /// explanation. ADR-0027 is that permission, and this field is the
    /// condition it was granted on.
    pub carrying: Option<String>,
    /// A credential kind chosen before this prompt was asked for, if any.
    ///
    /// ADR-0030. Not a secret: which kind a host takes is a fact about the
    /// host, not about what somebody types. Always `None` since ADR-0039:
    /// the only remaining caller, the bastion's own prompt, has never had an
    /// opinion about the bastion's credential kind ahead of time, only the
    /// target's own Access step ever did, and that path stopped reaching
    /// this struct once its window went. Kept rather than removed on its
    /// own in this change; a caller that reads it and a caller that could
    /// still fill it are both gone, and that is worth its own look.
    pub suggested_method: Option<SuggestedMethod>,
}

/// Which kind of credential a host is expected to take.
///
/// Two variants because the wire only ever needs to say one of two things, the
/// same shape [`Keep`] takes below.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SuggestedMethod {
    Password,
    PrivateKey,
}

/// How long the user asked for a credential to be kept.
///
/// Three answers rather than a boolean, because ADR-0025 added the one in the
/// middle and it is not a weaker version of either: "until I say otherwise"
/// and "ask me every time" leave out the afternoon somebody is working, which
/// is what most people want and what a machine with no keychain can give.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Keep {
    /// Used once and dropped. What a fresh prompt does.
    #[default]
    Never,
    /// Held in this process until it closes, and written nowhere.
    ForThisRun,
    /// Written to the OS keychain. Needs one to exist.
    Stored,
}

/// How a request ended.
///
/// The secret travels in the shape the keychain holds rather than as a
/// [`Credential`](crate::ssh::connection::Credential), for one reason: a user
/// who asked to be remembered needs it written *and* used, and converting once
/// here means the secret is not copied a second time to satisfy the second
/// use.
///
/// `Debug` is derived since ADR-0026 and prints no credential, because
/// [`StoredCredential`] holds [`Secret`](crate::vault::Secret) fields and those
/// render as `<redacted>`. It was written by hand before that. Deleting it is
/// the check on whether the type worked: rule 2 now holds here without anybody
/// having decided that it should.
#[derive(Debug)]
pub enum Answer {
    Submitted {
        credential: StoredCredential,
        keep: Keep,
    },
    /// The user cancelled.
    Dismissed,
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

    /// What the form should render, if this request is still open.
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
    use crate::vault::Secret;

    fn prompt() -> CredentialPrompt {
        CredentialPrompt {
            session_name: "web-01".to_owned(),
            user: "deploy".to_owned(),
            host: "10.0.4.31".to_owned(),
            port: 22,
            can_remember: true,
            carrying: None,
            suggested_method: None,
        }
    }

    fn password() -> StoredCredential {
        StoredCredential::Password {
            secret: Secret::new("hunter2"),
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
                        keep: Keep::Never
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
                        keep: Keep::Never
                    }
                )
                .await
        );
        assert_eq!(requests.count().await, 0);
    }

    #[test]
    fn the_bare_form_is_a_number_and_the_shown_form_is_not() {
        /* These are two different things and were used interchangeably once.
        The shown form is for logs; the bare one is for anywhere a machine
        reads it back. */
        assert_eq!(RequestId(7).raw(), 7);
        assert_eq!(format!("{}", RequestId(7)), "request-7");
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
    fn how_long_to_keep_it_crosses_as_three_words() {
        /* Pinned as a literal on both sides. Renaming a variant compiles in
        both languages and leaves a window whose middle choice quietly does
        nothing, which is the worst of the three to lose: somebody would
        believe a secret was kept and find out by being asked again. */
        assert_eq!(
            serde_json::to_string(&Keep::Never).expect("serializes"),
            r#""never""#
        );
        assert_eq!(
            serde_json::to_string(&Keep::ForThisRun).expect("serializes"),
            r#""forThisRun""#
        );
        assert_eq!(
            serde_json::to_string(&Keep::Stored).expect("serializes"),
            r#""stored""#
        );
    }

    #[test]
    fn an_answer_never_prints_the_secret() {
        let rendered = format!(
            "{:?}",
            Answer::Submitted {
                credential: password(),
                keep: Keep::Stored,
            }
        );

        assert!(
            !rendered.contains("hunter2"),
            "the secret reached a formatter"
        );
        /* What was asked for is not a secret, and a Debug that redacts it too
        would leave nothing to read at all. */
        assert!(rendered.contains("keep: Stored"));
    }

    #[test]
    fn the_prompt_carries_no_secret() {
        /* Everything on this struct is rendered in a window. If a field is
        ever added that a host chose, the argument for a separate window is
        gone with it. */
        let json = serde_json::to_string(&prompt()).expect("serializes");

        assert_eq!(
            json,
            r#"{"sessionName":"web-01","user":"deploy","host":"10.0.4.31","port":22,"canRemember":true,"carrying":null,"suggestedMethod":null}"#
        );
    }

    #[test]
    fn a_bastion_prompt_names_the_session_it_is_on_the_way_to() {
        /* A saved session's name, which the user typed, and never anything the
        far host offered. ADR-0027 requires this field to exist; ADR-0008
        requires it to be ours. */
        let json = serde_json::to_string(&CredentialPrompt {
            carrying: Some("web-01".to_owned()),
            ..prompt()
        })
        .expect("serializes");

        assert!(json.contains(r#""carrying":"web-01""#));
    }

    #[test]
    fn a_suggested_method_crosses_as_two_words() {
        /* Pinned as a literal on both sides, the way `Keep` is. ADR-0030: the
        window seeds its own method choice from this, and a renamed variant
        that still compiles would leave it silently seeding nothing. */
        assert_eq!(
            serde_json::to_string(&SuggestedMethod::Password).expect("serializes"),
            r#""password""#
        );
        assert_eq!(
            serde_json::to_string(&SuggestedMethod::PrivateKey).expect("serializes"),
            r#""privateKey""#
        );

        let json = serde_json::to_string(&CredentialPrompt {
            suggested_method: Some(SuggestedMethod::PrivateKey),
            ..prompt()
        })
        .expect("serializes");

        assert!(json.contains(r#""suggestedMethod":"privateKey""#));
    }
}
