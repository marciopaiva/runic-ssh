//! Map workspace commands.
//!
//! Thin, the shape `commands::macros` has: resolve the stores, call into the
//! domain module, map the failure. ADR-0064.

use std::collections::HashSet;

use tauri::{AppHandle, Manager, Runtime};

use crate::config::sessions::SessionStore;
use crate::config::workspace::{prune, Workspace, WorkspaceStore};
use crate::error::{Error, IpcError};

fn stores<R: Runtime>(app: &AppHandle<R>) -> Result<(WorkspaceStore, SessionStore), Error> {
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|_| Error::ConfigDirUnavailable)?;

    Ok((
        WorkspaceStore::new(directory.clone()),
        SessionStore::new(directory),
    ))
}

/// Reads the map, with every component whose host left the book dropped.
///
/// The pruning happens here rather than in the store because it needs the
/// host book, and the store is deliberately ignorant of it: a component is a
/// reference, and only the reader can tell whether it still resolves.
#[tauri::command]
pub async fn load_workspace<R: Runtime>(app: AppHandle<R>) -> Result<Workspace, IpcError> {
    let (workspace, sessions) = stores(&app)?;
    let book = sessions.load()?;
    let known: HashSet<&str> = book
        .items
        .iter()
        .map(|session| session.id.as_str())
        .collect();

    Ok(prune(workspace.load()?, &known))
}

/// Replaces the map with what the frontend holds.
///
/// Whole-file on purpose: the map is one object the interface owns in memory,
/// and every drag would otherwise be its own command. What is refused is
/// refused before anything is written (`config::workspace::validate`).
#[tauri::command]
pub async fn save_workspace<R: Runtime>(
    app: AppHandle<R>,
    workspace: Workspace,
) -> Result<(), IpcError> {
    let (store, _) = stores(&app)?;
    store.save(&workspace)?;
    Ok(())
}
