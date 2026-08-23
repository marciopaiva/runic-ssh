//! Application settings on disk.
//!
//! Plain JSON in the platform configuration directory, holding nothing secret.
//! Credentials live in the OS keychain (ADR-0004); this file is readable by any
//! process running as the user, and it is written on the assumption that it is.
//!
//! Sessions will live here too, alongside settings, when they arrive.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::Error;

pub mod sessions;

pub const SETTINGS_FILE: &str = "settings.json";

/// Everything the application remembers between launches.
///
/// Every field is optional and defaults sensibly, so a settings file written by
/// an older build stays readable rather than failing the launch.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    /// The locale the user chose, or `None` to follow the operating system.
    pub locale: Option<String>,
    /// Whether to let the window manager draw the title bar.
    ///
    /// ADR-0005 turned decorations off so the tab strip could occupy the title
    /// area, and named this the escape hatch for a window manager it did not
    /// anticipate — one that leaves an undecorated window impossible to resize
    /// or move. Off by default, because the drawn chrome is the design.
    pub native_decorations: bool,
}

/// Reads and writes [`Settings`] under a directory the caller owns.
#[derive(Debug, Clone)]
pub struct SettingsStore {
    directory: PathBuf,
}

impl SettingsStore {
    pub fn new(directory: impl Into<PathBuf>) -> Self {
        Self {
            directory: directory.into(),
        }
    }

    pub fn path(&self) -> PathBuf {
        self.directory.join(SETTINGS_FILE)
    }

    /// Loads the settings, or the defaults when there is no file yet.
    ///
    /// A missing file is a first launch, not a failure. A malformed one *is* a
    /// failure: silently replacing it with defaults would throw away whatever
    /// the user had configured, without telling them.
    pub fn load(&self) -> Result<Settings, Error> {
        let path = self.path();

        let text = match fs::read_to_string(&path) {
            Ok(text) => text,
            Err(source) if source.kind() == std::io::ErrorKind::NotFound => {
                return Ok(Settings::default())
            }
            Err(source) => return Err(Error::SettingsUnreadable { path, source }),
        };

        serde_json::from_str(&text).map_err(|source| Error::SettingsMalformed { path, source })
    }

    /// Writes the settings, creating the directory if this is a first launch.
    ///
    /// Written to a temporary file and renamed into place: a crash midway
    /// through leaves the previous settings intact rather than a truncated file
    /// that fails to parse on the next launch.
    pub fn save(&self, settings: &Settings) -> Result<(), Error> {
        let path = self.path();

        fs::create_dir_all(&self.directory).map_err(|source| Error::SettingsUnwritable {
            path: self.directory.clone(),
            source,
        })?;

        let json =
            serde_json::to_string_pretty(settings).map_err(|source| Error::SettingsMalformed {
                path: path.clone(),
                source,
            })?;

        let temporary = self.directory.join(format!("{SETTINGS_FILE}.tmp"));
        write_then_rename(&temporary, &path, &json)
    }
}

fn write_then_rename(temporary: &Path, final_path: &Path, contents: &str) -> Result<(), Error> {
    fs::write(temporary, contents).map_err(|source| Error::SettingsUnwritable {
        path: temporary.to_path_buf(),
        source,
    })?;

    fs::rename(temporary, final_path).map_err(|source| Error::SettingsUnwritable {
        path: final_path.to_path_buf(),
        source,
    })
}

/// Rejects a locale tag before it reaches the settings file.
///
/// The core does not know which locales the interface offers — that list lives
/// with the catalogues — so this only refuses what could never be a tag. The
/// point is that a settings file cannot be made to hold arbitrary text through
/// a command.
pub fn validate_locale(tag: &str) -> Result<(), Error> {
    let acceptable = !tag.is_empty()
        && tag.len() <= 35
        && tag.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
        && tag.chars().next().is_some_and(|c| c.is_ascii_alphabetic());

    if acceptable {
        Ok(())
    } else {
        Err(Error::InvalidLocale {
            requested: tag.to_owned(),
        })
    }
}

/// Stores the chosen locale, or clears it to follow the system again.
///
/// The command handler is a two-line adapter over this, so the paths worth
/// testing — a refused tag, a directory that cannot be written — are reachable
/// without a webview or an app handle.
pub fn apply_locale(store: &SettingsStore, locale: Option<String>) -> Result<Settings, Error> {
    if let Some(tag) = locale.as_deref() {
        validate_locale(tag)?;
    }

    let mut settings = store.load()?;
    settings.locale = locale;
    store.save(&settings)?;

    Ok(settings)
}

