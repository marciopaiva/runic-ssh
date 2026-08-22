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
}

/// Every connection currently open.
///
/// Deliberately not `Debug`: a registry that can print itself is one `dbg!`
/// away from rendering whatever a connection holds.
#[derive(Default)]
pub struct Registry {
    next: AtomicU64,
    open: Mutex<HashMap<SessionHandle, Open>>,
}

impl Registry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Takes ownership of a connection and returns its handle.
    pub async fn insert(&self, open: Open) -> SessionHandle {
        let handle = SessionHandle(self.next.fetch_add(1, Ordering::Relaxed));
        self.open.lock().await.insert(handle, open);
        handle
    }

    /// Runs an operation against a live connection.
    ///
    /// Takes the connection out for the duration rather than holding the map
    /// locked: authentication talks to the network, and a slow server must not
    /// block every other session.
    pub async fn with<F, Fut, T>(&self, handle: SessionHandle, operation: F) -> Option<T>
    where
        F: FnOnce(Open) -> Fut,
        Fut: std::future::Future<Output = (Open, T)>,
    {
        let open = self.open.lock().await.remove(&handle)?;
        let (open, result) = operation(open).await;
        self.open.lock().await.insert(handle, open);
        Some(result)
    }

    /// Removes a connection, handing it back so the caller can close it
    /// politely rather than dropping the socket.
    pub async fn take(&self, handle: SessionHandle) -> Option<Open> {
        self.open.lock().await.remove(&handle)
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
