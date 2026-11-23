//! Logbook commands (ADR-0081).
//!
//! Three, and none of them takes text. Reading and clearing name a saved host.
//! Recording from the interface takes a closed set of events the core cannot
//! see for itself, a drop and the reconnect that follows it (ADR-0079 runs in
//! the webview), and nothing a person could type: the events the core records
//! itself, a login or a trusted key, are not on this list, so the webview
//! cannot write a line that claims one happened.

use serde::Deserialize;
use tauri::{AppHandle, Manager, Runtime};

use crate::config::logbook::{record, Event, Kind, LogbookStore};
use crate::config::sessions::SessionStore;
use crate::error::{Error, IpcError};

fn directory<R: Runtime>(app: &AppHandle<R>) -> Result<std::path::PathBuf, Error> {
    app.path()
        .app_config_dir()
        .map_err(|_| Error::ConfigDirUnavailable)
}

/// Which of the events the interface may report.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ReportedKind {
    Dropped,
    Reconnecting,
    Reconnected,
}

/// What the interface may record: the part of a connection's life only it sees.
///
/// A struct and not a tagged enum so that `deny_unknown_fields` holds: with an
/// internal tag serde ignores a stray field on a variant that carries none, and
/// a field that is ignored today is one somebody wires up tomorrow.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Reported {
    pub kind: ReportedKind,
    /// The attempt a reconnect is on, and only there.
    #[serde(default)]
    pub attempt: Option<u32>,
}

impl Reported {
    /// The event this stands for, or `None` when it does not make sense: a
    /// reconnect with no attempt, or an attempt on anything else.
    pub fn into_kind(self) -> Option<Kind> {
        match (self.kind, self.attempt) {
            (ReportedKind::Dropped, None) => Some(Kind::Dropped),
            (ReportedKind::Reconnected, None) => Some(Kind::Reconnected),
            (ReportedKind::Reconnecting, Some(attempt)) => Some(Kind::Reconnecting { attempt }),
            _ => None,
        }
    }
}

/// Only a host that is saved has a Logbook, so the file a webview-supplied id
/// names is always one this core already knows.
fn known<R: Runtime>(app: &AppHandle<R>, session_id: &str) -> Result<LogbookStore, Error> {
    let directory = directory(app)?;
    SessionStore::new(directory.clone())
        .load()?
        .find(session_id)
        .ok_or_else(|| Error::UnknownSession {
            id: session_id.to_owned(),
        })?;
    Ok(LogbookStore::new(directory))
}

#[tauri::command]
pub async fn read_logbook<R: Runtime>(
    app: AppHandle<R>,
    session_id: String,
) -> Result<Vec<Event>, IpcError> {
    Ok(known(&app, &session_id)?.read(&session_id)?)
}

#[tauri::command]
pub async fn clear_logbook<R: Runtime>(
    app: AppHandle<R>,
    session_id: String,
) -> Result<(), IpcError> {
    known(&app, &session_id)?.clear(&session_id)?;
    Ok(())
}

#[tauri::command]
pub async fn report_logbook<R: Runtime>(
    app: AppHandle<R>,
    session_id: String,
    event: Reported,
) -> Result<(), IpcError> {
    let kind = event.into_kind().ok_or(Error::MalformedInput)?;
    record(&known(&app, &session_id)?, &session_id, kind);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kind(json: &str) -> Option<Kind> {
        serde_json::from_str::<Reported>(json).ok()?.into_kind()
    }

    #[test]
    fn the_interface_can_report_a_drop_and_a_reconnect() {
        assert_eq!(kind(r#"{"kind":"dropped"}"#), Some(Kind::Dropped));
        assert_eq!(kind(r#"{"kind":"reconnected"}"#), Some(Kind::Reconnected));
        assert_eq!(
            kind(r#"{"kind":"reconnecting","attempt":2}"#),
            Some(Kind::Reconnecting { attempt: 2 })
        );
    }

    #[test]
    fn it_cannot_claim_what_the_core_records_itself() {
        for refused in [
            r#"{"kind":"connected"}"#,
            r#"{"kind":"hostKeyTrusted","fingerprint":"x","replaced":true}"#,
            r#"{"kind":"macroRun","name":"x","outcome":"ran","exitStatus":0}"#,
        ] {
            assert_eq!(kind(refused), None, "{refused}");
        }
    }

    #[test]
    fn it_cannot_carry_anything_extra() {
        assert_eq!(kind(r#"{"kind":"dropped","note":"free text"}"#), None);
        assert_eq!(kind(r#"{"kind":"dropped","attempt":1}"#), None);
        assert_eq!(kind(r#"{"kind":"reconnecting"}"#), None);
    }
}
