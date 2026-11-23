//! Running a saved script macro on several connected hosts (ADR-0078).
//!
//! Thin, like the rest: resolve the macro and the sessions, hand each host its
//! command, collect what came back. The IPC surface carries a macro id and
//! session handles, never command text, which is what keeps this from being a
//! way for the webview to hand the core a string it just made up.

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime, State};
use tokio::task::JoinSet;

use crate::config::logbook::{record, Kind, LogbookStore, Outcome};
use crate::config::macros::{MacroKind, MacroStore};
use crate::config::sessions::SessionStore;
use crate::error::{Error, IpcError};
use crate::ssh::fleet::{build_command, HostVariables, HOST_DEADLINE, MAX_STREAM_BYTES};
use crate::ssh::registry::{Registry, SessionHandle};

/// More hosts than a person reads at a glance, and fewer than a mistake could
/// reach by accident.
const MAX_TARGETS: usize = 64;

/// What one host answered, in the shape the frontend groups on.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum FleetStatus {
    #[serde(rename_all = "camelCase")]
    Ran {
        stdout: String,
        stderr: String,
        exit_status: Option<u32>,
        truncated: bool,
        timed_out: bool,
    },
    /// The session closed, its saved record is gone, or the channel could not
    /// be opened. The three are not told apart: none of them has anything to
    /// compare.
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FleetResult {
    pub handle: SessionHandle,
    #[serde(flatten)]
    pub status: FleetStatus,
}

/// Text from a host, made safe to carry as a string. The frontend still
/// escapes control characters before drawing it.
fn text_of(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).into_owned()
}

async fn run_fleet(
    registry: &Registry,
    macros: &MacroStore,
    sessions: &SessionStore,
    macro_id: &str,
    handles: Vec<SessionHandle>,
) -> Result<Vec<FleetResult>, Error> {
    if handles.is_empty() || handles.len() > MAX_TARGETS {
        return Err(Error::MalformedInput);
    }

    let loaded = macros.load()?;
    let found = loaded.find(macro_id).ok_or_else(|| Error::UnknownMacro {
        id: macro_id.to_owned(),
    })?;
    if found.kind != MacroKind::Script {
        return Err(Error::MacroNotScript {
            id: macro_id.to_owned(),
        });
    }
    let text = found.text.clone();
    let saved = sessions.load()?;

    let mut order = Vec::with_capacity(handles.len());
    let mut running = JoinSet::new();

    for handle in handles {
        if order.contains(&handle) {
            continue;
        }
        order.push(handle);

        let Some(shared) = registry.shared(handle).await else {
            continue;
        };
        let Some(session_id) = registry.session_of(handle).await else {
            continue;
        };
        let Some(session) = saved.find(&session_id) else {
            continue;
        };

        let command = build_command(
            &text,
            &HostVariables {
                host: &session.host,
                port: session.port,
                user: &session.user,
            },
        );

        running.spawn(async move {
            let held = shared.lock().await;
            let status = match held.as_ref() {
                None => FleetStatus::Failed,
                Some(connection) => match connection
                    .run_bounded(&command, MAX_STREAM_BYTES, HOST_DEADLINE)
                    .await
                {
                    Ok(output) => FleetStatus::Ran {
                        stdout: text_of(&output.stdout),
                        stderr: text_of(&output.stderr),
                        exit_status: output.exit_status,
                        truncated: output.truncated,
                        timed_out: output.timed_out,
                    },
                    Err(_) => FleetStatus::Failed,
                },
            };
            (handle, status)
        });
    }

    let mut answered = std::collections::HashMap::new();
    while let Some(joined) = running.join_next().await {
        if let Ok((handle, status)) = joined {
            answered.insert(handle, status);
        }
    }

    Ok(order
        .into_iter()
        .map(|handle| FleetResult {
            handle,
            status: answered.remove(&handle).unwrap_or(FleetStatus::Failed),
        })
        .collect())
}

fn directory<R: Runtime>(app: &AppHandle<R>) -> Result<std::path::PathBuf, Error> {
    app.path()
        .app_config_dir()
        .map_err(|_| Error::ConfigDirUnavailable)
}

