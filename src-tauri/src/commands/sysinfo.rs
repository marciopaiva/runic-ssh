//! A host's own identity, for a session already connected.
//!
//! One-shot, unlike `commands::monitor`: the frontend calls this once when
//! a host is selected, not on a poll, since none of it changes for the
//! life of a connection.

use tauri::State;

use crate::error::{Error, IpcError};
use crate::ssh::registry::{Registry, SessionHandle};
use crate::ssh::sysinfo::{self, SystemInfo};

/// Runs [`sysinfo::command`] over `handle`'s connection and parses what
/// came back. Same failure shape as `commands::monitor::monitor_session`:
/// `Error::UnknownHandle` before anything is asked of the host.
async fn host_identity(registry: &Registry, handle: SessionHandle) -> Result<SystemInfo, Error> {
    let shared = registry.shared(handle).await.ok_or(Error::UnknownHandle)?;

    let output = {
        let held = shared.lock().await;
        let connection = held.as_ref().ok_or(Error::UnknownHandle)?;
        connection.run_command(&sysinfo::command()).await
    }
    .map_err(Box::new)
    .map_err(Error::Ssh)?;

    Ok(sysinfo::parse(&output.stdout))
}

#[tauri::command]
pub async fn session_system_info(
    registry: State<'_, Registry>,
    handle: SessionHandle,
) -> Result<SystemInfo, IpcError> {
    Ok(host_identity(&registry, handle).await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn an_unknown_handle_is_refused_before_any_command_is_sent() {
        let phantom: SessionHandle = serde_json::from_str("999999").expect("deserializes");
        let registry = Registry::new();

        assert!(matches!(
            host_identity(&registry, phantom).await,
            Err(Error::UnknownHandle)
        ));
    }
}
