//! Real files under `/var/log`, for a session already connected: the Logs
//! tab's own path suggestions.
//!
//! Read-only, matching `ssh::candidate_logs`'s own scope.

use tauri::State;

use crate::error::{Error, IpcError};
use crate::ssh::candidate_logs;
use crate::ssh::registry::{Registry, SessionHandle};

async fn candidates(registry: &Registry, handle: SessionHandle) -> Result<Vec<String>, Error> {
    let shared = registry.shared(handle).await.ok_or(Error::UnknownHandle)?;

    let output = {
        let held = shared.lock().await;
        let connection = held.as_ref().ok_or(Error::UnknownHandle)?;
        connection.run_command(&candidate_logs::command()).await
    }
    .map_err(Box::new)
    .map_err(Error::Ssh)?;

    Ok(candidate_logs::parse(&output.stdout))
}

#[tauri::command]
pub async fn session_candidate_logs(
    registry: State<'_, Registry>,
    handle: SessionHandle,
) -> Result<Vec<String>, IpcError> {
    Ok(candidates(&registry, handle).await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn an_unknown_handle_is_refused_before_any_command_is_sent() {
        let phantom: SessionHandle = serde_json::from_str("999999").expect("deserializes");
        let registry = Registry::new();

        assert!(matches!(
            candidates(&registry, phantom).await,
            Err(Error::UnknownHandle)
        ));
    }
}
