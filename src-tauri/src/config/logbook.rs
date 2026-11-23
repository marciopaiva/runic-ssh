//! The Logbook: what happened to each host, on this machine only (ADR-0081).
//!
//! One bounded file per host under `logbook/`. It is append-only in intent and
//! trimmed in practice: past a fixed number of events or bytes the oldest go
//! first, so a host that flaps all night cannot fill a disk.
//!
//! What it never holds is the point of it. No keystrokes, no host output, no
//! secrets, no addresses. Every event is a variant of [`Event`], and each
//! variant's fields are the whole of what can be written: there is no free text
//! field to put a mistake in. `the_fields_are_pinned` fails when a variant gains
//! one, so widening what is recorded is a decision a reviewer sees, not a side
//! effect.
//!
//! Recording is best effort. A Logbook that cannot be written must never fail
//! the connection, the transfer or the macro that it is describing, so
//! [`record`] reports nothing and the callers do not branch on it.

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::error::Error;

pub const LOGBOOK_DIR: &str = "logbook";

/// Past this many events the oldest are dropped.
pub const MAX_EVENTS: usize = 500;

/// Past this many bytes on disk the oldest are dropped. About a hundred bytes an
/// event, so this is rarely the bound that bites; it is there for the one that
/// is longer than it should be.
pub const MAX_BYTES: usize = 64 * 1024;

/// A fingerprint is `SHA256:` and 43 characters. Anything longer is cut, so a
/// malformed value cannot grow a line.
const MAX_FINGERPRINT: usize = 80;

const MAX_NAME: usize = 80;

/// How a macro run ended on one host.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Outcome {
    Ran,
    TimedOut,
    Failed,
}

/// Something that happened to a host.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Kind {
    /// The connection was made and the host accepted the login.
    Connected,
    /// The connection was lost without being closed.
    Dropped,
    /// A reconnect attempt started, counting from one (ADR-0079).
    Reconnecting { attempt: u32 },
    /// A dropped connection came back.
    Reconnected,
    /// The host's key was trusted. `replaced` says a different key had been
    /// trusted before, which is the event worth finding again later.
    #[serde(rename_all = "camelCase")]
    HostKeyTrusted { fingerprint: String, replaced: bool },
    /// A saved script macro ran on this host as part of a fleet run.
    #[serde(rename_all = "camelCase")]
    MacroRun {
        name: String,
        outcome: Outcome,
        exit_status: Option<u32>,
    },
}

/// One entry: when, and what.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Event {
    /// Milliseconds since the Unix epoch.
    pub at: u64,
    #[serde(flatten)]
    pub kind: Kind,
}

impl Event {
    /// An event stamped now, with every string cut to what a line may hold.
    pub fn now(kind: Kind) -> Self {
        let at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|since| u64::try_from(since.as_millis()).unwrap_or(u64::MAX))
            .unwrap_or_default();
        Self {
            at,
            kind: bounded(kind),
        }
    }
}

fn cut(text: String, to: usize) -> String {
    text.chars().take(to).collect()
}

fn bounded(kind: Kind) -> Kind {
    match kind {
        Kind::HostKeyTrusted {
            fingerprint,
            replaced,
        } => Kind::HostKeyTrusted {
            fingerprint: cut(fingerprint, MAX_FINGERPRINT),
            replaced,
        },
        Kind::MacroRun {
            name,
            outcome,
            exit_status,
        } => Kind::MacroRun {
            name: cut(name, MAX_NAME),
            outcome,
            exit_status,
        },
        other => other,
    }
}

/// Whether a host id is safe to use as a file name.
///
/// Ids come from the webview, so one is never joined onto a path before this
/// says yes. Core-made ids are hex and dashes, which is all this lets through.
fn safe_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Reads and writes the Logbook under a directory the caller owns.
#[derive(Debug, Clone)]
pub struct LogbookStore {
    directory: PathBuf,
}

impl LogbookStore {
    pub fn new(directory: impl Into<PathBuf>) -> Self {
        Self {
            directory: directory.into().join(LOGBOOK_DIR),
        }
    }

