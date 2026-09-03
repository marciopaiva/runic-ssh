//! Local port forwarding (`-L`), and tracking either direction once running.
//!
//! ADR-0054. [`Connection::open_forward`] already opens a `direct-tcpip`
//! channel to an arbitrary endpoint, over `&self`, so several may run on one
//! connection at once: every ProxyJump hop already does exactly this to
//! reach the next host in the chain. A local forward is the same call,
//! driven by an accepted [`TcpListener`] connection instead of a chain hop.
//!
//! [`Forwards`] tracks both directions under the one [`ForwardHandle`] type,
//! since the frontend's own idea of "a forward that is running" does not
//! need to know which kind it is stopping: a remote forward's own start and
//! stop live on [`Connection`] instead, next to the connection-handler state
//! they update, but this is where both are found again by handle.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Mutex;
use tokio::task::{JoinHandle, JoinSet};

use crate::ssh::connection::{Endpoint, Shared};

/// An opaque reference to a local forward in flight. Carries no bind port and
/// no target, the same reasoning [`crate::sftp::transfer::TransferHandle`]'s
/// own doc comment gives: what the frontend cannot name, it cannot leak.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(transparent)]
pub struct ForwardHandle(u64);

impl std::fmt::Display for ForwardHandle {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "forward-{}", self.0)
    }
}

/// Why a local forward could not be started.
#[derive(Debug, thiserror::Error)]
pub enum ForwardError {
    /// The local port is already in use, or otherwise refused by this
    /// machine's own network stack. Distinct from a channel the far end
    /// refuses: this one never reaches the connection at all.
    #[error("the local port could not be bound")]
    BindFailed {
        port: u16,
        #[source]
        source: std::io::Error,
    },
}

/// What stopping a [`ForwardHandle`] actually does, which differs by
/// direction: a local forward has one task (its accept loop, plus the
/// [`JoinSet`] of connections riding it) to abort; a remote forward has no
/// task of its own here at all; asking the connection to stop is what tears
/// down its own [`JoinSet`] of connections, next to the map entry that
/// routes to it.
enum Running {
    Local(JoinHandle<()>),
    Remote { connection: Shared, bind_port: u16 },
}

/// Every forward currently running, of either direction.
///
/// Mirrors [`crate::sftp::transfer::Transfers`]' own shape: an opaque handle
/// per running forward, independent of any other, stoppable without
/// touching the rest. One handle type for both directions, since the
/// frontend's own idea of "a forward that is running" does not need to know
/// which kind it is stopping.
#[derive(Default)]
pub struct Forwards {
    next: AtomicU64,
    running: Mutex<HashMap<ForwardHandle, Running>>,
}

impl Forwards {
    pub fn new() -> Self {
        Self::default()
    }

    /// Allocates a handle before anything is spawned. See
    /// [`crate::sftp::transfer::Transfers::reserve`] for why this is split
    /// from attaching the task.
    pub fn reserve(&self) -> ForwardHandle {
        ForwardHandle(self.next.fetch_add(1, Ordering::Relaxed))
    }

    /// Registers a local forward's own accept loop, already spawned under a
    /// handle [`reserve`](Self::reserve) already produced.
    pub async fn attach_local(&self, handle: ForwardHandle, task: JoinHandle<()>) {
        self.running
            .lock()
            .await
            .insert(handle, Running::Local(task));
    }

    /// Registers a remote forward already started on `connection`, so
    /// [`stop`](Self::stop) knows which connection and which port to ask to
    /// stop it.
    pub async fn attach_remote(&self, handle: ForwardHandle, connection: Shared, bind_port: u16) {
        self.running.lock().await.insert(
            handle,
            Running::Remote {
                connection,
                bind_port,
            },
        );
    }

    /// Forgets a forward once it stops on its own, for whatever reason.
    pub async fn forget(&self, handle: ForwardHandle) {
        self.running.lock().await.remove(&handle);
    }

    /// Stops a forward in flight, tearing down every connection currently
    /// riding it: see [`listen`]'s own doc comment for a local forward, and
    /// [`crate::ssh::connection::Connection::stop_remote_forward`] for a
    /// remote one.
    ///
    /// `false` if the handle names nothing: already stopped, or never
    /// existed. Not an error in either case, since the caller's goal, that
    /// forward not running, is already true.
    pub async fn stop(&self, handle: ForwardHandle) -> bool {
        match self.running.lock().await.remove(&handle) {
            Some(Running::Local(task)) => {
                task.abort();
                true
            }
            Some(Running::Remote {
                connection,
                bind_port,
            }) => {
                let held = connection.lock().await;
                if let Some(connection) = held.as_ref() {
                    connection.stop_remote_forward(bind_port).await;
                }
                true
            }
            None => false,
        }
    }
}

