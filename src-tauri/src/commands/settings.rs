//! Settings commands.

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

use crate::config::{apply_locale, apply_theme, Settings, SettingsStore, Theme};
use crate::error::{Error, IpcError};

/// What the frontend needs to decide which language to render in.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    /// The locale the user chose, or `null` to follow the operating system.
    pub locale: Option<String>,
    /// Whether the window manager draws the title bar (ADR-0005's escape hatch).
    pub native_decorations: bool,
    /// Which palette to paint, or `"system"` to follow the desktop.
    pub theme: Theme,
}

impl From<Settings> for SettingsView {
    fn from(settings: Settings) -> Self {
        Self {
            locale: settings.locale,
            native_decorations: settings.native_decorations,
            theme: settings.theme,
        }
    }
}

/// The settings store for this application's config directory.
///
/// `pub(crate)` because the chrome command needs it too: which title area the
/// window is in is now partly the user's choice, and that choice lives here.
pub(crate) fn store<R: Runtime>(app: &AppHandle<R>) -> Result<SettingsStore, Error> {
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

/// Stores which palette to paint.
///
/// The value arrives typed: a name the core does not know is refused by the
/// deserializer before this runs, so there is no validation here to forget.
/// That is the difference from `set_locale`, whose tag the core cannot check
/// against a list it does not have.
#[tauri::command]
pub async fn set_theme<R: Runtime>(
    app: AppHandle<R>,
    theme: Theme,
) -> Result<SettingsView, IpcError> {
    let settings = apply_theme(&store(&app)?, theme)?;
    Ok(settings.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_view_is_what_the_frontend_declares() {
        /* Pinned as a literal on both sides: `tests/ipc-contract.test.ts` holds
        this same string. A field renamed on one side and not the other is a
        setting that silently stops arriving, which is not a compile error
        anywhere. */
        let json =
            serde_json::to_string(&SettingsView::from(Settings::default())).expect("serialize");

        assert_eq!(
            json,
            r#"{"locale":null,"nativeDecorations":false,"theme":"system"}"#
        );
    }
}