/// Runs the saved script macro `macro_id` on each connected session in
/// `handles` and returns one result per handle, in the order given.
#[tauri::command]
pub async fn fleet_run<R: Runtime>(
    app: AppHandle<R>,
    registry: State<'_, Registry>,
    macro_id: String,
    handles: Vec<SessionHandle>,
) -> Result<Vec<FleetResult>, IpcError> {
    let directory = directory(&app)?;
    let macros = MacroStore::new(directory.clone());
    let sessions = SessionStore::new(directory.clone());

    /* Which host each handle is, asked before the run: a session that closes
    during it is still the host the run was started on. */
    let mut hosts = std::collections::HashMap::new();
    for handle in &handles {
        if let Some(id) = registry.session_of(*handle).await {
            hosts.insert(*handle, id);
        }
    }

    let results = run_fleet(&registry, &macros, &sessions, &macro_id, handles).await?;

    /* One line in each host's Logbook. The macro's name and how it ended, never
    what it printed. Best effort: see `config::logbook`. */
    if let Some(name) = macros
        .load()
        .ok()
        .and_then(|all| all.find(&macro_id).map(|m| m.name.clone()))
    {
        let logbook = LogbookStore::new(directory);
        for result in &results {
            let Some(id) = hosts.get(&result.handle) else {
                continue;
            };
            let (outcome, exit_status) = match &result.status {
                FleetStatus::Ran {
                    timed_out: true, ..
                } => (Outcome::TimedOut, None),
                FleetStatus::Ran { exit_status, .. } => (Outcome::Ran, *exit_status),
                FleetStatus::Failed => (Outcome::Failed, None),
            };
            record(
                &logbook,
                id,
                Kind::MacroRun {
                    name: name.clone(),
                    outcome,
                    exit_status,
                },
            );
        }
    }

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::macros::{save_macro, MacroDraft};

    fn stores() -> (MacroStore, SessionStore, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("a temporary directory");
        (
            MacroStore::new(dir.path()),
            SessionStore::new(dir.path()),
            dir,
        )
    }

    fn handle(n: u64) -> SessionHandle {
        serde_json::from_str(&n.to_string()).expect("deserializes")
    }

    fn draft(kind: MacroKind) -> MacroDraft {
        MacroDraft {
            id: None,
            name: "check".to_owned(),
            kind,
            text: "uname -r".to_owned(),
        }
    }

    #[tokio::test]
    async fn an_unknown_macro_is_refused_before_any_host_is_touched() {
        let (macros, sessions, _dir) = stores();

        let result = run_fleet(
            &Registry::new(),
            &macros,
            &sessions,
            "nope",
            vec![handle(1)],
        )
        .await;

        assert!(matches!(result, Err(Error::UnknownMacro { .. })));
    }

    #[tokio::test]
    async fn a_sequential_macro_is_refused() {
        let (macros, sessions, _dir) = stores();
        let saved = save_macro(&macros, draft(MacroKind::Sequential)).expect("saves");

        let result = run_fleet(
            &Registry::new(),
            &macros,
            &sessions,
            &saved.id,
            vec![handle(1)],
        )
        .await;

        assert!(matches!(result, Err(Error::MacroNotScript { .. })));
    }

    #[tokio::test]
    async fn no_targets_and_too_many_targets_are_refused() {
        let (macros, sessions, _dir) = stores();
        let saved = save_macro(&macros, draft(MacroKind::Script)).expect("saves");

        let none = run_fleet(&Registry::new(), &macros, &sessions, &saved.id, vec![]).await;
        let many = run_fleet(
            &Registry::new(),
            &macros,
            &sessions,
            &saved.id,
            (0..=MAX_TARGETS as u64).map(handle).collect(),
        )
        .await;

        assert!(matches!(none, Err(Error::MalformedInput)));
        assert!(matches!(many, Err(Error::MalformedInput)));
    }

    #[tokio::test]
    async fn a_handle_that_is_not_open_comes_back_failed_rather_than_failing_the_run() {
        let (macros, sessions, _dir) = stores();
        let saved = save_macro(&macros, draft(MacroKind::Script)).expect("saves");

        let results = run_fleet(
            &Registry::new(),
            &macros,
            &sessions,
            &saved.id,
            vec![handle(7), handle(7), handle(8)],
        )
        .await
        .expect("the run itself succeeds");

        assert_eq!(results.len(), 2, "a repeated handle runs once");
        assert!(results.iter().all(|r| r.status == FleetStatus::Failed));
    }
}
