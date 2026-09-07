//! Saved macros: a name and a block of text sent to a terminal as though
//! typed.
//!
//! Nothing here is a secret, and nothing here is validated for what it
//! contains beyond being present: the text is exactly what `send_input`
//! already accepts from a human at the keyboard, sent by a person who is
//! already looking at the terminal it lands in. What is checked is only
//! what keeps the file itself honest — a name, and a name a screen can
//! render back without it lying about what it says.

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::error::Error;

use super::is_deceptive;

pub const MACROS_FILE: &str = "macros.json";

/// How long a macro's saved text may be.
///
/// Generous for a snippet, small next to an actual paste: a macro is meant
/// to be a command or a short block reused often, not a script pasted in
/// through the back door of a feature that has no size limit of its own.
const MAX_TEXT_LEN: usize = 4000;

const MAX_NAME_LEN: usize = 80;

/// A saved macro.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Macro {
    /// Stable across renames, so the palette entry it appears as keeps its
    /// own identity while the name changes.
    pub id: String,
    pub name: String,
    /// Sent to the terminal exactly as saved, byte for byte: whether it ends
    /// in a newline (and so runs as a command) or not (and so waits for one)
    /// is entirely up to what was saved, the same way it already is for a
    /// paste.
    pub text: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Macros {
    pub items: Vec<Macro>,
}

impl Macros {
    pub fn find(&self, id: &str) -> Option<&Macro> {
        self.items.iter().find(|macro_| macro_.id == id)
    }

    fn position(&self, id: &str) -> Option<usize> {
        self.items.iter().position(|macro_| macro_.id == id)
    }
}

/// What the interface sends when saving.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MacroDraft {
    /// Absent when creating. Present when editing the macro it names.
    #[serde(default)]
    pub id: Option<String>,
    pub name: String,
    pub text: String,
}

/// Refuses a draft the macros file should never be made to hold.
pub fn validate_draft(draft: &MacroDraft) -> Result<(), Error> {
    let trimmed_name = draft.name.trim();
    if trimmed_name.is_empty() || trimmed_name.len() > MAX_NAME_LEN {
        return Err(Error::InvalidMacro {
            field: "name".to_owned(),
        });
    }
    if trimmed_name.chars().any(is_deceptive) {
        return Err(Error::InvalidMacro {
            field: "name".to_owned(),
        });
    }

    /* The text is not trimmed for this check: a macro made of nothing but
    whitespace is empty in every way that matters, but a real one keeps
    whatever leading or trailing whitespace it was saved with, including a
    trailing newline that is the whole reason it runs as a command. */
    if draft.text.trim().is_empty() || draft.text.len() > MAX_TEXT_LEN {
        return Err(Error::InvalidMacro {
            field: "text".to_owned(),
        });
    }

    Ok(())
}

/// Reads and writes [`Macros`] under a directory the caller owns.
#[derive(Debug, Clone)]
pub struct MacroStore {
    directory: PathBuf,
}

impl MacroStore {
    pub fn new(directory: impl Into<PathBuf>) -> Self {
        Self {
            directory: directory.into(),
        }
    }

    pub fn path(&self) -> PathBuf {
        self.directory.join(MACROS_FILE)
    }

    /// Loads the macros, or none at all when there is no file yet.
    pub fn load(&self) -> Result<Macros, Error> {
        let path = self.path();

        let text = match fs::read_to_string(&path) {
            Ok(text) => text,
            Err(source) if source.kind() == std::io::ErrorKind::NotFound => {
                return Ok(Macros::default())
            }
            Err(source) => return Err(Error::SettingsUnreadable { path, source }),
        };

        serde_json::from_str(&text).map_err(|source| Error::SettingsMalformed { path, source })
    }

    pub fn save(&self, macros: &Macros) -> Result<(), Error> {
        let path = self.path();

        fs::create_dir_all(&self.directory).map_err(|source| Error::SettingsUnwritable {
            path: self.directory.clone(),
            source,
        })?;

        let json =
            serde_json::to_string_pretty(macros).map_err(|source| Error::SettingsMalformed {
                path: path.clone(),
                source,
            })?;

        let temporary = self.directory.join(format!("{MACROS_FILE}.tmp"));
        fs::write(&temporary, json).map_err(|source| Error::SettingsUnwritable {
            path: temporary.clone(),
            source,
        })?;

        fs::rename(&temporary, &path).map_err(|source| Error::SettingsUnwritable { path, source })
    }
}