/// Binds `127.0.0.1:bind_port` and returns a future that accepts connections
/// on it, opening one channel per accepted connection through `connection`
/// toward `target` and pumping bytes between the two until either side
/// closes, for as long as the returned future runs.
///
/// Loopback only, deliberately: this is `-L`, not exposing `target` to the
/// LAN. Binding happens before this returns, so a port already in use is
/// reported to the caller immediately, rather than as a forward that starts
/// and silently accepts nothing.
///
/// Every accepted connection's own pump runs inside a [`JoinSet`] local to
/// the returned future, rather than a bare [`tokio::spawn`] per connection:
/// section 6 of `CLAUDE.md` asks that anything outliving the call which
/// started it get a teardown path, and a bare spawn, with nothing tying its
/// lifetime to the forward's own, would be exactly that. Dropping a
/// [`JoinSet`] aborts every task still in it, so the one task
/// [`Forwards::stop`] aborts (the future this returns, once spawned) takes
/// every connection riding it down at the same time.
pub async fn listen(
    connection: Shared,
    bind_port: u16,
    target: Endpoint,
) -> Result<impl std::future::Future<Output = ()> + Send + 'static, ForwardError> {
    let listener = TcpListener::bind(("127.0.0.1", bind_port))
        .await
        .map_err(|source| ForwardError::BindFailed {
            port: bind_port,
            source,
        })?;

    Ok(async move {
        let mut pumps = JoinSet::new();
        loop {
            tokio::select! {
                accepted = listener.accept() => {
                    let Ok((stream, _)) = accepted else { break };
                    let connection = Arc::clone(&connection);
                    let target = target.clone();
                    pumps.spawn(async move {
                        pump(stream, &connection, &target).await;
                    });
                }
                Some(_) = pumps.join_next(), if !pumps.is_empty() => {}
            }
        }
    })
}

/// Opens a channel through `connection` toward `target` and copies bytes
/// bidirectionally with `stream` until either side closes.
///
/// A channel-open failure closes `stream` rather than holding it open with
/// nothing ever arriving on it: indistinguishable, per
/// [`crate::ssh::connection::Connection::open_forward`]'s own doc comment,
/// from the target being unreachable *from the far host* or that host
/// refusing to forward at all, so this treats it the way a real `-L` client
/// does, failing the one local connection that asked rather than the whole
/// forward, which might still serve the next one.
async fn pump(mut stream: TcpStream, connection: &Shared, target: &Endpoint) {
    let channel = {
        let held = connection.lock().await;
        let Some(connection) = held.as_ref() else {
            return;
        };
        match connection.open_forward(target).await {
            Ok(channel) => channel,
            Err(_) => return,
        }
    };

    let mut remote = channel.into_stream();
    let _ = tokio::io::copy_bidirectional(&mut stream, &mut remote).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn a_tracked_local_forward_can_be_stopped() {
        let forwards = Forwards::new();
        let handle = forwards.reserve();
        let task = tokio::spawn(async {
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
        });
        forwards.attach_local(handle, task).await;

        assert!(forwards.stop(handle).await, "the forward was running");
        assert!(
            !forwards.stop(handle).await,
            "stopping twice finds nothing the second time"
        );
    }

    #[tokio::test]
    async fn an_unknown_handle_stops_nothing() {
        let forwards = Forwards::new();
        let phantom = forwards.reserve();
        forwards.attach_local(phantom, tokio::spawn(async {})).await;
        forwards.forget(phantom).await;

        assert!(!forwards.stop(phantom).await);
    }

    #[test]
    fn a_reserved_handle_stops_nothing_before_it_is_attached() {
        let forwards = Forwards::new();
        let handle = forwards.reserve();
        assert_ne!(handle, forwards.reserve(), "each reservation is distinct");
        let _ = handle;
    }

    #[test]
    fn a_handle_names_nothing_about_the_forward() {
        let handle = ForwardHandle(7);
        let rendered = format!("{handle} {handle:?}");
        assert!(rendered.contains('7'));
        for forbidden in ["8080", "target", "bind"] {
            assert!(!rendered.contains(forbidden));
        }
    }

    #[tokio::test]
    async fn a_port_already_bound_is_refused_before_anything_starts() {
        let listener = TcpListener::bind(("127.0.0.1", 0))
            .await
            .expect("a loopback port");
        let port = listener.local_addr().expect("an address").port();

        let connection: Shared = Arc::new(Mutex::new(None));
        let error = listen(
            connection,
            port,
            Endpoint {
                host: "127.0.0.1".to_owned(),
                port,
            },
        )
        .await
        .err()
        .expect("the port is already taken");

        assert!(matches!(error, ForwardError::BindFailed { port: p, .. } if p == port));
        drop(listener);
    }
}