    fn path(&self, id: &str) -> Result<PathBuf, Error> {
        if !safe_id(id) {
            return Err(Error::UnknownSession { id: id.to_owned() });
        }
        Ok(self.directory.join(format!("{id}.json")))
    }

    /// A host's events, oldest first. None at all when there is no file yet.
    pub fn read(&self, id: &str) -> Result<Vec<Event>, Error> {
        let path = self.path(id)?;
        let text = match fs::read_to_string(&path) {
            Ok(text) => text,
            Err(source) if source.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(source) => return Err(Error::SettingsUnreadable { path, source }),
        };
        serde_json::from_str(&text).map_err(|source| Error::SettingsMalformed { path, source })
    }

    fn write(&self, id: &str, events: &[Event]) -> Result<(), Error> {
        let path = self.path(id)?;
        crate::config::private::create_dir(&self.directory).map_err(|source| {
            Error::SettingsUnwritable {
                path: self.directory.clone(),
                source,
            }
        })?;
        let json = serde_json::to_string(events).map_err(|source| Error::SettingsMalformed {
            path: path.clone(),
            source,
        })?;
        let temporary = self.directory.join(format!("{id}.json.tmp"));
        crate::config::private::write(&temporary, json).map_err(|source| {
            Error::SettingsUnwritable {
                path: temporary.clone(),
                source,
            }
        })?;
        fs::rename(&temporary, &path).map_err(|source| Error::SettingsUnwritable { path, source })
    }

    /// Adds one event and trims the oldest past either bound.
    pub fn append(&self, id: &str, event: Event) -> Result<(), Error> {
        /* A file that cannot be read is started over rather than left to block
        every later event: the Logbook is a convenience, and one corrupt file
        should cost that host its history, not its future. */
        let mut events = self.read(id).unwrap_or_default();
        events.push(event);

        if events.len() > MAX_EVENTS {
            events.drain(..events.len() - MAX_EVENTS);
        }
        while events.len() > 1 && serde_json::to_string(&events).map_or(0, |s| s.len()) > MAX_BYTES
        {
            events.remove(0);
        }

        self.write(id, &events)
    }

    /// Forgets everything recorded for one host.
    pub fn clear(&self, id: &str) -> Result<(), Error> {
        let path = self.path(id)?;
        match fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(source) if source.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(source) => Err(Error::SettingsUnwritable { path, source }),
        }
    }
}

