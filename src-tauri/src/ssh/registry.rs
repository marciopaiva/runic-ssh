//! Live connections, addressed by an opaque handle.
//!
//! The webview never holds a connection, a socket or a credential — only a
//! handle, which is a number with no meaning outside this process. That is the
//! same shape ADR-0004 uses for credentials, for the same reason: what the
//! frontend cannot name, it cannot leak.
//!
//! Handles are sequential rather than random. They are not a capability: the
//! webview is our own code and already holds every handle it created, and an
//! unguessable one would protect against an attacker who, by the time they can
//! call IPC, has already won. Sequential is also what makes a log readable.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use tokio::sync::Mutex;

use crate::ssh::connection::{close_shared, Connection, Shared};
use crate::ssh::stats::Counters;

/// An opaque reference to a live connection. Carries no secret and no address.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, serde::Serialize, serde::Deserialize,
)]
#[serde(transparent)]
pub struct SessionHandle(u64);

impl std::fmt::Display for SessionHandle {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "session-{}", self.0)
    }
}

/// A live connection and the identity it was opened under.
///
/// The user name lives here rather than being looked up again at
/// authentication time: a handle has to know whose session it is, and
/// re-reading the session file would authenticate as whoever the file happens
/// to list now.
pub struct Open {
    pub connection: Connection,
    pub session_id: String,
    pub user: String,
    /// Set once a shell is running: where keystrokes go.
    pub input: Option<tokio::sync::mpsc::Sender<crate::ssh::terminal::Input>>,
}

/// A session handed to an operation that needs the connection to itself.
///
/// Deliberately not the whole [`Open`]. An operation has no business changing
/// where keystrokes go, and handing it the field only to write it back is how
/// an `attach_input` that happened meanwhile gets quietly undone.
pub struct Busy {
    pub connection: Connection,
    /// Whose session this is.
    pub user: String,
}

/// One session, as the registry holds it.
///
/// The connection is behind its own lock rather than being removed from the
/// map. Taking it out was simpler and wrong: while it was out, the handle
/// resolved to nothing, so a keystroke sent during authentication or a latency
/// probe was answered with "unknown session" and dropped. Everything that does
/// not need the connection — the name, the input channel — is readable
/// throughout.
struct Entry {
    /// `None` once the session has been taken to be closed.
    ///
    /// A share rather than sole ownership since ADR-0024: a bastion is ridden
    /// by every session behind it, and the last one to leave closes it.
    connection: Shared,
    session_id: String,
    user: String,
    input: Option<tokio::sync::mpsc::Sender<crate::ssh::terminal::Input>>,
    /// How much has moved, shared with the pump. Created here rather than when
    /// a shell opens, so the status bar has something to read from the moment
    /// a handle exists rather than a hole that fills in later.
    counters: Arc<Counters>,
}

/// Every connection currently open.
///
/// Deliberately not `Debug`: a registry that can print itself is one `dbg!`
/// away from rendering whatever a connection holds.
#[derive(Default)]
pub struct Registry {
    next: AtomicU64,
    open: Mutex<HashMap<SessionHandle, Entry>>,
}