/// Stores whether the window manager should draw the title bar.
///
/// Separate from [`apply_locale`] rather than a general setter, so the two
/// settings that exist cannot be written by one call that takes a whole
/// `Settings` — which is how a locale gets reset by a caller that only meant
/// to change the chrome.
pub fn apply_native_decorations(store: &SettingsStore, native: bool) -> Result<Settings, Error> {
    let mut settings = store.load()?;
    settings.native_decorations = native;
    store.save(&settings)?;

    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> (SettingsStore, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("a temporary directory");
        (SettingsStore::new(dir.path()), dir)
    }

    #[test]
    fn a_missing_file_is_a_first_launch_not_a_failure() {
        let (store, _dir) = store();
        assert_eq!(store.load().expect("defaults"), Settings::default());
    }

    #[test]
    fn settings_survive_a_round_trip() {
        let (store, _dir) = store();
        let settings = Settings {
            locale: Some("pt-BR".to_owned()),
            native_decorations: true,
        };

        store.save(&settings).expect("save");
        assert_eq!(store.load().expect("load"), settings);
    }

    #[test]
    fn saving_creates_the_directory() {
        let dir = tempfile::tempdir().expect("a temporary directory");
        let nested = dir.path().join("does").join("not").join("exist");
        let store = SettingsStore::new(&nested);

        store.save(&Settings::default()).expect("save");
        assert!(store.path().exists());
    }

    #[test]
    fn a_malformed_file_fails_rather_than_resetting_the_user() {
        let (store, _dir) = store();
        fs::write(store.path(), "{ not json").expect("write");

        assert!(matches!(store.load(), Err(Error::SettingsMalformed { .. })));
    }

    #[test]
    fn an_unknown_field_does_not_break_an_older_file() {
        let (store, _dir) = store();
        fs::write(store.path(), r#"{"locale":"es","somethingNewer":true}"#).expect("write");

        assert_eq!(store.load().expect("load").locale.as_deref(), Some("es"));
    }

    #[test]
    fn a_plausible_tag_is_accepted() {
        for tag in ["en", "pt-BR", "es", "zh-Hant-TW"] {
            assert!(validate_locale(tag).is_ok(), "{tag} should be accepted");
        }
    }

    #[test]
    fn junk_never_reaches_the_settings_file() {
        for tag in ["", "../../etc/passwd", "en_US", "9x", &"a".repeat(64)] {
            assert!(
                matches!(validate_locale(tag), Err(Error::InvalidLocale { .. })),
                "{tag:?} should be refused"
            );
        }
    }

    #[test]
    fn applying_a_locale_stores_it() {
        let (store, _dir) = store();
        let settings = apply_locale(&store, Some("pt-BR".to_owned())).expect("apply");

        assert_eq!(settings.locale.as_deref(), Some("pt-BR"));
        assert_eq!(store.load().expect("load"), settings);
    }

    #[test]
    fn clearing_the_locale_returns_to_following_the_system() {
        let (store, _dir) = store();
        apply_locale(&store, Some("es".to_owned())).expect("apply");

        assert_eq!(apply_locale(&store, None).expect("clear").locale, None);
    }

    #[test]
    fn a_refused_tag_never_touches_the_file() {
        let (store, _dir) = store();
        apply_locale(&store, Some("en".to_owned())).expect("apply");

        let refused = apply_locale(&store, Some("../../etc/passwd".to_owned()));

        assert!(matches!(refused, Err(Error::InvalidLocale { .. })));
        /* The previous choice has to survive a rejected one. */
        assert_eq!(store.load().expect("load").locale.as_deref(), Some("en"));
    }

    #[test]
    fn a_malformed_file_surfaces_rather_than_being_overwritten() {
        let (store, _dir) = store();
        fs::write(store.path(), "{ not json").expect("write");

        assert!(matches!(
            apply_locale(&store, Some("en".to_owned())),
            Err(Error::SettingsMalformed { .. })
        ));
    }

    #[test]
    fn the_settings_file_holds_nothing_secret() {
        /* Guards the shape rather than the values: if a field is ever added
        here that looks like a credential, this fails and forces the
        conversation the security model asks for. */
        let json = serde_json::to_string(&Settings {
            locale: Some("en".to_owned()),
            native_decorations: false,
        })
        .expect("serialize");

        for forbidden in ["password", "passphrase", "secret", "token", "privateKey"] {
            assert!(
                !json.contains(forbidden),
                "settings.json must not carry {forbidden}"
            );
        }
    }
}

#[cfg(test)]
mod decoration_tests {
    use super::*;

    fn store() -> (SettingsStore, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("temp dir");
        (SettingsStore::new(dir.path()), dir)
    }

    #[test]
    fn the_drawn_chrome_is_the_default() {
        /* ADR-0005 chose the drawn title bar and this is the escape hatch from
        it, not a preference with two equal sides. A default of `true` would
        quietly undo the decision for every user who never opens a setting. */
        assert!(!Settings::default().native_decorations);
    }

    #[test]
    fn a_settings_file_written_before_this_field_existed_still_loads() {
        /* The forward-compatible half is already tested; this is the backward
        one. Every shipped settings.json predates this field, so a load that
        needed it would fail on launch for everyone who has ever run the app. */
        let (store, _dir) = store();
        fs::write(store.path(), r#"{"locale":"pt-BR"}"#).expect("write");

        let settings = store.load().expect("an older file must still load");
        assert_eq!(settings.locale.as_deref(), Some("pt-BR"));
        assert!(!settings.native_decorations);
    }

    #[test]
    fn setting_the_chrome_leaves_the_locale_alone() {
        /* Two settings in one file, written by two different commands. The
        failure this guards is silent: the user's language reverts, and the
        only clue is that it happened when they touched an unrelated toggle. */
        let (store, _dir) = store();
        apply_locale(&store, Some("es".to_owned())).expect("locale");

        let settings = apply_native_decorations(&store, true).expect("decorations");
        assert!(settings.native_decorations);
        assert_eq!(settings.locale.as_deref(), Some("es"));

        assert_eq!(store.load().expect("reload"), settings, "not persisted");
    }

    #[test]
    fn the_hatch_closes_again() {
        let (store, _dir) = store();
        apply_native_decorations(&store, true).expect("on");

        let settings = apply_native_decorations(&store, false).expect("off");
        assert!(!settings.native_decorations);
    }
}
