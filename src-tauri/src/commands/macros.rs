//! Macro commands.
//!
//! Thin by design, the same shape `commands::sessions` already has: each
//! handler resolves the store, calls into the domain module, and maps the
//! failure.

use tauri::{AppHandle, Manager, Runtime};

use crate::config::macros::{
    delete_macro as remove_macro, save_macro as store_macro, Macro, MacroDraft, MacroStore,
};
use crate::error::{Error, IpcError};

fn store<R: Runtime>(app: &AppHandle<R>) -> Result<MacroStore, Error> {
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|_| Error::ConfigDirUnavailable)?;

    Ok(MacroStore::new(directory))
}

#[tauri::command]
pub async fn list_macros<R: Runtime>(app: AppHandle<R>) -> Result<Vec<Macro>, IpcError> {
    let macros = store(&app)?.load()?;
    Ok(macros.items)
}

/// Creates a macro, or replaces the one the draft names.
#[tauri::command]
pub async fn save_macro<R: Runtime>(
    app: AppHandle<R>,
    draft: MacroDraft,
) -> Result<Macro, IpcError> {
    Ok(store_macro(&store(&app)?, draft)?)
}

#[tauri::command]
pub async fn delete_macro<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), IpcError> {
    remove_macro(&store(&app)?, &id)?;
    Ok(())
}
