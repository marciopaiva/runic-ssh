//! A systemd unit's own recent journal lines, for a session already
//! connected.
//!
//! Read-only, matching `ssh::journal`'s own scope.

use tauri::State;

use crate::error::{Error, IpcError};
use crate::ssh::journal;
use crate::ssh::registry::{Registry, SessionHandle};

/// Runs [`journal::command`] for `unit` over `handle`'s connection and
/// parses what came back. A `unit` that does not look like a real systemd
/// unit name yields an empty list without the host ever being asked, the
/// same "nothing to report" shape [`journal::parse`] already answers a
/// permission error or a missing `journalctl` with.
async fn unit_journal(
    registry: &Registry,
    handle: SessionHandle,
    unit: &str,
) -> Result<Vec<String>, Error> {
    let shared = registry.shared(handle).await.ok_or(Error::UnknownHandle)?;

    let Some(command) = journal::command(unit) else {
        return Ok(Vec::new());
    };

    let output = {
        let held = shared.lock().await;
        let connection = held.as_ref().ok_or(Error::UnknownHandle)?;
        connection.run_command(&command).await
    }
    .map_err(Box::new)
    .map_err(Error::Ssh)?;

    Ok(journal::parse(&output.stdout))
}

#[tauri::command]
pub async fn session_unit_journal(
    registry: State<'_, Registry>,
    handle: SessionHandle,
    unit: String,
) -> Result<Vec<String>, IpcError> {
    Ok(unit_journal(&registry, handle, &unit).await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn an_unknown_handle_is_refused_before_any_command_is_sent() {
        let phantom: SessionHandle = serde_json::from_str("999999").expect("deserializes");
        let registry = Registry::new();

        assert!(matches!(
            unit_journal(&registry, phantom, "ssh.service").await,
            Err(Error::UnknownHandle)
        ));
    }
}
