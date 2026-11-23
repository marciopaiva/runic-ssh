//! Space commands.
//!
//! Thin by design, the same shape `commands::macros` has: each handler
//! resolves the store, calls into the domain module, and maps the failure.

use tauri::{AppHandle, Manager, Runtime};

use crate::config::spaces::{
    delete_space as remove_space, reorder_spaces as order_spaces, save_space as store_space, Space,
    SpaceDraft, SpaceStore,
};
use crate::error::{Error, IpcError};

fn store<R: Runtime>(app: &AppHandle<R>) -> Result<SpaceStore, Error> {
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|_| Error::ConfigDirUnavailable)?;

    Ok(SpaceStore::new(directory))
}

#[tauri::command]
pub async fn list_spaces<R: Runtime>(app: AppHandle<R>) -> Result<Vec<Space>, IpcError> {
    Ok(store(&app)?.load()?.items)
}

/// Creates a Space, or replaces the one the draft names.
#[tauri::command]
pub async fn save_space<R: Runtime>(
    app: AppHandle<R>,
    draft: SpaceDraft,
) -> Result<Space, IpcError> {
    Ok(store_space(&store(&app)?, draft)?)
}

#[tauri::command]
pub async fn delete_space<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), IpcError> {
    remove_space(&store(&app)?, &id)?;
    Ok(())
}

/// Puts the Spaces in the order given, which must be every saved id once.
#[tauri::command]
pub async fn reorder_spaces<R: Runtime>(
    app: AppHandle<R>,
    order: Vec<String>,
) -> Result<Vec<Space>, IpcError> {
    Ok(order_spaces(&store(&app)?, &order)?)
}