impl Registry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Takes ownership of a connection and returns its handle.
    pub async fn insert(&self, open: Open) -> SessionHandle {
        let handle = SessionHandle(self.next.fetch_add(1, Ordering::Relaxed));
        self.open.lock().await.insert(
            handle,
            Entry {
                connection: crate::ssh::connection::share(open.connection),
                session_id: open.session_id,
                user: open.user,
                input: open.input,
                counters: Arc::new(Counters::default()),
            },
        );
        handle
    }

    /// Runs an operation that needs the connection to itself.
    ///
    /// The map lock is released before the operation starts, so a slow server
    /// blocks neither the other sessions nor the rest of this one. Only another
    /// exclusive operation on the same session waits.
    ///
    /// Returns `None` if the handle is unknown, or if the session was closed
    /// while this call was waiting its turn.
    pub async fn with<F, Fut, T>(&self, handle: SessionHandle, operation: F) -> Option<T>
    where
        F: FnOnce(Busy) -> Fut,
        Fut: std::future::Future<Output = (Busy, T)>,
    {
        let (slot, user) = {
            let map = self.open.lock().await;
            let entry = map.get(&handle)?;
            (Arc::clone(&entry.connection), entry.user.clone())
        };

        let mut held = slot.lock().await;
        let connection = held.take()?;

        let (busy, result) = operation(Busy { connection, user }).await;
        *held = Some(busy.connection);

        Some(result)
    }

    /// A share of a handle's connection, for work that only needs to read it.
    ///
    /// Distinct from [`with`](Self::with), which *takes* the connection out for
    /// the duration so that authentication can have `&mut`. Anything riding a
    /// connection sees a hole while it is out, and a latency probe runs every
    /// few seconds: a bastion that vanished for the length of one would fail a
    /// chain trying to open a channel at that moment.
    ///
    /// Everything except authentication belongs here. `russh` takes `&mut self`
    /// for the authenticate calls alone.
    ///
    /// Hands back the share rather than taking a closure. An async closure over
    /// a borrowed connection cannot be expressed without boxing its future at
    /// every call site, and the noise would buy nothing: the caller locks, does
    /// its one thing, and drops the guard.
    pub async fn shared(&self, handle: SessionHandle) -> Option<Shared> {
        let map = self.open.lock().await;
        Some(Arc::clone(&map.get(&handle)?.connection))
    }

    /// A share of the connection open for a saved session, if one is.
    ///
    /// What lets a chain ride a bastion somebody already opened, instead of
    /// opening a second connection to a host it is already logged in to.
    pub async fn shared_of_session(&self, session_id: &str) -> Option<Shared> {
        let map = self.open.lock().await;
        map.values()
            .find(|entry| entry.session_id == session_id)
            .map(|entry| Arc::clone(&entry.connection))
    }

    /// Forgets a handle and closes its connection, unless something rides it.
    ///
    /// Waits for an operation already in flight rather than yanking the socket
    /// out from under it. Disconnecting during authentication used to report
    /// success and leave the session running.
    ///
    /// A bastion serving five other sessions must survive its own tab being
    /// closed: the handle goes, the entry goes, and the connection stays until
    /// the last session riding it leaves. Taking it out regardless would leave
    /// five terminals talking to a socket that had been shut, which is the bug
    /// ADR-0024's count exists to make impossible.
    pub async fn close(
        &self,
        handle: SessionHandle,
    ) -> Option<Result<(), crate::ssh::connection::ConnectionError>> {
        let entry = self.open.lock().await.remove(&handle)?;

        /* Waits for an operation already in flight to give the connection back
        before deciding anything. Removing the entry first means no new one can
        start, so this waits once and for a bounded time. Yanking the socket
        during authentication used to report success and leave the session
        running, and a test holds that line. */
        drop(entry.connection.lock().await);

        Some(close_shared(entry.connection).await)
    }

    /// Records where a session's keystrokes should be sent.
    pub async fn attach_input(
        &self,
        handle: SessionHandle,
        sender: tokio::sync::mpsc::Sender<crate::ssh::terminal::Input>,
    ) {
        if let Some(entry) = self.open.lock().await.get_mut(&handle) {
            entry.input = Some(sender);
        }
    }

    /// Whether a shell has already been opened on this handle.
    ///
    /// `input` is set when a shell attaches and is never cleared afterwards, so
    /// this answers "has this handle ever had a shell", which is the question
    /// the caller needs: a second shell on one connection is wrong whether or
    /// not the first has since exited. Opening one anyway abandons the first —
    /// it keeps running, holds a pty, and counts against the server's
    /// `MaxSessions` (#94, ADR-0014).
    pub async fn has_shell(&self, handle: SessionHandle) -> bool {
        self.open
            .lock()
            .await
            .get(&handle)
            .is_some_and(|entry| entry.input.is_some())
    }

    /// Sends a keystroke or a resize, if that session has a shell running.
    ///
    /// The map lock is released before awaiting the send: a full input queue
    /// must slow down one session, not every session.
    pub async fn send_input(
        &self,
        handle: SessionHandle,
        input: crate::ssh::terminal::Input,
    ) -> Option<()> {
        let sender = self.open.lock().await.get(&handle)?.input.clone()?;
        sender.send(input).await.ok()
    }

    /// The byte counters for a session, to hand to its pump or to read.
    pub async fn counters(&self, handle: SessionHandle) -> Option<Arc<Counters>> {
        Some(Arc::clone(&self.open.lock().await.get(&handle)?.counters))
    }

    /// Which saved session a handle belongs to.
    pub async fn session_of(&self, handle: SessionHandle) -> Option<String> {
        Some(self.open.lock().await.get(&handle)?.session_id.clone())
    }

    pub async fn count(&self) -> usize {
        self.open.lock().await.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_handle_names_nothing_about_the_host() {
        /* It is shown in logs and crosses to the webview, so it must not
        carry an address, a user name, or anything else worth having. */
        let handle = SessionHandle(7);
        let rendered = format!("{handle} {handle:?}");

        assert!(rendered.contains("7"));
        for forbidden in ["10.0.", "deploy", "@", "password"] {
            assert!(!rendered.contains(forbidden));
        }
    }

    #[test]
    fn a_handle_crosses_as_a_bare_number() {
        assert_eq!(
            serde_json::to_string(&SessionHandle(42)).expect("serializes"),
            "42"
        );
    }

    #[tokio::test]
    async fn an_unknown_handle_reaches_nothing() {
        let registry = Registry::new();
        assert!(registry.close(SessionHandle(999)).await.is_none());
        assert_eq!(registry.count().await, 0);
    }
}
