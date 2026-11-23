//! Spaces: the environments a host can belong to (ADR-0081).
//!
//! A Space is a name and a weight. Its position in the file is its order, so
//! there is no second field to keep in step with it. A host names its Space
//! with an optional `space` id, and a host with none, or with an id that no
//! longer names anything, is in the default Space. That is what makes this
//! additive: a `sessions.json` written before Spaces loads unchanged.
//!
//! Nothing here is a secret. The weight is a guard against a slip, not a
//! security control (ADR-0081): it changes what the interface asks before a
//! command reaches several hosts, and enforces nothing in the core.

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::error::Error;

use super::is_deceptive;

pub const SPACES_FILE: &str = "spaces.json";

const MAX_NAME_LEN: usize = 40;

/// More than this is a list nobody switches through, and bounds the file.
const MAX_SPACES: usize = 32;

/// How much care a Space asks for.
///
/// Two values on purpose. Named levels are the open question in
/// `docs/plans/spaces.md`, and a switch can grow into levels without moving
/// anything already stored.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SpaceWeight {
    #[default]
    Normal,
    Production,
}

/// A saved Space.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Space {
    /// Stable across renames, so a host's `space` stays valid.
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub weight: SpaceWeight,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Spaces {
    pub items: Vec<Space>,
}

impl Spaces {
    pub fn find(&self, id: &str) -> Option<&Space> {
        self.items.iter().find(|space| space.id == id)
    }

    fn position(&self, id: &str) -> Option<usize> {
        self.items.iter().position(|space| space.id == id)
    }
}

/// What the interface sends when saving.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceDraft {
    /// Absent when creating. Present when editing the Space it names.
    #[serde(default)]
    pub id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub weight: SpaceWeight,
}

/// Refuses a draft the Spaces file should never be made to hold.
pub fn validate_draft(draft: &SpaceDraft) -> Result<(), Error> {
    let name = draft.name.trim();
    if name.is_empty() || name.chars().count() > MAX_NAME_LEN || name.chars().any(is_deceptive) {
        return Err(Error::InvalidSpace {
            field: "name".to_owned(),
        });
    }
    Ok(())
}

/// Reads and writes [`Spaces`] under a directory the caller owns.
#[derive(Debug, Clone)]
pub struct SpaceStore {
    directory: PathBuf,
}

impl SpaceStore {
    pub fn new(directory: impl Into<PathBuf>) -> Self {
        Self {
            directory: directory.into(),
        }
    }

    pub fn path(&self) -> PathBuf {
        self.directory.join(SPACES_FILE)
    }

    /// Loads the Spaces, or none at all when there is no file yet.
    pub fn load(&self) -> Result<Spaces, Error> {
        let path = self.path();

        let text = match fs::read_to_string(&path) {
            Ok(text) => text,
            Err(source) if source.kind() == std::io::ErrorKind::NotFound => {
                return Ok(Spaces::default())
            }
            Err(source) => return Err(Error::SettingsUnreadable { path, source }),
        };

        serde_json::from_str(&text).map_err(|source| Error::SettingsMalformed { path, source })
    }

    pub fn save(&self, spaces: &Spaces) -> Result<(), Error> {
        let path = self.path();

        fs::create_dir_all(&self.directory).map_err(|source| Error::SettingsUnwritable {
            path: self.directory.clone(),
            source,
        })?;

        let json =
            serde_json::to_string_pretty(spaces).map_err(|source| Error::SettingsMalformed {
                path: path.clone(),
                source,
            })?;

        let temporary = self.directory.join(format!("{SPACES_FILE}.tmp"));
        fs::write(&temporary, json).map_err(|source| Error::SettingsUnwritable {
            path: temporary.clone(),
            source,
        })?;

        fs::rename(&temporary, &path).map_err(|source| Error::SettingsUnwritable { path, source })
    }
}

