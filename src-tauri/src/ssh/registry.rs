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

use crate::ssh::connection::Connection;

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
    connection: Arc<Mutex<Option<Connection>>>,
    session_id: String,
    user: String,
    input: Option<tokio::sync::mpsc::Sender<crate::ssh::terminal::Input>>,
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
                connection: Arc::new(Mutex::new(Some(open.connection))),
                session_id: open.session_id,
                user: open.user,
                input: open.input,
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

    /// Removes a connection, handing it back so the caller can close it
    /// politely rather than dropping the socket.
    ///
    /// Waits for an operation already in flight rather than yanking the socket
    /// out from under it. Disconnecting during authentication used to report
    /// success and leave the session running.
    pub async fn take(&self, handle: SessionHandle) -> Option<Open> {
        let entry = self.open.lock().await.remove(&handle)?;
        let connection = entry.connection.lock().await.take()?;

        Some(Open {
            connection,
            session_id: entry.session_id,
            user: entry.user,
            input: entry.input,
        })
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
        assert!(registry.take(SessionHandle(999)).await.is_none());
        assert_eq!(registry.count().await, 0);
    }
}