/// A macro id that is stable, opaque, and unique within the file. Same
/// scheme as [`super::sessions::save_session`]'s own `new_id`.
fn new_id(macros: &Macros, draft: &MacroDraft) -> String {
    use sha2::{Digest, Sha256};

    for attempt in 0..64_u32 {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|since| since.as_nanos())
            .unwrap_or_default();

        let mut hasher = Sha256::new();
        hasher.update(nanos.to_le_bytes());
        hasher.update(attempt.to_le_bytes());
        hasher.update(macros.items.len().to_le_bytes());
        hasher.update(draft.name.as_bytes());

        let candidate: String = hasher
            .finalize()
            .iter()
            .take(8)
            .map(|byte| format!("{byte:02x}"))
            .collect();

        if macros.find(&candidate).is_none() {
            return candidate;
        }
    }

    format!("{}-{}", macros.items.len(), draft.name)
}

/// Creates a macro, or replaces the one the draft names.
pub fn save_macro(store: &MacroStore, draft: MacroDraft) -> Result<Macro, Error> {
    validate_draft(&draft)?;

    let mut macros = store.load()?;

    let saved = match draft.id {
        Some(id) => {
            let index = macros
                .position(&id)
                .ok_or_else(|| Error::UnknownMacro { id: id.clone() })?;

            let saved = Macro {
                id,
                name: draft.name.trim().to_owned(),
                text: draft.text,
            };
            macros.items[index] = saved.clone();
            saved
        }
        None => {
            let saved = Macro {
                id: new_id(&macros, &draft),
                name: draft.name.trim().to_owned(),
                text: draft.text,
            };
            macros.items.push(saved.clone());
            saved
        }
    };

    store.save(&macros)?;
    Ok(saved)
}

