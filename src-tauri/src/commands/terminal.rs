//! Terminal commands.
//!
//! The webview holds a handle and sends keystrokes; output comes back as
//! events keyed by that handle. Nothing else crosses.

use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime, State};
use tokio::sync::mpsc;

use crate::error::{Error, IpcError};
use crate::ssh::registry::{Busy, Registry, SessionHandle};
use crate::ssh::stats::Transfer;
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

/// The largest single input the core will accept.
///
/// 32 KiB is far more than a keystroke and more than any paste a person makes
/// by hand, and far less than something worth sending. The webview is our own
/// code, but `docs/architecture.md` says every value crossing into the core is
/// validated on the Rust side regardless of what the frontend claims to have
/// checked — and #23 bounded what a *host* can push at us without bounding
/// what the other side of the IPC can.
pub const MAX_INPUT_BYTES: usize = 32 * 1024;

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
        .with(handle, |mut busy: Busy| async move {
            let result = busy.connection.open_shell(columns, rows).await;
            (busy, result)
        })
        .await
        .ok_or(Error::UnknownHandle)?
        .map_err(Box::new)?;

    let (sender, receiver) = mpsc::channel(INPUT_QUEUE);
    registry.attach_input(handle, sender).await;

    let counters = registry
        .counters(handle)
        .await
        .ok_or(Error::UnknownHandle)?;

    let sink = WebviewSink { app, handle };
    tauri::async_runtime::spawn(async move {
        pump(channel, sink, receiver, counters).await;
    });

    Ok(())
}

/// Sends what the user typed.
/// Refuses input the core should never be asked to forward.
///
/// Separate from the command so the refusals are testable without a webview,
/// and checked before the decode as well as after: base64 expands by a third,
/// so a caller sending a gigabyte would otherwise have it allocated here
/// before the length was ever looked at.
pub fn check_input_size(encoded: &str) -> Result<Vec<u8>, Error> {
    use base64ct::{Base64, Encoding};

    if encoded.len() > MAX_INPUT_BYTES * 2 {
        return Err(Error::InputTooLarge);
    }

    let bytes = Base64::decode_vec(encoded).map_err(|_| Error::MalformedInput)?;

    if bytes.len() > MAX_INPUT_BYTES {
        return Err(Error::InputTooLarge);
    }

    Ok(bytes)
}

/// Sends what the user typed.
///
/// Base64 in this direction too, for the same reason as the other: a paste can
/// contain any byte, and a JSON string cannot.
#[tauri::command]
pub async fn send_input(
    registry: State<'_, Registry>,
    handle: SessionHandle,
    data: String,
) -> Result<(), IpcError> {
    let bytes = check_input_size(&data)?;

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

/// What a session has cost so far, for the status bar.
///
/// Nothing here describes what was transferred, only how much, plus the time a
/// packet takes to come back. Those are the only session numbers section 7.2
/// allows across, and it is worth saying so where somebody would otherwise be
/// tempted to add "last command" beside them.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStats {
    #[serde(flatten)]
    pub transfer: Transfer,
    /// The round trip in milliseconds, or `null` when the host did not answer.
    pub latency_ms: Option<u64>,
}

/// Measures the round trip and reads the byte counters.
///
/// One command rather than two: the round trip is the slow part, and a caller
/// that wanted both would otherwise pay for a second lookup to get numbers
/// that are free.
///
/// A host that does not answer the probe yields `latencyMs: null` rather than
/// an error. The session is still open and the counters are still true; a
/// status bar that blanked entirely because one probe was lost would be
/// reporting something worse than what happened.
#[tauri::command]
pub async fn session_stats(
    registry: State<'_, Registry>,
    handle: SessionHandle,
) -> Result<SessionStats, IpcError> {
    let transfer = registry
        .counters(handle)
        .await
        .ok_or(Error::UnknownHandle)?
        .snapshot();

    let latency = registry
        .with(handle, |mut busy: Busy| async move {
            let result = busy.connection.round_trip().await;
            (busy, result)
        })
        .await
        .ok_or(Error::UnknownHandle)?;

    Ok(SessionStats {
        transfer,
        latency_ms: latency.ok().map(|elapsed| {
            /* Saturating rather than wrapping: a round trip longer than 584
            million years is not a number worth preserving exactly, but it is
            worth not reporting as 3 ms. */
            u64::try_from(elapsed.as_millis()).unwrap_or(u64::MAX)
        }),
    })
}

#[cfg(test)]
mod tests {
    use base64ct::{Base64, Encoding};

    use super::*;

    #[test]
    fn an_ordinary_keystroke_passes() {
        let encoded = Base64::encode_string(b"ls -la\n");
        assert_eq!(check_input_size(&encoded).expect("accepted"), b"ls -la\n");
    }

    #[test]
    fn a_large_paste_is_still_reasonable() {
        /* Someone pasting a certificate or a long command should not be
        refused; the limit is for what nobody types. */
        let paste = vec![b'x'; 16 * 1024];
        let encoded = Base64::encode_string(&paste);
        assert_eq!(
            check_input_size(&encoded).expect("accepted").len(),
            paste.len()
        );
    }

    #[test]
    fn something_nobody_typed_is_refused() {
        let flood = vec![b'x'; MAX_INPUT_BYTES + 1];
        let encoded = Base64::encode_string(&flood);

        assert!(matches!(
            check_input_size(&encoded),
            Err(Error::InputTooLarge)
        ));
    }

    #[test]
    fn the_length_is_checked_before_the_decode_allocates() {
        /* base64 expands by a third, so checking only the decoded length would
        allocate the whole thing first. A caller sending a gigabyte should
        cost us the length check and nothing else. */
        let enormous = "A".repeat(MAX_INPUT_BYTES * 2 + 1);

        assert!(matches!(
            check_input_size(&enormous),
            Err(Error::InputTooLarge)
        ));
    }

    #[test]
    fn malformed_base64_is_refused_rather_than_guessed() {
        assert!(matches!(
            check_input_size("!!!not base64!!!"),
            Err(Error::MalformedInput)
        ));
    }
}
