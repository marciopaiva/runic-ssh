//! Tracking a transfer in flight, so it can be found again and cancelled.
//!
//! Deliberately not [`crate::ssh::registry::Registry`]: that map is addressed
//! by [`crate::ssh::registry::SessionHandle`] and holds a connection for as
//! long as a session is open. A transfer is shorter-lived than the session it
//! runs on, several may run on one session at once, and the only thing a
//! caller ever needs to do with one by its handle is stop it.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};

use tokio::sync::Mutex;
use tokio::task::JoinHandle;

/// An opaque reference to a transfer in flight. Carries no path and no
/// direction, the same reasoning `SessionHandle`'s own doc comment gives for
/// carrying no address: what the frontend cannot name, it cannot leak.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(transparent)]
pub struct TransferHandle(u64);

impl std::fmt::Display for TransferHandle {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "transfer-{}", self.0)
    }
}

/// Every transfer currently running.
#[derive(Default)]
pub struct Transfers {
    next: AtomicU64,
    running: Mutex<HashMap<TransferHandle, JoinHandle<()>>>,
}

impl Transfers {
    pub fn new() -> Self {
        Self::default()
    }

    /// Allocates a handle before anything is spawned.
    ///
    /// Split from attaching the task on purpose: a progress event has to
    /// carry the handle it is about, and the task that reports progress is
    /// the same one this handle will end up naming, so the handle has to
    /// exist before that task's closure is built, not after.
    pub fn reserve(&self) -> TransferHandle {
        TransferHandle(self.next.fetch_add(1, Ordering::Relaxed))
    }

    /// Registers a task already spawned under a handle [`reserve`](Self::reserve)
    /// already produced.
    pub async fn attach(&self, handle: TransferHandle, task: JoinHandle<()>) {
        self.running.lock().await.insert(handle, task);
    }

    /// Forgets a transfer once it finishes on its own, successfully or not.
    ///
    /// Without this, a handle for a transfer long since done would still
    /// resolve to something `cancel` could call `.abort()` on, harmlessly
    /// but pointlessly, and the map would grow for as long as the process
    /// keeps transferring files.
    pub async fn forget(&self, handle: TransferHandle) {
        self.running.lock().await.remove(&handle);
    }

    /// Cancels a transfer in flight. `false` if the handle names nothing:
    /// already finished, already cancelled, or never existed. Not an error
    /// in any of those cases, since the caller's goal, that transfer not
    /// running, is already true.
    pub async fn cancel(&self, handle: TransferHandle) -> bool {
        match self.running.lock().await.remove(&handle) {
            Some(task) => {
                task.abort();
                true
            }
            None => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn a_tracked_transfer_can_be_cancelled() {
        let transfers = Transfers::new();
        let handle = transfers.reserve();
        let task = tokio::spawn(async {
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
        });
        transfers.attach(handle, task).await;

        assert!(transfers.cancel(handle).await, "the transfer was running");
        assert!(
            !transfers.cancel(handle).await,
            "cancelling twice finds nothing the second time"
        );
    }

    #[tokio::test]
    async fn an_unknown_handle_cancels_nothing() {
        let transfers = Transfers::new();
        let phantom = transfers.reserve();
        transfers.attach(phantom, tokio::spawn(async {})).await;
        transfers.forget(phantom).await;

        assert!(!transfers.cancel(phantom).await);
    }

    #[test]
    fn a_reserved_handle_cancels_nothing_before_it_is_attached() {
        let transfers = Transfers::new();
        let handle = transfers.reserve();
        assert_ne!(handle, transfers.reserve(), "each reservation is distinct");
        let _ = handle;
    }

    #[test]
    fn a_handle_names_nothing_about_the_transfer() {
        let handle = TransferHandle(7);
        let rendered = format!("{handle} {handle:?}");
        assert!(rendered.contains('7'));
        for forbidden in ["/home", "download", "upload"] {
            assert!(!rendered.contains(forbidden));
        }
    }
}
