//! The bridge between a native pty and the async world.
//!
//! A dedicated OS thread owns the blocking reader and the child, since
//! `portable_pty` gives us `std::io::Read`, not an async source, and feeds
//! what it reads into a channel. [`pump`] drains that channel the same
//! rate-limited way `ssh::terminal::pump` drains a channel of its own:
//! batched, emitted at most once per [`MIN_EMIT_INTERVAL`], never emitted
//! empty.
//!
//! Writing and resizing do not need a bridge. Unlike an SSH `Channel`, which
//! `ssh::terminal::Input` multiplexes keystrokes and resizes through because
//! only one task may hold it at a time, a pty's writer handle and its master
//! are two independent resources: `registry::Entry` holds both directly, and
//! a write or a resize is one blocking call, not a stream to serialize.

use std::io::Read;
use std::sync::Arc;

use portable_pty::{native_pty_system, Child, ChildKiller, MasterPty, PtySize};
use tokio::sync::{mpsc, Mutex};
use tokio::time::{Instant, MissedTickBehavior};

use crate::local_shell::error::LocalShellError;
use crate::local_shell::kind::LocalShellKind;
use crate::ssh::terminal::{Sink, MAX_BUFFERED, MIN_EMIT_INTERVAL};

/// How many chunks the reader thread may hand the async side before it
/// blocks. Small on purpose: the bound that matters is on bytes, enforced in
/// [`pump`]; this one only stops the channel itself from growing without
/// limit while the async side is briefly busy.
const READER_CHANNEL_CAPACITY: usize = 64;

/// What the reader thread hands to the async side.
pub enum ReaderEvent {
    /// A chunk of output, exactly as read from the pty. Never empty.
    Data(Vec<u8>),
    /// The process is gone. Sent exactly once, last.
    Closed(Option<u32>),
}

/// Everything a freshly spawned local shell hands back to its caller.
pub struct Spawned {
    pub killer: Box<dyn ChildKiller + Send + Sync>,
    pub master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    pub writer: Arc<Mutex<Box<dyn std::io::Write + Send>>>,
    pub events: mpsc::Receiver<ReaderEvent>,
    pub reader_thread: std::thread::JoinHandle<()>,
}

/// Opens a native pty and spawns `kind`'s program behind it.
///
/// The slave side is dropped as soon as the child is spawned. On Unix, a
/// copy of it left open in this process is itself a writer on the pty; the
/// master's reader would never see EOF after the child exits while one
/// remains, and `read_loop` below would block forever instead of noticing
/// the shell closed.
pub fn spawn(kind: &LocalShellKind, columns: u16, rows: u16) -> Result<Spawned, LocalShellError> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols: columns,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|_| LocalShellError::SpawnFailed)?;

    let child = pair
        .slave
        .spawn_command(kind.command())
        .map_err(|_| LocalShellError::SpawnFailed)?;
    drop(pair.slave);

    let killer = child.clone_killer();
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|_| LocalShellError::SpawnFailed)?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|_| LocalShellError::SpawnFailed)?;

    let (sender, events) = mpsc::channel(READER_CHANNEL_CAPACITY);
    let reader_thread = std::thread::spawn(move || read_loop(reader, child, sender));

    Ok(Spawned {
        killer,
        master: Arc::new(Mutex::new(pair.master)),
        writer: Arc::new(Mutex::new(writer)),
        events,
        reader_thread,
    })
}

/// Reads until the pty closes, then reaps the child and reports how it
/// exited. Runs on its own thread: `Read::read` here blocks, and nothing
/// async may be blocked on the Tokio runtime's own threads.
fn read_loop(
    mut reader: Box<dyn Read + Send>,
    mut child: Box<dyn Child + Send + Sync>,
    sender: mpsc::Sender<ReaderEvent>,
) {
    let mut buf = [0u8; 8 * 1024];
    loop {
        match reader.read(&mut buf) {
            Ok(0) | Err(_) => break,
            Ok(read) => {
                if sender
                    .blocking_send(ReaderEvent::Data(buf[..read].to_vec()))
                    .is_err()
                {
                    // The async side is gone; nobody is left to tell.
                    return;
                }
            }
        }
    }

    let exit_status = child.wait().ok().map(|status| status.exit_code());
    let _ = sender.blocking_send(ReaderEvent::Closed(exit_status));
}

/// Batches whatever `events` carries onto `sink`, the same rate-limited way
/// `ssh::terminal::pump` batches a channel's output, and returns once the
/// reader thread reports the process closed (or is itself gone).
pub async fn pump<S: Sink>(mut events: mpsc::Receiver<ReaderEvent>, mut sink: S) {
    let mut buffered: Vec<u8> = Vec::with_capacity(8 * 1024);

    let mut ticker =
        tokio::time::interval_at(Instant::now() + MIN_EMIT_INTERVAL, MIN_EMIT_INTERVAL);
    ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);

    loop {
        tokio::select! {
            event = events.recv() => {
                match event {
                    Some(ReaderEvent::Data(chunk)) => {
                        buffered.extend_from_slice(&chunk);
                        if buffered.len() >= MAX_BUFFERED {
                            sink.emit(&buffered);
                            buffered.clear();
                        }
                    }
                    Some(ReaderEvent::Closed(exit_status)) => {
                        if !buffered.is_empty() {
                            sink.emit(&buffered);
                        }
                        sink.closed(exit_status);
                        return;
                    }
                    None => {
                        if !buffered.is_empty() {
                            sink.emit(&buffered);
                        }
                        sink.closed(None);
                        return;
                    }
                }
            }

            _ = ticker.tick() => {
                if !buffered.is_empty() {
                    sink.emit(&buffered);
                    buffered.clear();
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;
    use crate::local_shell::kind::LocalShellKind;

    struct CollectingSink {
        batches: Vec<Vec<u8>>,
        closed: Option<Option<u32>>,
    }

    impl Sink for CollectingSink {
        fn emit(&mut self, batch: &[u8]) {
            assert!(!batch.is_empty(), "pump must never emit an empty batch");
            self.batches.push(batch.to_vec());
        }

        fn closed(&mut self, exit_status: Option<u32>) {
            self.closed = Some(exit_status);
        }
    }

    #[cfg(not(windows))]
    #[tokio::test]
    async fn a_spawned_shell_can_be_written_to_and_read_from() {
        let spawned = spawn(&LocalShellKind::DefaultShell, 80, 24).expect("spawns");
        {
            let writer = spawned.writer.lock().await;
            let mut writer = writer;
            use std::io::Write;
            writer
                .write_all(b"echo hello-local-shell\n")
                .expect("writes");
        }

        let sink = CollectingSink {
            batches: Vec::new(),
            closed: None,
        };

        let pumped = tokio::time::timeout(Duration::from_secs(5), async move {
            let mut events = spawned.events;
            let mut sink = sink;
            let mut seen = Vec::new();
            while let Some(event) = events.recv().await {
                match event {
                    ReaderEvent::Data(chunk) => {
                        seen.extend_from_slice(&chunk);
                        sink.emit(&chunk);
                        if String::from_utf8_lossy(&seen).contains("hello-local-shell") {
                            break;
                        }
                    }
                    ReaderEvent::Closed(status) => {
                        sink.closed(status);
                        break;
                    }
                }
            }
            seen
        })
        .await
        .expect("the shell echoed back before the timeout");

        assert!(String::from_utf8_lossy(&pumped).contains("hello-local-shell"));

        let _ = spawned.killer;
        let _ = tokio::task::spawn_blocking(move || spawned.reader_thread.join()).await;
    }
}