/// Records an event and says nothing if it could not. See the module note.
pub fn record(store: &LogbookStore, id: &str, kind: Kind) {
    let _ = store.append(id, Event::now(kind));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> (LogbookStore, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("a temporary directory");
        (LogbookStore::new(dir.path()), dir)
    }

    fn keys(value: &serde_json::Value) -> Vec<String> {
        let mut keys: Vec<String> = value
            .as_object()
            .expect("an object")
            .keys()
            .cloned()
            .collect();
        keys.sort();
        keys
    }

    /// The golden test. Every variant, with every field filled, and the exact
    /// set of keys each one writes. A new field fails this until somebody
    /// reads it and changes the list on purpose.
    #[test]
    fn the_fields_are_pinned() {
        let every = [
            (Kind::Connected, vec!["at", "kind"]),
            (Kind::Dropped, vec!["at", "kind"]),
            (
                Kind::Reconnecting { attempt: 3 },
                vec!["at", "attempt", "kind"],
            ),
            (Kind::Reconnected, vec!["at", "kind"]),
            (
                Kind::HostKeyTrusted {
                    fingerprint: "SHA256:x".to_owned(),
                    replaced: true,
                },
                vec!["at", "fingerprint", "kind", "replaced"],
            ),
            (
                Kind::MacroRun {
                    name: "check".to_owned(),
                    outcome: Outcome::Ran,
                    exit_status: Some(0),
                },
                vec!["at", "exitStatus", "kind", "name", "outcome"],
            ),
        ];

        for (kind, expected) in every {
            let value = serde_json::to_value(Event { at: 1, kind }).expect("serialises");
            assert_eq!(keys(&value), expected, "{value}");
        }
    }

    #[test]
    fn no_file_means_no_events() {
        let (store, _dir) = store();
        assert_eq!(store.read("abc").expect("empty"), vec![]);
    }

    #[test]
    fn an_event_survives_a_restart() {
        let dir = tempfile::tempdir().expect("a temporary directory");
        record(&LogbookStore::new(dir.path()), "abc", Kind::Dropped);

        let after = LogbookStore::new(dir.path()).read("abc").expect("read");
        assert_eq!(after.len(), 1);
        assert_eq!(after[0].kind, Kind::Dropped);
    }

    #[test]
    fn hosts_do_not_share_a_file() {
        let (store, _dir) = store();
        record(&store, "a", Kind::Connected);
        record(&store, "b", Kind::Dropped);
        assert_eq!(store.read("a").expect("read")[0].kind, Kind::Connected);
        assert_eq!(store.read("b").expect("read")[0].kind, Kind::Dropped);
    }

    #[test]
    fn the_oldest_go_first_past_the_event_bound() {
        let (store, _dir) = store();
        for attempt in 0..(MAX_EVENTS as u32 + 20) {
            record(&store, "a", Kind::Reconnecting { attempt });
        }
        let events = store.read("a").expect("read");
        assert_eq!(events.len(), MAX_EVENTS);
        assert_eq!(events[0].kind, Kind::Reconnecting { attempt: 20 });
        assert_eq!(
            events[MAX_EVENTS - 1].kind,
            Kind::Reconnecting {
                attempt: MAX_EVENTS as u32 + 19
            }
        );
    }

    #[test]
    fn the_byte_bound_holds_too() {
        let (store, _dir) = store();
        for i in 0..400 {
            record(
                &store,
                "a",
                Kind::MacroRun {
                    name: format!("{i:0>80}"),
                    outcome: Outcome::Ran,
                    exit_status: Some(0),
                },
            );
        }
        let size = fs::metadata(store.path("a").expect("path"))
            .expect("file")
            .len();
        assert!(size as usize <= MAX_BYTES, "{size} bytes");
        assert!(!store.read("a").expect("read").is_empty());
    }

    #[test]
    fn a_long_string_is_cut() {
        let (store, _dir) = store();
        record(
            &store,
            "a",
            Kind::HostKeyTrusted {
                fingerprint: "x".repeat(500),
                replaced: false,
            },
        );
        let events = store.read("a").expect("read");
        match &events[0].kind {
            Kind::HostKeyTrusted { fingerprint, .. } => {
                assert_eq!(fingerprint.len(), MAX_FINGERPRINT)
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn an_id_that_could_leave_the_directory_is_refused() {
        let (store, dir) = store();
        for id in ["", "../x", "a/b", "a\\b", "a.b", &"x".repeat(65)] {
            assert!(store.read(id).is_err(), "{id:?} should be refused");
            assert!(store.append(id, Event::now(Kind::Dropped)).is_err());
            assert!(store.clear(id).is_err());
        }
        assert!(!dir.path().join("x.json").exists());
    }

    #[test]
    fn clearing_forgets_one_host_and_is_not_an_error_twice() {
        let (store, _dir) = store();
        record(&store, "a", Kind::Dropped);
        record(&store, "b", Kind::Dropped);
        store.clear("a").expect("clear");
        store.clear("a").expect("clear again");
        assert!(store.read("a").expect("read").is_empty());
        assert_eq!(store.read("b").expect("read").len(), 1);
    }

    #[test]
    fn a_corrupt_file_costs_that_host_its_history_and_not_its_future() {
        let (store, _dir) = store();
        record(&store, "a", Kind::Dropped);
        fs::write(store.path("a").expect("path"), "{ not json").expect("write");

        record(&store, "a", Kind::Reconnected);
        let events = store.read("a").expect("readable again");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].kind, Kind::Reconnected);
    }
}
