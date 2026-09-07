//! A host's own listening sockets, for a session already connected.
//!
//! Read-only, matching `ssh::ports`'s own scope.

use tauri::State;

use crate::error::{Error, IpcError};
use crate::ssh::ports::{self, ListeningSocket};
use crate::ssh::registry::{Registry, SessionHandle};

/// Runs [`ports::command`] over `handle`'s connection and parses what came
/// back. Same failure shape as `commands::processes::list_processes`:
/// `Error::UnknownHandle` before anything is asked of the host, and a host
/// with nothing to report (no `ss`, or genuinely nothing listening) yields
/// an empty list rather than an error.
async fn list_ports(
    registry: &Registry,
    handle: SessionHandle,
) -> Result<Vec<ListeningSocket>, Error> {
    let shared = registry.shared(handle).await.ok_or(Error::UnknownHandle)?;

    let output = {
        let held = shared.lock().await;
        let connection = held.as_ref().ok_or(Error::UnknownHandle)?;
        connection.run_command(ports::command()).await
    }
    .map_err(Box::new)
    .map_err(Error::Ssh)?;

    Ok(ports::parse(&output.stdout))
}

#[tauri::command]
pub async fn session_ports(
    registry: State<'_, Registry>,
    handle: SessionHandle,
) -> Result<Vec<ListeningSocket>, IpcError> {
    Ok(list_ports(&registry, handle).await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn an_unknown_handle_is_refused_before_any_command_is_sent() {
        let phantom: SessionHandle = serde_json::from_str("999999").expect("deserializes");
        let registry = Registry::new();

        assert!(matches!(
            list_ports(&registry, phantom).await,
            Err(Error::UnknownHandle)
        ));
    }
}
