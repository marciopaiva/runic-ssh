//! A host's own systemd units, for a session already connected.
//!
//! Read-only, matching `ssh::systemd`'s own scope: nothing here starts,
//! stops or reloads anything.

use tauri::State;

use crate::error::{Error, IpcError};
use crate::ssh::registry::{Registry, SessionHandle};
use crate::ssh::systemd::{self, Unit};

/// Runs [`systemd::list_units_command`] over `handle`'s connection and parses
/// what came back. Same failure shape as `commands::monitor::monitor_session`:
/// `Error::UnknownHandle` before anything is asked of the host, and a host
/// with nothing to report (no `systemd`, or genuinely no units) yields an
/// empty list rather than an error.
async fn list_units(registry: &Registry, handle: SessionHandle) -> Result<Vec<Unit>, Error> {
    let shared = registry.shared(handle).await.ok_or(Error::UnknownHandle)?;

    let output = {
        let held = shared.lock().await;
        let connection = held.as_ref().ok_or(Error::UnknownHandle)?;
        connection.run_command(systemd::list_units_command()).await
    }
    .map_err(Box::new)
    .map_err(Error::Ssh)?;

    Ok(systemd::parse_units(&output.stdout))
}

#[tauri::command]
pub async fn session_systemd_units(
    registry: State<'_, Registry>,
    handle: SessionHandle,
) -> Result<Vec<Unit>, IpcError> {
    Ok(list_units(&registry, handle).await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn an_unknown_handle_is_refused_before_any_command_is_sent() {
        let phantom: SessionHandle = serde_json::from_str("999999").expect("deserializes");
        let registry = Registry::new();

        assert!(matches!(
            list_units(&registry, phantom).await,
            Err(Error::UnknownHandle)
        ));
    }
}
