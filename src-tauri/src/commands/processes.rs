//! A host's own busiest processes, for a session already connected.
//!
//! Read-only, matching `ssh::processes`'s own scope: nothing here kills or
//! renices anything.

use tauri::State;

use crate::error::{Error, IpcError};
use crate::ssh::processes::{self, Process};
use crate::ssh::registry::{Registry, SessionHandle};

/// Runs [`processes::command`] over `handle`'s connection and parses what
/// came back. Same failure shape as `commands::systemd::list_units`:
/// `Error::UnknownHandle` before anything is asked of the host, and a host
/// with nothing to report (an unsupported `ps`, or genuinely no output)
/// yields an empty list rather than an error.
async fn list_processes(registry: &Registry, handle: SessionHandle) -> Result<Vec<Process>, Error> {
    let shared = registry.shared(handle).await.ok_or(Error::UnknownHandle)?;

    let output = {
        let held = shared.lock().await;
        let connection = held.as_ref().ok_or(Error::UnknownHandle)?;
        connection.run_command(&processes::command()).await
    }
    .map_err(Box::new)
    .map_err(Error::Ssh)?;

    Ok(processes::parse_processes(&output.stdout))
}

#[tauri::command]
pub async fn session_processes(
    registry: State<'_, Registry>,
    handle: SessionHandle,
) -> Result<Vec<Process>, IpcError> {
    Ok(list_processes(&registry, handle).await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn an_unknown_handle_is_refused_before_any_command_is_sent() {
        let phantom: SessionHandle = serde_json::from_str("999999").expect("deserializes");
        let registry = Registry::new();

        assert!(matches!(
            list_processes(&registry, phantom).await,
            Err(Error::UnknownHandle)
        ));
    }
}
