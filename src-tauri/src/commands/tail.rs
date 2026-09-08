//! The tail of an arbitrary log file, for a session already connected.
//!
//! Read-only, matching `ssh::tail`'s own scope.

use tauri::State;

use crate::error::{Error, IpcError};
use crate::ssh::registry::{Registry, SessionHandle};
use crate::ssh::tail;

/// Runs [`tail::command`] for `path` over `handle`'s connection and parses
/// what came back. A `path` that is empty or not absolute yields an empty
/// list without the host ever being asked, the same "nothing to report"
/// shape [`tail::parse`] already answers a permission error or a missing
/// file with.
async fn tail_file(
    registry: &Registry,
    handle: SessionHandle,
    path: &str,
) -> Result<Vec<String>, Error> {
    let shared = registry.shared(handle).await.ok_or(Error::UnknownHandle)?;

    let Some(command) = tail::command(path) else {
        return Ok(Vec::new());
    };

    let output = {
        let held = shared.lock().await;
        let connection = held.as_ref().ok_or(Error::UnknownHandle)?;
        connection.run_command(&command).await
    }
    .map_err(Box::new)
    .map_err(Error::Ssh)?;

    Ok(tail::parse(&output.stdout))
}

#[tauri::command]
pub async fn session_tail_file(
    registry: State<'_, Registry>,
    handle: SessionHandle,
    path: String,
) -> Result<Vec<String>, IpcError> {
    Ok(tail_file(&registry, handle, &path).await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn an_unknown_handle_is_refused_before_any_command_is_sent() {
        let phantom: SessionHandle = serde_json::from_str("999999").expect("deserializes");
        let registry = Registry::new();

        assert!(matches!(
            tail_file(&registry, phantom, "/var/log/app.log").await,
            Err(Error::UnknownHandle)
        ));
    }
}
