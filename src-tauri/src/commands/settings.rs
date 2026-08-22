//! Settings commands.

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

use crate::config::{apply_locale, Settings, SettingsStore};
use crate::error::{Error, IpcError};

/// What the frontend needs to decide which language to render in.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    /// The locale the user chose, or `null` to follow the operating system.
    pub locale: Option<String>,
}

impl From<Settings> for SettingsView {
    fn from(settings: Settings) -> Self {
        Self {
            locale: settings.locale,
        }
    }
}

fn store<R: Runtime>(app: &AppHandle<R>) -> Result<SettingsStore, Error> {
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|_| Error::ConfigDirUnavailable)?;

    Ok(SettingsStore::new(directory))
}

/// Reads the stored settings, or the defaults on a first launch.
#[tauri::command]
pub async fn get_settings<R: Runtime>(app: AppHandle<R>) -> Result<SettingsView, IpcError> {
    let settings = store(&app)?.load()?;
    Ok(settings.into())
}

/// Stores the language the user chose, or clears it to follow the system again.
#[tauri::command]
pub async fn set_locale<R: Runtime>(
    app: AppHandle<R>,
    locale: Option<String>,
) -> Result<SettingsView, IpcError> {
    let settings = apply_locale(&store(&app)?, locale)?;
    Ok(settings.into())
}