/// Forgets a macro.
pub fn delete_macro(store: &MacroStore, id: &str) -> Result<(), Error> {
    let mut macros = store.load()?;

    let index = macros
        .position(id)
        .ok_or_else(|| Error::UnknownMacro { id: id.to_owned() })?;

    macros.items.remove(index);
    store.save(&macros)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> (MacroStore, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("a temporary directory");
        (MacroStore::new(dir.path()), dir)
    }

    fn draft(name: &str) -> MacroDraft {
        MacroDraft {
            id: None,
            name: name.to_owned(),
            text: format!("systemctl status {name}\n"),
        }
    }

    #[test]
    fn no_file_means_no_macros_yet() {
        let (store, _dir) = store();
        assert_eq!(store.load().expect("defaults"), Macros::default());
    }

    #[test]
    fn a_malformed_file_is_not_an_empty_list() {
        let (store, _dir) = store();
        fs::write(store.path(), "{ not json").expect("write");

        assert!(matches!(store.load(), Err(Error::SettingsMalformed { .. })));
    }

    #[test]
    fn a_macro_survives_a_restart() {
        let dir = tempfile::tempdir().expect("a temporary directory");
        let saved = save_macro(&MacroStore::new(dir.path()), draft("nginx")).expect("save");

        let after_restart = MacroStore::new(dir.path()).load().expect("load");
        assert_eq!(after_restart.find(&saved.id), Some(&saved));
    }

    #[test]
    fn the_core_assigns_the_id_not_the_caller() {
        let (store, _dir) = store();
        let saved = save_macro(&store, draft("nginx")).expect("save");

        assert_eq!(saved.id.len(), 16, "expected a short opaque hex id");
    }

    #[test]
    fn two_macros_never_share_an_id() {
        let (store, _dir) = store();
        let mut ids = std::collections::BTreeSet::new();

        for i in 0..50 {
            let saved = save_macro(&store, draft(&format!("macro-{i}"))).expect("save");
            assert!(ids.insert(saved.id.clone()), "id {} was reused", saved.id);
        }
    }

    #[test]
    fn editing_replaces_the_macro_it_names() {
        let (store, _dir) = store();
        let created = save_macro(&store, draft("nginx")).expect("save");

        let edited = save_macro(
            &store,
            MacroDraft {
                id: Some(created.id.clone()),
                name: "nginx status".to_owned(),
                text: "systemctl status nginx\n".to_owned(),
            },
        )
        .expect("edit");

        assert_eq!(edited.id, created.id);
        assert_eq!(edited.name, "nginx status");

        let macros = store.load().expect("load");
        assert_eq!(
            macros.items.len(),
            1,
            "editing must not create a second row"
        );
    }

    #[test]
    fn editing_something_that_is_not_there_is_refused() {
        let (store, _dir) = store();

        let missing = save_macro(
            &store,
            MacroDraft {
                id: Some("nope".to_owned()),
                ..draft("nginx")
            },
        );

        assert!(matches!(missing, Err(Error::UnknownMacro { .. })));
    }

    #[test]
    fn a_deleted_macro_stays_deleted() {
        let dir = tempfile::tempdir().expect("a temporary directory");
        let store = MacroStore::new(dir.path());
        let saved = save_macro(&store, draft("nginx")).expect("save");

        delete_macro(&store, &saved.id).expect("delete");

        assert!(MacroStore::new(dir.path())
            .load()
            .expect("load")
            .find(&saved.id)
            .is_none());
    }

    #[test]
    fn deleting_something_that_is_not_there_is_refused() {
        let (store, _dir) = store();
        assert!(matches!(
            delete_macro(&store, "nope"),
            Err(Error::UnknownMacro { .. })
        ));
    }

    #[test]
    fn a_draft_missing_something_is_refused_by_name() {
        let (store, _dir) = store();

        let cases = [
            (
                "name",
                MacroDraft {
                    name: "  ".to_owned(),
                    ..draft("x")
                },
            ),
            (
                "text",
                MacroDraft {
                    text: "   \n  ".to_owned(),
                    ..draft("x")
                },
            ),
        ];

        for (expected, bad) in cases {
            match save_macro(&store, bad) {
                Err(Error::InvalidMacro { field }) => assert_eq!(field, expected),
                other => panic!("expected {expected} to be refused, got {other:?}"),
            }
        }
    }

    #[test]
    fn a_control_character_never_reaches_a_macro_name() {
        let (store, _dir) = store();

        for deceptive in [
            '\u{202e}', '\u{200f}', '\u{2066}', '\u{200b}', '\u{feff}', '\u{0007}',
        ] {
            let sneaky = MacroDraft {
                name: format!("macro{deceptive}x"),
                ..draft("x")
            };
            assert!(
                matches!(save_macro(&store, sneaky), Err(Error::InvalidMacro { .. })),
                "U+{:04X} was accepted into a macro name",
                deceptive as u32
            );
        }
    }

    #[test]
    fn whitespace_is_trimmed_from_the_name_but_not_from_the_text() {
        let (store, _dir) = store();
        let saved = save_macro(
            &store,
            MacroDraft {
                id: None,
                name: "  nginx  ".to_owned(),
                text: "systemctl status nginx\n".to_owned(),
            },
        )
        .expect("save");

        assert_eq!(saved.name, "nginx");
        assert_eq!(saved.text, "systemctl status nginx\n");
    }

    #[test]
    fn a_text_over_the_limit_is_refused() {
        let (store, _dir) = store();
        let oversized = MacroDraft {
            text: "a".repeat(MAX_TEXT_LEN + 1),
            ..draft("x")
        };

        assert!(matches!(
            save_macro(&store, oversized),
            Err(Error::InvalidMacro { field }) if field == "text"
        ));
    }

    #[test]
    fn the_file_survives_a_round_trip() {
        let (store, _dir) = store();
        let macros = Macros {
            items: vec![
                Macro {
                    id: "a".to_owned(),
                    name: "nginx".to_owned(),
                    text: "systemctl status nginx\n".to_owned(),
                },
                Macro {
                    id: "b".to_owned(),
                    name: "disk".to_owned(),
                    text: "df -h".to_owned(),
                },
            ],
        };

        store.save(&macros).expect("save");
        assert_eq!(store.load().expect("load"), macros);
    }
}
