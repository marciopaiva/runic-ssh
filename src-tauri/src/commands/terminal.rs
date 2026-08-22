//! Terminal commands.
//!
//! The webview holds a handle and sends keystrokes; output comes back as
//! events keyed by that handle. Nothing else crosses.

use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime, State};
use tokio::sync::mpsc;

use crate::error::{Error, IpcError};
use crate::ssh::registry::{Open, Registry, SessionHandle};
use crate::ssh::terminal::{pump, Input, OutputBatch, Sink};

/// The event a batch of output arrives on.
pub const OUTPUT_EVENT: &str = "terminal://output";
/// The event a closed shell arrives on.
pub const CLOSED_EVENT: &str = "terminal://closed";

/// How many keystrokes may queue before the sender waits.
///
/// Small on purpose: a queue that absorbs everything would let a paste of a
/// megabyte sit in memory instead of pushing back on whoever produced it.
const INPUT_QUEUE: usize = 64;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OutputEvent {
    handle: SessionHandle,
    #[serde(flatten)]
    batch: OutputBatch,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClosedEvent {
    handle: SessionHandle,
    exit_status: Option<u32>,
}

/// Sends batches to the webview, keyed by handle.
struct WebviewSink<R: Runtime> {
    app: AppHandle<R>,
    handle: SessionHandle,
}

impl<R: Runtime> Sink for WebviewSink<R> {
    fn emit(&mut self, batch: &[u8]) {
        /* A failed emit means the window is gone. There is nobody to tell, and
        the pump ends when its channel does. */
        let _ = self.app.emit(
            OUTPUT_EVENT,
            OutputEvent {
                handle: self.handle,
                batch: OutputBatch::encode(batch),
            },
        );
    }

    fn closed(&mut self, exit_status: Option<u32>) {
        let _ = self.app.emit(
            CLOSED_EVENT,
            ClosedEvent {
                handle: self.handle,
                exit_status,
            },
        );
    }
}

/// Starts an interactive shell and begins streaming its output.
#[tauri::command]
pub async fn open_terminal<R: Runtime>(
    app: AppHandle<R>,
    registry: State<'_, Registry>,
    handle: SessionHandle,
    columns: u16,
    rows: u16,
) -> Result<(), IpcError> {
    let channel = registry
        .with(handle, |mut open: Open| async move {
            let result = open.connection.open_shell(columns, rows).await;
            (open, result)
        })
        .await
        .ok_or(Error::UnknownHandle)?
        .map_err(Box::new)?;

    let (sender, receiver) = mpsc::channel(INPUT_QUEUE);
    registry.attach_input(handle, sender).await;

    let sink = WebviewSink { app, handle };
    tauri::async_runtime::spawn(async move {
        pump(channel, sink, receiver).await;
    });

    Ok(())
}

/// Sends what the user typed.
#[tauri::command]
pub async fn send_input(
    registry: State<'_, Registry>,
    handle: SessionHandle,
    data: String,
) -> Result<(), IpcError> {
    use base64ct::{Base64, Encoding};

    /* Base64 in this direction too, for the same reason as the other: a paste
    can contain any byte, and a JSON string cannot. */
    let bytes = Base64::decode_vec(&data).map_err(|_| Error::MalformedInput)?;

    registry
        .send_input(handle, Input::Keys(bytes))
        .await
        .ok_or(Error::UnknownHandle)?;

    Ok(())
}

/// Tells the remote pty the window changed size.
#[tauri::command]
pub async fn resize_terminal(
    registry: State<'_, Registry>,
    handle: SessionHandle,
    columns: u16,
    rows: u16,
) -> Result<(), IpcError> {
    if columns == 0 || rows == 0 {
        return Err(Error::MalformedInput.into());
    }

    registry
        .send_input(handle, Input::Resize { columns, rows })
        .await
        .ok_or(Error::UnknownHandle)?;

    Ok(())
}
