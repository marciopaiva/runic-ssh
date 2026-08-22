//! What a session has cost so far.
//!
//! Two numbers and a round trip, kept for the status bar. Deliberately thin:
//! the interesting question is not what to measure but where the counters can
//! live without getting in the way of the thing being measured.
//!
//! They are atomics behind an `Arc`, shared with the pump. The pump is the
//! loop that a hostile host attacks by writing continuously, so anything it
//! touches per batch has to be free: a lock here would put the reader — a
//! status bar polling every few seconds — in the path of every byte the host
//! sends.
//!
//! Nothing here is a secret. The byte counts describe volume, not content, and
//! a round trip time describes the network. That matters because these are the
//! only session numbers that cross to the webview.

use std::sync::atomic::{AtomicU64, Ordering};

/// Byte counters for one session.
#[derive(Debug, Default)]
pub struct Counters {
    from_host: AtomicU64,
    to_host: AtomicU64,
}

impl Counters {
    pub fn record_from_host(&self, bytes: usize) {
        self.from_host.fetch_add(bytes as u64, Ordering::Relaxed);
    }

    pub fn record_to_host(&self, bytes: usize) {
        self.to_host.fetch_add(bytes as u64, Ordering::Relaxed);
    }

    /// Reads both counters.
    ///
    /// `Relaxed` throughout: these are two independent tallies shown side by
    /// side, and a reader that catches one an instant before the other has
    /// read a status bar one frame stale. Ordering them would cost the pump
    /// something real to buy nothing anybody can see.
    #[must_use]
    pub fn snapshot(&self) -> Transfer {
        Transfer {
            from_host: self.from_host.load(Ordering::Relaxed),
            to_host: self.to_host.load(Ordering::Relaxed),
        }
    }
}

/// How much has moved, in each direction, since the session opened.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transfer {
    pub from_host: u64,
    pub to_host: u64,
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;

    #[test]
    fn a_new_session_has_moved_nothing() {
        assert_eq!(Counters::default().snapshot(), Transfer::default());
    }

    #[test]
    fn the_two_directions_are_counted_apart() {
        /* The status bar shows them as "down / up". Adding them into one
        tally would make a large upload look like a large download. */
        let counters = Counters::default();
        counters.record_from_host(1000);
        counters.record_to_host(7);

        assert_eq!(
            counters.snapshot(),
            Transfer {
                from_host: 1000,
                to_host: 7,
            }
        );
    }

    #[tokio::test]
    async fn counting_from_several_tasks_loses_nothing() {
        let counters = Arc::new(Counters::default());

        let tasks: Vec<_> = (0..8)
            .map(|_| {
                let counters = Arc::clone(&counters);
                tokio::spawn(async move {
                    for _ in 0..1000 {
                        counters.record_from_host(1);
                    }
                })
            })
            .collect();

        for task in tasks {
            task.await.expect("joins");
        }

        assert_eq!(counters.snapshot().from_host, 8000);
    }

    #[test]
    fn the_wire_form_is_the_one_the_frontend_declares() {
        assert_eq!(
            serde_json::to_string(&Transfer {
                from_host: 2_400_000,
                to_host: 118_000,
            })
            .expect("serializes"),
            r#"{"fromHost":2400000,"toHost":118000}"#
        );
    }
}
