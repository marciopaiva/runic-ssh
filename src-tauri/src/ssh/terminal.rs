//! Terminal input and output.
//!
//! This is the part of the client a hostile host attacks most cheaply.
//! `docs/security-model.md` names a malicious or compromised remote host as the
//! adversary we are most exposed to, and the cheapest thing such a host can do
//! is write continuously. So the loop below is written around that case rather
//! than around the pleasant one.
//!
//! Three properties, in the order they matter:
//!
//! **Memory is bounded.** The buffer has a fixed ceiling. When it is full the
//! loop stops reading the channel, which closes the SSH flow-control window,
//! which stops the server. Backpressure is not something we implement — it is
//! something SSH already has, and that we get by declining to read.
//!
//! **The event rate is bounded.** Output is emitted at most every
//! [`MIN_EMIT_INTERVAL`], so a host writing a byte at a time cannot turn each
//! byte into an IPC message. This is what keeps the interface responsive rather
//! than merely alive.
//!
//! **Bytes are bytes.** A batch is not text. Terminal output is not guaranteed
//! to be valid UTF-8, and even when it is, a multi-byte sequence can land
//! across a batch boundary — converting each batch to a string would corrupt
//! exactly the characters non-English users type. The batch crosses as base64
//! and reaches `xterm.js` as bytes, which knows how to hold an incomplete
//! sequence until the rest arrives.

use std::time::Duration;

use base64ct::{Base64, Encoding};
use russh::client::Msg;
use russh::{Channel, ChannelMsg};
use tokio::sync::mpsc;
use tokio::time::{Instant, MissedTickBehavior};

/// Never emit more often than this. One frame at 60Hz: emitting faster than
/// the screen redraws costs IPC and buys nothing a user can see.
pub const MIN_EMIT_INTERVAL: Duration = Duration::from_millis(16);

/// The most output held in memory per session before the loop stops reading.
/// At that point the SSH window closes and the server waits for us.
pub const MAX_BUFFERED: usize = 256 * 1024;

/// Something the user did, on its way to the remote shell.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Input {
    /// Bytes typed, pasted, or sent by a keyboard shortcut.
    Keys(Vec<u8>),
    /// The window was resized; the remote pty has to be told, or every program
    /// that draws by column count keeps drawing at the old width.
    Resize { columns: u16, rows: u16 },
}

/// Where a batch of output goes.
///
/// A trait so the pump can be exercised without a webview: in the application
/// this wraps the Tauri app handle, and in tests it collects into a vector.
pub trait Sink: Send {
    /// Called with the accumulated bytes. Never called with an empty batch.
    fn emit(&mut self, batch: &[u8]);
    /// Called once when the remote end closes the channel.
    fn closed(&mut self, exit_status: Option<u32>);
}

/// What a batch looks like on the wire.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputBatch {
    /// Base64 rather than a string: see the note on bytes above.
    pub data: String,
}

impl OutputBatch {
    pub fn encode(bytes: &[u8]) -> Self {
        Self {
            data: Base64::encode_string(bytes),
        }
    }
}

/// How the pump behaved. Returned so a test can assert on it, and so the
/// application can report why a session ended.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PumpReport {
    pub bytes_forwarded: u64,
    pub batches_emitted: u64,
    /// How often the buffer filled and the loop stopped reading. A non-zero
    /// count is backpressure working, not a problem.
    pub times_paused: u64,
    pub peak_buffered: usize,
    pub input_sent: u64,
    pub resizes_sent: u64,
}

/// Reads a channel until it closes, emitting batched output.
///
/// The loop reads and flushes in one place on purpose. There is no queue
/// between them, so there is nothing that can grow without bound.
pub async fn pump<S: Sink>(
    mut channel: Channel<Msg>,
    mut sink: S,
    mut input: mpsc::Receiver<Input>,
) -> PumpReport {
    let mut report = PumpReport::default();
    let mut buffer: Vec<u8> = Vec::with_capacity(8 * 1024);
    let mut exit_status = None;

    let mut ticker =
        tokio::time::interval_at(Instant::now() + MIN_EMIT_INTERVAL, MIN_EMIT_INTERVAL);
    /* A tick missed because we were busy must not fire a burst afterwards;
    that would defeat the rate bound at the worst possible moment. */
    ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);

    loop {
        let full = buffer.len() >= MAX_BUFFERED;
        if full {
            report.times_paused += 1;
        }

        tokio::select! {
            /* Disabled while the buffer is full. Declining to read is what
               closes the SSH window and stops the server. */
            message = channel.wait(), if !full => {
                match message {
                    Some(ChannelMsg::Data { data }) => buffer.extend_from_slice(&data),
                    Some(ChannelMsg::ExtendedData { data, .. }) => {
                        /* stderr is interleaved into the same stream, which is
                           what a terminal shows anyway. */
                        buffer.extend_from_slice(&data);
                    }
                    Some(ChannelMsg::ExitStatus { exit_status: status }) => {
                        exit_status = Some(status);
                    }
                    Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => break,
                    Some(_) => {}
                }
                report.peak_buffered = report.peak_buffered.max(buffer.len());
            }

            /* Deliberately *not* disabled while the buffer is full. Under a
               flood the output side pauses, and the keystroke that stops the
               flood is Ctrl-C — a client that stops accepting input exactly
               when the user needs to interrupt has the priority backwards. */
            command = input.recv() => {
                match command {
                    Some(Input::Keys(bytes)) => {
                        if channel.data_bytes(bytes).await.is_err() {
                            break;
                        }
                        report.input_sent += 1;
                    }
                    Some(Input::Resize { columns, rows }) => {
                        if channel
                            .window_change(u32::from(columns), u32::from(rows), 0, 0)
                            .await
                            .is_err()
                        {
                            break;
                        }
                        report.resizes_sent += 1;
                    }
                    None => break,
                }
            }

            _ = ticker.tick() => {
                if !buffer.is_empty() {
                    report.bytes_forwarded += buffer.len() as u64;
                    report.batches_emitted += 1;
                    sink.emit(&buffer);
                    buffer.clear();
                }
            }
        }
    }

    if !buffer.is_empty() {
        report.bytes_forwarded += buffer.len() as u64;
        report.batches_emitted += 1;
        sink.emit(&buffer);
    }

    sink.closed(exit_status);
    report
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_batch_crosses_as_base64_not_as_text() {
        /* The bytes below are not valid UTF-8. A client that converts each
        batch to a string turns them into replacement characters, which is
        how a terminal ends up showing question marks for perfectly good
        output. */
        let invalid = [0xff, 0xfe, 0x00, 0x41];
        let batch = OutputBatch::encode(&invalid);

        assert_eq!(Base64::decode_vec(&batch.data).expect("decodes"), invalid);
    }

    #[test]
    fn a_multibyte_character_survives_a_batch_boundary() {
        /* "ã" is two bytes. Split across two batches and reassembled, it has
        to come back — this is the case that breaks Portuguese and Spanish
        output and nothing else. */
        let text = "não".as_bytes();
        let (first, second) = text.split_at(2);

        let mut rebuilt = Base64::decode_vec(&OutputBatch::encode(first).data).unwrap();
        rebuilt.extend(Base64::decode_vec(&OutputBatch::encode(second).data).unwrap());

        assert_eq!(String::from_utf8(rebuilt).expect("valid again"), "não");
    }
}