/// A Space id that is stable, opaque and unique within the file. The same
/// scheme as `macros::new_id`.
fn new_id(spaces: &Spaces, draft: &SpaceDraft) -> String {
    use sha2::{Digest, Sha256};

    for attempt in 0..64_u32 {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|since| since.as_nanos())
            .unwrap_or_default();

        let mut hasher = Sha256::new();
        hasher.update(nanos.to_le_bytes());
        hasher.update(attempt.to_le_bytes());
        hasher.update(spaces.items.len().to_le_bytes());
        hasher.update(draft.name.as_bytes());

        let candidate: String = hasher
            .finalize()
            .iter()
            .take(8)
            .map(|byte| format!("{byte:02x}"))
            .collect();

        if spaces.find(&candidate).is_none() {
            return candidate;
        }
    }

    format!("{}-{}", spaces.items.len(), draft.name)
}

/// Creates a Space at the end, or replaces the one the draft names.
pub fn save_space(store: &SpaceStore, draft: SpaceDraft) -> Result<Space, Error> {
    validate_draft(&draft)?;

    let mut spaces = store.load()?;

    let saved = match draft.id {
        Some(id) => {
            let index = spaces
                .position(&id)
                .ok_or_else(|| Error::UnknownSpace { id: id.clone() })?;
            let saved = Space {
                id,
                name: draft.name.trim().to_owned(),
                weight: draft.weight,
            };
            spaces.items[index] = saved.clone();
            saved
        }
        None => {
            if spaces.items.len() >= MAX_SPACES {
                return Err(Error::InvalidSpace {
                    field: "count".to_owned(),
                });
            }
            let saved = Space {
                id: new_id(&spaces, &draft),
                name: draft.name.trim().to_owned(),
                weight: draft.weight,
            };
            spaces.items.push(saved.clone());
            saved
        }
    };

    store.save(&spaces)?;
    Ok(saved)
}

/// Forgets a Space. Hosts that named it fall back to the default Space.
pub fn delete_space(store: &SpaceStore, id: &str) -> Result<(), Error> {
    let mut spaces = store.load()?;

    let index = spaces
        .position(id)
        .ok_or_else(|| Error::UnknownSpace { id: id.to_owned() })?;

    spaces.items.remove(index);
    store.save(&spaces)
}

