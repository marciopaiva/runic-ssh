//! Port forwarding commands, local and remote.
//!
//! A forward returns a handle immediately, the same shape `commands::sftp`
//! already uses for a transfer: starting one is a bind (or a request to the
//! server) and nothing more, not something worth blocking the caller on, and
//! stopping one is a lookup by handle with no reason to fail when the handle
//! already names nothing.

use tauri::State;

use crate::error::{Error, IpcError};
use crate::ssh::connection::{Endpoint, Shared};
use crate::ssh::forward::{self, ForwardHandle, Forwards};
use crate::ssh::registry::{Registry, SessionHandle};

/// Resolves `handle` to the connection it names.
///
/// Fails as `Error::UnknownHandle` whether the handle names nothing or the
/// connection behind it is gone, the same rule `commands::sftp::open_session`
/// follows for the same reason: the frontend cannot tell those apart either.
async fn open_connection(registry: &Registry, handle: SessionHandle) -> Result<Shared, Error> {
    registry.shared(handle).await.ok_or(Error::UnknownHandle)
}

/// Starts a local forward: `127.0.0.1:bind_port` on this machine, through
/// `handle`'s connection, to `target_host:target_port` as that connection's
/// own far end sees it.
///
/// Returns as soon as the local port is bound. A bind failure (the port is
/// already in use, most often) is returned here, before anything is tracked;
/// a channel the far end refuses happens later, per connection, and is dealt
/// with there rather than failing the whole forward: see
/// `ssh::forward::pump`'s own doc comment.
#[tauri::command]
pub async fn start_local_forward(
    registry: State<'_, Registry>,
    forwards: State<'_, Forwards>,
    handle: SessionHandle,
    bind_port: u16,
    target_host: String,
    target_port: u16,
) -> Result<ForwardHandle, IpcError> {
    let connection = open_connection(&registry, handle).await?;

    let target = Endpoint {
        host: target_host,
        port: target_port,
    };
    let accept_loop = forward::listen(connection, bind_port, target)
        .await
        .map_err(Error::Forward)?;

    let forward = forwards.reserve();
    forwards
        .attach_local(forward, tokio::spawn(accept_loop))
        .await;

    Ok(forward)
}

/// Starts a remote forward: asks `handle`'s connection's own far end to
/// listen on `bind_port`, and forwards what it accepts to
/// `target_host:target_port` as reachable from this machine.
///
/// Returns as soon as the server answers. A refusal (no `AllowTcpForwarding`,
/// or a port it will not grant) is returned here, before anything is
/// tracked, the same shape a local forward's own bind failure takes.
#[tauri::command]
pub async fn start_remote_forward(
    registry: State<'_, Registry>,
    forwards: State<'_, Forwards>,
    handle: SessionHandle,
    bind_port: u16,
    target_host: String,
    target_port: u16,
) -> Result<ForwardHandle, IpcError> {
    let connection = open_connection(&registry, handle).await?;

    let target = Endpoint {
        host: target_host,
        port: target_port,
    };
    let granted = {
        let held = connection.lock().await;
        let session = held.as_ref().ok_or(Error::UnknownHandle)?;
        session
            .start_remote_forward(bind_port, target)
            .await
            .map_err(Box::new)
            .map_err(Error::Ssh)?
    };

    let forward = forwards.reserve();
    forwards.attach_remote(forward, connection, granted).await;

    Ok(forward)
}

/// Stops a forward in flight, local or remote. Not an error when the handle
/// already names nothing: the caller's goal, that forward not running, is
/// already true.
#[tauri::command]
pub async fn stop_forward(
    forwards: State<'_, Forwards>,
    handle: ForwardHandle,
) -> Result<(), IpcError> {
    forwards.stop(handle).await;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn an_unknown_handle_is_refused_before_anything_binds() {
        /* `SessionHandle`'s field is private outside `ssh::registry`, so an
        arbitrary one for a test is built the way it actually crosses IPC:
        deserialized from the bare number the frontend would send, the same
        pattern `commands::sftp`'s own equivalent test uses. */
        let phantom: SessionHandle = serde_json::from_str("999999").expect("deserializes");
        let registry = Registry::new();

        assert!(matches!(
            open_connection(&registry, phantom).await,
            Err(Error::UnknownHandle)
        ));
    }
}
