//! Local shell commands.
//!
//! Mirrors `commands::terminal`'s shape: the webview holds a session id and
//! sends keystrokes; output comes back as events keyed by that id. The
//! difference is what is behind the id, a native pty rather than an SSH
//! channel, which is why this owns its own registry instead of reusing
//! `ssh::registry::Registry`.

use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime, State};

use crate::commands::terminal::check_input_size;
use crate::error::{Error, IpcError};
use crate::local_shell::kind::LocalShellKind;
use crate::local_shell::pty::pump;
use crate::local_shell::registry::{Registry, SessionId};
use crate::ssh::terminal::{OutputBatch, Sink};

/// The event a batch of output arrives on.
pub const OUTPUT_EVENT: &str = "local-shell://output";
/// The event a closed shell arrives on.
pub const CLOSED_EVENT: &str = "local-shell://closed";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OutputEvent {
    id: SessionId,
    #[serde(flatten)]
    batch: OutputBatch,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClosedEvent {
    id: SessionId,
    exit_status: Option<u32>,
}

/// Sends batches to the webview, keyed by session id.
struct WebviewSink<R: Runtime> {
    app: AppHandle<R>,
    id: SessionId,
}

impl<R: Runtime> Sink for WebviewSink<R> {
    fn emit(&mut self, batch: &[u8]) {
        /* A failed emit means the window is gone. There is nobody to tell, and
        the pump ends when its channel does. */
        let _ = self.app.emit(
            OUTPUT_EVENT,
            OutputEvent {
                id: self.id,
                batch: OutputBatch::encode(batch),
            },
        );
    }

    fn closed(&mut self, exit_status: Option<u32>) {
        let _ = self.app.emit(
            CLOSED_EVENT,
            ClosedEvent {
                id: self.id,
                exit_status,
            },
        );
    }
}

/// Lists the shells this platform can open.
///
/// Sync and parameterless, like `commands::app::app_version`: this is pure,
/// cacheable computation with no app-lifecycle tie-in, so it does not need
/// `State` or a `Result` the way every other command in this module does.
#[tauri::command]
pub fn list_local_shell_kinds() -> Vec<LocalShellKind> {
    crate::local_shell::kind::detected()
}

/// Opens a native pty running `kind` and begins streaming its output.
#[tauri::command]
pub async fn open_local_shell<R: Runtime>(
    app: AppHandle<R>,
    registry: State<'_, Registry>,
    kind: LocalShellKind,
    columns: u16,
    rows: u16,
) -> Result<SessionId, IpcError> {
    let (id, events) = registry
        .open(&kind, columns, rows)
        .await
        .map_err(Error::LocalShell)?;

    let sink = WebviewSink { app, id };
    tauri::async_runtime::spawn(async move {
        pump(events, sink).await;
    });

    Ok(id)
}

/// Sends what the user typed.
///
/// Base64, for the same reason `send_input` uses it: a keystroke can be any
/// byte, and a JSON string cannot.
#[tauri::command]
pub async fn write_local_shell(
    registry: State<'_, Registry>,
    id: SessionId,
    data: String,
) -> Result<(), IpcError> {
    let bytes = check_input_size(&data)?;

    registry
        .write(id, bytes)
        .await
        .map_err(|_| Error::UnknownLocalShell)?;

    Ok(())
}

/// Refuses a resize to a dimension nothing can render.
///
/// Separate from the command so the refusal is testable without a webview,
/// the same reason `commands::terminal::check_input_size` stands alone.
fn check_resize_dimensions(columns: u16, rows: u16) -> Result<(), Error> {
    if columns == 0 || rows == 0 {
        return Err(Error::MalformedInput);
    }
    Ok(())
}

/// Tells the pty the window changed size.
#[tauri::command]
pub async fn resize_local_shell(
    registry: State<'_, Registry>,
    id: SessionId,
    columns: u16,
    rows: u16,
) -> Result<(), IpcError> {
    check_resize_dimensions(columns, rows)?;

    registry
        .resize(id, columns, rows)
        .await
        .map_err(|_| Error::UnknownLocalShell)?;

    Ok(())
}

/// Kills the shell's child process and forgets it.
#[tauri::command]
pub async fn close_local_shell(
    registry: State<'_, Registry>,
    id: SessionId,
) -> Result<(), IpcError> {
    registry.close(id).await;
    Ok(())
}

/* `write_local_shell`, `resize_local_shell` and `close_local_shell` are pure
delegation to `Registry`: each one's own error path (an unknown `SessionId`)
is exactly what `local_shell::registry`'s own tests already cover, the same
reason `commands::forward` tests its extracted `open_connection` helper
rather than a `#[tauri::command]` that takes `State` and cannot be built
outside a running app. `resize_local_shell`'s zero-size refusal is the one
branch that lives here rather than in the registry, covered below. */
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resizing_to_a_zero_dimension_is_refused_before_the_registry_is_asked() {
        assert!(matches!(
            check_resize_dimensions(0, 24),
            Err(Error::MalformedInput)
        ));
        assert!(matches!(
            check_resize_dimensions(80, 0),
            Err(Error::MalformedInput)
        ));
        assert!(check_resize_dimensions(80, 24).is_ok());
    }
}