/// Puts the Spaces in the order given.
///
/// The list has to be a permutation of what is saved: a missing or repeated id
/// is refused rather than guessed at, so a stale window cannot drop a Space.
pub fn reorder_spaces(store: &SpaceStore, order: &[String]) -> Result<Vec<Space>, Error> {
    let spaces = store.load()?;

    let mut seen = std::collections::BTreeSet::new();
    let complete = order.len() == spaces.items.len()
        && order
            .iter()
            .all(|id| spaces.find(id).is_some() && seen.insert(id.as_str()));
    if !complete {
        return Err(Error::InvalidSpace {
            field: "order".to_owned(),
        });
    }

    let reordered = Spaces {
        items: order
            .iter()
            .filter_map(|id| spaces.find(id).cloned())
            .collect(),
    };
    store.save(&reordered)?;
    Ok(reordered.items)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> (SpaceStore, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("a temporary directory");
        (SpaceStore::new(dir.path()), dir)
    }

    fn draft(name: &str, weight: SpaceWeight) -> SpaceDraft {
        SpaceDraft {
            id: None,
            name: name.to_owned(),
            weight,
        }
    }

    #[test]
    fn no_file_means_no_spaces_yet() {
        let (store, _dir) = store();
        assert_eq!(store.load().expect("defaults"), Spaces::default());
    }

    #[test]
    fn a_malformed_file_is_not_an_empty_list() {
        let (store, _dir) = store();
        fs::write(store.path(), "{ not json").expect("write");
        assert!(matches!(store.load(), Err(Error::SettingsMalformed { .. })));
    }

    #[test]
    fn a_space_survives_a_restart_with_its_weight() {
        let dir = tempfile::tempdir().expect("a temporary directory");
        let saved = save_space(
            &SpaceStore::new(dir.path()),
            draft("Production", SpaceWeight::Production),
        )
        .expect("save");

        let after = SpaceStore::new(dir.path()).load().expect("load");
        assert_eq!(after.find(&saved.id), Some(&saved));
        assert_eq!(saved.weight, SpaceWeight::Production);
    }

    #[test]
    fn a_file_without_a_weight_is_normal() {
        let (store, _dir) = store();
        fs::write(store.path(), r#"[{"id":"a","name":"Lab"}]"#).expect("write");
        assert_eq!(
            store.load().expect("load").items[0].weight,
            SpaceWeight::Normal
        );
    }

    #[test]
    fn the_weight_is_stored_by_name() {
        let (store, _dir) = store();
        save_space(&store, draft("Prod", SpaceWeight::Production)).expect("save");
        let text = fs::read_to_string(store.path()).expect("read");
        assert!(text.contains(r#""weight": "production""#));
    }

    #[test]
    fn two_spaces_never_share_an_id() {
        let (store, _dir) = store();
        let mut ids = std::collections::BTreeSet::new();
        for i in 0..MAX_SPACES {
            let saved =
                save_space(&store, draft(&format!("s{i}"), SpaceWeight::Normal)).expect("save");
            assert!(ids.insert(saved.id.clone()));
        }
    }

    #[test]
    fn the_count_is_bounded() {
        let (store, _dir) = store();
        for i in 0..MAX_SPACES {
            save_space(&store, draft(&format!("s{i}"), SpaceWeight::Normal)).expect("save");
        }
        assert!(matches!(
            save_space(&store, draft("one too many", SpaceWeight::Normal)),
            Err(Error::InvalidSpace { field }) if field == "count"
        ));
    }

    #[test]
    fn editing_replaces_the_space_it_names_and_keeps_its_place() {
        let (store, _dir) = store();
        let first = save_space(&store, draft("Lab", SpaceWeight::Normal)).expect("save");
        save_space(&store, draft("Staging", SpaceWeight::Normal)).expect("save");

        let edited = save_space(
            &store,
            SpaceDraft {
                id: Some(first.id.clone()),
                name: "  Lab 2  ".to_owned(),
                weight: SpaceWeight::Production,
            },
        )
        .expect("edit");

        assert_eq!(edited.id, first.id);
        assert_eq!(edited.name, "Lab 2");
        let items = store.load().expect("load").items;
        assert_eq!(items[0], edited);
        assert_eq!(items.len(), 2);
    }

    #[test]
    fn editing_an_unknown_space_is_refused() {
        let (store, _dir) = store();
        let result = save_space(
            &store,
            SpaceDraft {
                id: Some("nope".to_owned()),
                name: "x".to_owned(),
                weight: SpaceWeight::Normal,
            },
        );
        assert!(matches!(result, Err(Error::UnknownSpace { .. })));
    }

    #[test]
    fn a_bad_name_is_refused() {
        let (store, _dir) = store();
        for name in ["", "   ", &"x".repeat(MAX_NAME_LEN + 1), "pro\u{202e}d"] {
            assert!(
                matches!(
                    save_space(&store, draft(name, SpaceWeight::Normal)),
                    Err(Error::InvalidSpace { .. })
                ),
                "{name:?} should be refused"
            );
        }
    }

    #[test]
    fn deleting_forgets_the_space_and_an_unknown_id_is_refused() {
        let (store, _dir) = store();
        let saved = save_space(&store, draft("Lab", SpaceWeight::Normal)).expect("save");
        delete_space(&store, &saved.id).expect("delete");
        assert!(store.load().expect("load").items.is_empty());
        assert!(matches!(
            delete_space(&store, &saved.id),
            Err(Error::UnknownSpace { .. })
        ));
    }

    #[test]
    fn reordering_takes_a_permutation_and_nothing_else() {
        let (store, _dir) = store();
        let a = save_space(&store, draft("A", SpaceWeight::Normal)).expect("save");
        let b = save_space(&store, draft("B", SpaceWeight::Normal)).expect("save");

        let moved = reorder_spaces(&store, &[b.id.clone(), a.id.clone()]).expect("reorder");
        assert_eq!(
            moved.iter().map(|s| s.name.as_str()).collect::<Vec<_>>(),
            ["B", "A"]
        );

        for bad in [
            vec![a.id.clone()],
            vec![a.id.clone(), a.id.clone()],
            vec![a.id.clone(), "ghost".to_owned()],
        ] {
            assert!(matches!(
                reorder_spaces(&store, &bad),
                Err(Error::InvalidSpace { field }) if field == "order"
            ));
        }
        /* A refused order leaves the file as it was. */
        assert_eq!(store.load().expect("load").items[0].name, "B");
    }
}
