//! Every local shell currently open, and how to close one.
//!
//! Mirrors `ssh::registry`'s shape (an id-keyed map behind a `Mutex`, opened
//! once at startup and handed to every command via `.manage()`), not its
//! code: a local shell's resource is a child process and a native pty, not a
//! `russh` handle, so what `close` tears down is different in kind.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use portable_pty::{ChildKiller, MasterPty};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

use crate::local_shell::error::LocalShellError;
use crate::local_shell::kind::LocalShellKind;
use crate::local_shell::pty::{self, ReaderEvent, Spawned};

/// Identifies one open local shell. Opaque to the frontend: minted here,
/// never constructed on the other side of IPC.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct SessionId(u64);

/// What the registry keeps for one open local shell.
struct Entry {
    killer: Box<dyn ChildKiller + Send + Sync>,
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    writer: Arc<Mutex<Box<dyn std::io::Write + Send>>>,
    reader_thread: Option<std::thread::JoinHandle<()>>,
}

/// Every local shell this process currently has open.
///
/// Not `Debug`: a `Box<dyn ChildKiller>` and a `Box<dyn MasterPty>` have no
/// useful printed form, the same reason `ssh::registry::Registry` skips it.
pub struct Registry {
    next: AtomicU64,
    open: Mutex<HashMap<SessionId, Entry>>,
}

impl Registry {
    pub fn new() -> Self {
        Self {
            next: AtomicU64::new(0),
            open: Mutex::new(HashMap::new()),
        }
    }

    /// Opens a native pty running `kind` and registers it under a fresh id.
    /// The caller gets back the id and the reader-event channel; it is
    /// responsible for pumping that channel onto whatever sink it wants
    /// (a webview event, in `commands::local_shell`, but this module does
    /// not know that).
    pub async fn open(
        &self,
        kind: &LocalShellKind,
        columns: u16,
        rows: u16,
    ) -> Result<(SessionId, tokio::sync::mpsc::Receiver<ReaderEvent>), LocalShellError> {
        let Spawned {
            killer,
            master,
            writer,
            events,
            reader_thread,
        } = pty::spawn(kind, columns, rows)?;

        let id = SessionId(self.next.fetch_add(1, Ordering::Relaxed));
        let entry = Entry {
            killer,
            master,
            writer,
            reader_thread: Some(reader_thread),
        };

        self.open.lock().await.insert(id, entry);
        Ok((id, events))
    }

    /// Writes `data` to the shell's stdin. Blocking, so it runs on a
    /// blocking-pool thread rather than the caller's async one.
    pub async fn write(&self, id: SessionId, data: Vec<u8>) -> Result<(), LocalShellError> {
        let writer = {
            let open = self.open.lock().await;
            let entry = open.get(&id).ok_or(LocalShellError::SpawnFailed)?;
            Arc::clone(&entry.writer)
        };

        tokio::task::spawn_blocking(move || {
            use std::io::Write;
            let mut writer = writer.blocking_lock();
            writer.write_all(&data)
        })
        .await
        .map_err(|_| LocalShellError::SpawnFailed)?
        .map_err(|_| LocalShellError::SpawnFailed)
    }

    /// Resizes the shell's pty. An ioctl, cheap enough to run directly on
    /// the caller's task rather than a dedicated thread.
    pub async fn resize(
        &self,
        id: SessionId,
        columns: u16,
        rows: u16,
    ) -> Result<(), LocalShellError> {
        let master = {
            let open = self.open.lock().await;
            let entry = open.get(&id).ok_or(LocalShellError::SpawnFailed)?;
            Arc::clone(&entry.master)
        };

        let result = master.lock().await.resize(portable_pty::PtySize {
            rows,
            cols: columns,
            pixel_width: 0,
            pixel_height: 0,
        });

        result.map_err(|_| LocalShellError::SpawnFailed)
    }

    /// Kills the shell's child process and forgets it. Idempotent: closing
    /// an id that is already gone (or was never open) is not an error here;
    /// `commands::local_shell` is where "unknown id" becomes one.
    pub async fn close(&self, id: SessionId) {
        let entry = self.open.lock().await.remove(&id);
        if let Some(mut entry) = entry {
            let _ = entry.killer.kill();
            if let Some(reader_thread) = entry.reader_thread.take() {
                let _ = tokio::task::spawn_blocking(move || reader_thread.join()).await;
            }
        }
    }

    /// Kills every open shell. Called once, from the app-exit hook: a local
    /// shell is a child process, which survives its parent unless something
    /// kills it first.
    pub async fn close_all(&self) {
        let ids: Vec<SessionId> = self.open.lock().await.keys().copied().collect();
        for id in ids {
            self.close(id).await;
        }
    }

    #[cfg(test)]
    pub async fn count(&self) -> usize {
        self.open.lock().await.len()
    }
}

impl Default for Registry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    #[cfg(not(windows))]
    use std::time::Duration;

    #[cfg(not(windows))]
    use super::*;
    #[cfg(not(windows))]
    use crate::local_shell::kind::LocalShellKind;

    #[cfg(not(windows))]
    #[tokio::test]
    async fn opening_a_shell_registers_it_and_closing_removes_it() {
        let registry = Registry::new();
        let (id, _events) = registry
            .open(&LocalShellKind::DefaultShell, 80, 24)
            .await
            .expect("opens");

        assert_eq!(registry.count().await, 1);

        tokio::time::timeout(Duration::from_secs(5), registry.close(id))
            .await
            .expect("closes before the timeout");

        assert_eq!(registry.count().await, 0);
    }

    #[cfg(not(windows))]
    #[tokio::test]
    async fn close_all_kills_every_open_shell() {
        let registry = Registry::new();
        let (_id1, _events1) = registry
            .open(&LocalShellKind::DefaultShell, 80, 24)
            .await
            .expect("opens");
        let (_id2, _events2) = registry
            .open(&LocalShellKind::DefaultShell, 80, 24)
            .await
            .expect("opens");

        assert_eq!(registry.count().await, 2);

        tokio::time::timeout(Duration::from_secs(5), registry.close_all())
            .await
            .expect("closes before the timeout");

        assert_eq!(registry.count().await, 0);
    }

    #[cfg(not(windows))]
    #[tokio::test]
    async fn writing_and_resizing_an_unknown_id_reaches_nothing() {
        let registry = Registry::new();
        let unknown = SessionId(999_999);

        assert!(registry
            .write(unknown, b"echo hi\n".to_vec())
            .await
            .is_err());
        assert!(registry.resize(unknown, 80, 24).await.is_err());
    }
}
