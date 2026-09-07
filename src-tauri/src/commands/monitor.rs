//! The host's own vital signs, for a session already connected.

use tauri::State;

use crate::error::{Error, IpcError};
use crate::ssh::monitor::{self, SystemStats};
use crate::ssh::registry::{Registry, SessionHandle};

/// Runs [`monitor::command`] over `handle`'s connection and parses what came
/// back.
///
/// Fails as `Error::UnknownHandle` the same way `commands::forward`'s own
/// `open_connection` does, before anything is asked of the host at all: a
/// handle that names nothing and a connection that has since closed are the
/// same fact from here, and the frontend cannot tell them apart either.
///
/// One exec channel per call, closed before this returns: see
/// [`Connection::run_command`](crate::ssh::connection::Connection::run_command)
/// for why that matters against a server's `MaxSessions`. A parse failure
/// never surfaces as an error; it surfaces as `None` on whichever field of
/// [`SystemStats`] could not be read, so a host that is not Linux yields a
/// mostly-empty reading rather than a failed command.
async fn monitor_session(registry: &Registry, handle: SessionHandle) -> Result<SystemStats, Error> {
    let shared = registry.shared(handle).await.ok_or(Error::UnknownHandle)?;

    let output = {
        let held = shared.lock().await;
        let connection = held.as_ref().ok_or(Error::UnknownHandle)?;
        connection.run_command(&monitor::command()).await
    }
    .map_err(Box::new)
    .map_err(Error::Ssh)?;

    Ok(monitor::parse(&output.stdout))
}

#[tauri::command]
pub async fn session_monitor(
    registry: State<'_, Registry>,
    handle: SessionHandle,
) -> Result<SystemStats, IpcError> {
    Ok(monitor_session(&registry, handle).await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn an_unknown_handle_is_refused_before_any_command_is_sent() {
        /* Same pattern `commands::forward`'s own equivalent test uses:
        `SessionHandle`'s field is private outside `ssh::registry`, so an
        arbitrary one is built the way it actually crosses IPC, deserialized
        from the bare number the frontend would send. */
        let phantom: SessionHandle = serde_json::from_str("999999").expect("deserializes");
        let registry = Registry::new();

        assert!(matches!(
            monitor_session(&registry, phantom).await,
            Err(Error::UnknownHandle)
        ));
    }
}
