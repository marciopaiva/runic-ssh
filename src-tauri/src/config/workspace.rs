//! The map: what the Map workspace lays out, beside the host book.
//!
//! ADR-0064. A component is one kind of surface on one saved host, and
//! everything here points into `sessions.json` by id. Nothing in this file is
//! a secret and nothing here is an address: a component that names a host
//! the book no longer has is dropped when the map is read, not kept as a
//! ghost with nowhere to connect to.
//!
//! `links`, `visions` and `layers` are declared from the first version, empty
//! and `#[serde(default)]`, so the releases that fill them (v0.7.0 to v0.9.0)
//! add data to a file this version already reads rather than migrate it.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::error::Error;

use super::is_deceptive;

pub const WORKSPACE_FILE: &str = "workspace.json";

const MAX_ID_LEN: usize = 80;
const MAX_NAME_LEN: usize = 80;

/// Which surface a component opens on its host.
///
/// Only `Ssh` ever asks the core for a shell. `Sftp` and `Monitor` share the
/// host's one connection without one, the same way their workspaces do today
/// (ADR-0053).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ComponentKind {
    Ssh,
    Sftp,
    Monitor,
    /// The file browser of the machine this runs on (ADR-0065): no host, no
    /// connection, so that a line to or from it is an upload or a download.
    Local,
}

/// Which lines a component may hold (ADR-0065): terminals join terminals,
/// file browsers join file browsers, and a monitor holds none.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Family {
    Terminal,
    Files,
}

impl ComponentKind {
    pub fn family(self) -> Option<Family> {
        match self {
            ComponentKind::Ssh => Some(Family::Terminal),
            ComponentKind::Sftp | ComponentKind::Local => Some(Family::Files),
            ComponentKind::Monitor => None,
        }
    }
}

/// A place on the map, in map pixels at 100%.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

/// How big a component's window is, in map pixels at 100%.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Size {
    pub w: f64,
    pub h: f64,
}

/// One kind of surface on one saved host.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Component {
    /// Stable for the life of the component; what a line or a vision names.
    pub id: String,
    pub kind: ComponentKind,
    /// The saved session this opens on, by the id `sessions.json` gave it;
    /// absent for `Local`, which is the one kind with no session, and
    /// required for every other (ADR-0065).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub host: Option<String>,
    /// The layer this sits in, or `None` for the outermost map.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub layer: Option<String>,
    /// Where the user left it, or `None` to let the map place it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<Point>,
    /// The window size the user chose, or `None` for the kind's default.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<Size>,
}

/// A line between two components of one family (ADR-0065). Between file
/// browsers the order is the direction, `a` the origin and `b` the
/// destination; between terminals the order carries nothing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Link {
    pub a: String,
    pub b: String,
}

/// A named set of components that lays itself out (v0.8.0).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Vision {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub components: Vec<String>,
    #[serde(default)]
    pub open: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub layer: Option<String>,
}

/// A map inside the map (v0.9.0).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Layer {
    pub id: String,
    pub name: String,
}

/// Everything the Map workspace remembers between launches.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Workspace {
    pub components: Vec<Component>,
    pub links: Vec<Link>,
    pub visions: Vec<Vision>,
    pub layers: Vec<Layer>,
}

fn acceptable_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= MAX_ID_LEN && !id.chars().any(is_deceptive)
}

fn acceptable_name(name: &str) -> bool {
    let trimmed = name.trim();
    !trimmed.is_empty() && trimmed.len() <= MAX_NAME_LEN && !trimmed.chars().any(is_deceptive)
}

fn invalid(field: &str) -> Error {
    Error::InvalidWorkspace {
        field: field.to_owned(),
    }
}

/// Refuses a workspace the file should never be made to hold.
///
/// Two rules here are ADR-0064's, restated so the map cannot loosen them by
/// accident: an id is unique within its kind of thing, and a host carries at
/// most one component of each kind. Two SSH components on one host would be
/// two shells on one connection, which `open_terminal` refuses (ADR-0014)
/// and which waits for #120.
pub fn validate(workspace: &Workspace) -> Result<(), Error> {
    let mut ids = HashSet::new();
    let mut surfaces = HashSet::new();
    for component in &workspace.components {
        if !acceptable_id(&component.id) {
            return Err(invalid("component.id"));
        }
        if !ids.insert(component.id.as_str()) {
            return Err(invalid("component.id"));
        }
        // A remote kind names its host; the local machine names none, and
        // there is one of it per layer, the way a host carries one of each
        // remote kind.
        let surface = match (component.kind, component.host.as_deref()) {
            (ComponentKind::Local, None) => {
                (component.layer.as_deref().unwrap_or(""), component.kind)
            }
            (ComponentKind::Local, Some(_)) | (_, None) => return Err(invalid("component.host")),
            (_, Some(host)) => {
                if !acceptable_id(host) {
                    return Err(invalid("component.host"));
                }
                (host, component.kind)
            }
        };
        if !surfaces.insert(surface) {
            return Err(invalid("component.kind"));
        }
        if let Some(layer) = component.layer.as_deref() {
            if !acceptable_id(layer) {
                return Err(invalid("component.layer"));
            }
        }
        if let Some(Point { x, y }) = component.position {
            if !(x.is_finite() && y.is_finite()) {
                return Err(invalid("component.position"));
            }
        }
        if let Some(Size { w, h }) = component.size {
            if !(w.is_finite() && h.is_finite() && w > 0.0 && h > 0.0) {
                return Err(invalid("component.size"));
            }
        }
    }

    // ADR-0065: a line joins two components of one family, terminals with
    // terminals and file browsers with file browsers, never a monitor. On a
    // file-browser line the order is the direction, so the same pair may hold
    // one line each way; a terminal line has no direction and its pair holds
    // one line whichever way it was written.
    let kinds: HashMap<&str, ComponentKind> = workspace
        .components
        .iter()
        .map(|component| (component.id.as_str(), component.kind))
        .collect();
    let mut seen_links: Vec<(&str, &str)> = Vec::new();
    for link in &workspace.links {
        if link.a == link.b {
            return Err(invalid("link"));
        }
        let (Some(from), Some(to)) = (kinds.get(link.a.as_str()), kinds.get(link.b.as_str()))
        else {
            return Err(invalid("link"));
        };
        let Some(family) = from.family() else {
            return Err(invalid("link"));
        };
        if to.family() != Some(family) {
            return Err(invalid("link"));
        }
        if *from == ComponentKind::Local && *to == ComponentKind::Local {
            return Err(invalid("link"));
        }
        let duplicate = seen_links.iter().any(|(a, b)| {
            (*a == link.a && *b == link.b)
                || (family == Family::Terminal && *a == link.b && *b == link.a)
        });
        if duplicate {
            return Err(invalid("link"));
        }
        seen_links.push((link.a.as_str(), link.b.as_str()));
    }

    let mut vision_ids = HashSet::new();
    for vision in &workspace.visions {
        if !acceptable_id(&vision.id) || !vision_ids.insert(vision.id.as_str()) {
            return Err(invalid("vision.id"));
        }
        if !acceptable_name(&vision.name) {
            return Err(invalid("vision.name"));
        }
        if vision
            .components
            .iter()
            .any(|id| !ids.contains(id.as_str()))
        {
            return Err(invalid("vision.components"));
        }
    }

    let mut layer_ids = HashSet::new();
    for layer in &workspace.layers {
        if !acceptable_id(&layer.id) || !layer_ids.insert(layer.id.as_str()) {
            return Err(invalid("layer.id"));
        }
        if !acceptable_name(&layer.name) {
            return Err(invalid("layer.name"));
        }
    }

    Ok(())
}

/// Drops every component whose host the book no longer has, and every line
/// or vision membership that pointed at one.
///
/// Read-time, not write-time: the host book is edited elsewhere (the Home
/// wizard, ADR-0034), and it is not that editor's job to know the map exists.
pub fn prune(mut workspace: Workspace, known_hosts: &HashSet<&str>) -> Workspace {
    workspace
        .components
        .retain(|component| match component.host.as_deref() {
            Some(host) => known_hosts.contains(host),
            None => true,
        });

    let kept: HashSet<&str> = workspace
        .components
        .iter()
        .map(|component| component.id.as_str())
        .collect();
    let kept: HashSet<String> = kept.into_iter().map(str::to_owned).collect();

    workspace
        .links
        .retain(|link| kept.contains(&link.a) && kept.contains(&link.b));
    for vision in &mut workspace.visions {
        vision.components.retain(|id| kept.contains(id));
    }

    workspace
}

/// Reads and writes [`Workspace`] under a directory the caller owns.
#[derive(Debug, Clone)]
pub struct WorkspaceStore {
    directory: PathBuf,
}

impl WorkspaceStore {
    pub fn new(directory: impl Into<PathBuf>) -> Self {
        Self {
            directory: directory.into(),
        }
    }

    pub fn path(&self) -> PathBuf {
        self.directory.join(WORKSPACE_FILE)
    }

    /// Loads the map, or an empty one when there is no file yet.
    ///
    /// A missing file is a first launch. A malformed one is a failure: the
    /// user's layout is not something to replace with nothing in silence.
    pub fn load(&self) -> Result<Workspace, Error> {
        let path = self.path();

        let text = match fs::read_to_string(&path) {
            Ok(text) => text,
            Err(source) if source.kind() == std::io::ErrorKind::NotFound => {
                return Ok(Workspace::default())
            }
            Err(source) => return Err(Error::SettingsUnreadable { path, source }),
        };

        serde_json::from_str(&text).map_err(|source| Error::SettingsMalformed { path, source })
    }

    /// Writes the map, through a temporary file and a rename, so a crash midway
    /// leaves the previous layout rather than half of a new one.
    pub fn save(&self, workspace: &Workspace) -> Result<(), Error> {
        validate(workspace)?;
        let path = self.path();

        fs::create_dir_all(&self.directory).map_err(|source| Error::SettingsUnwritable {
            path: self.directory.clone(),
            source,
        })?;

        let json =
            serde_json::to_string_pretty(workspace).map_err(|source| Error::SettingsMalformed {
                path: path.clone(),
                source,
            })?;

        let temporary = self.directory.join(format!("{WORKSPACE_FILE}.tmp"));
        fs::write(&temporary, json).map_err(|source| Error::SettingsUnwritable {
            path: temporary.clone(),
            source,
        })?;

        fs::rename(&temporary, &path).map_err(|source| Error::SettingsUnwritable { path, source })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> (WorkspaceStore, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("a temporary directory");
        (WorkspaceStore::new(dir.path()), dir)
    }

    fn component(id: &str, kind: ComponentKind, host: &str) -> Component {
        Component {
            id: id.to_owned(),
            kind,
            host: Some(host.to_owned()),
            layer: None,
            position: Some(Point { x: 120.0, y: -40.5 }),
            size: None,
        }
    }

    fn local(id: &str) -> Component {
        Component {
            id: id.to_owned(),
            kind: ComponentKind::Local,
            host: None,
            layer: None,
            position: None,
            size: None,
        }
    }

    #[test]
    fn no_file_means_an_empty_map() {
        let (store, _dir) = store();
        assert_eq!(store.load().expect("defaults"), Workspace::default());
    }

    #[test]
    fn a_malformed_file_is_not_an_empty_map() {
        let (store, _dir) = store();
        fs::write(store.path(), "{ not json").expect("write");

        assert!(matches!(store.load(), Err(Error::SettingsMalformed { .. })));
    }

    #[test]
    fn the_map_survives_a_restart() {
        let dir = tempfile::tempdir().expect("a temporary directory");
        let workspace = Workspace {
            components: vec![
                component("c1", ComponentKind::Ssh, "s1"),
                component("c2", ComponentKind::Sftp, "s1"),
            ],
            ..Workspace::default()
        };
        WorkspaceStore::new(dir.path())
            .save(&workspace)
            .expect("save");

        let after_restart = WorkspaceStore::new(dir.path()).load().expect("load");
        assert_eq!(after_restart, workspace);
    }

    #[test]
    fn a_file_from_this_version_reads_with_the_later_arrays_empty() {
        /* What v0.6.0 writes, byte for byte, so that v0.7.0 to v0.9.0 can be
        checked against it: a component with nothing optional set, and the
        three arrays those releases fill. */
        let json = r#"{"components":[{"id":"c1","kind":"ssh","host":"s1"}]}"#;
        let workspace: Workspace = serde_json::from_str(json).expect("parse");

        assert_eq!(workspace.components.len(), 1);
        assert_eq!(workspace.components[0].position, None);
        assert!(workspace.links.is_empty());
        assert!(workspace.visions.is_empty());
        assert!(workspace.layers.is_empty());
    }

    #[test]
    fn an_empty_map_serializes_to_what_the_frontend_pins() {
        let json = serde_json::to_string(&Workspace::default()).expect("serialize");
        assert_eq!(
            json,
            r#"{"components":[],"links":[],"visions":[],"layers":[]}"#
        );
    }

    #[test]
    fn a_host_carries_one_component_of_each_kind() {
        let (store, _dir) = store();
        let twice = Workspace {
            components: vec![
                component("c1", ComponentKind::Ssh, "s1"),
                component("c2", ComponentKind::Ssh, "s1"),
            ],
            ..Workspace::default()
        };

        assert!(matches!(
            store.save(&twice),
            Err(Error::InvalidWorkspace { field }) if field == "component.kind"
        ));
        assert!(!store.path().exists(), "a refused map must not be written");
    }

    #[test]
    fn ids_are_unique_and_honest() {
        let duplicate = Workspace {
            components: vec![
                component("c1", ComponentKind::Ssh, "s1"),
                component("c1", ComponentKind::Sftp, "s1"),
            ],
            ..Workspace::default()
        };
        assert!(
            matches!(validate(&duplicate), Err(Error::InvalidWorkspace { field }) if field == "component.id")
        );

        let deceptive = Workspace {
            components: vec![component("c\u{202e}1", ComponentKind::Ssh, "s1")],
            ..Workspace::default()
        };
        assert!(
            matches!(validate(&deceptive), Err(Error::InvalidWorkspace { field }) if field == "component.id")
        );
    }

    #[test]
    fn a_position_must_be_a_number() {
        let mut nan = component("c1", ComponentKind::Ssh, "s1");
        nan.position = Some(Point {
            x: f64::NAN,
            y: 0.0,
        });
        let workspace = Workspace {
            components: vec![nan],
            ..Workspace::default()
        };

        assert!(
            matches!(validate(&workspace), Err(Error::InvalidWorkspace { field }) if field == "component.position")
        );
    }

    #[test]
    fn a_link_names_two_different_components_that_exist() {
        let workspace = Workspace {
            components: vec![component("c1", ComponentKind::Ssh, "s1")],
            links: vec![Link {
                a: "c1".to_owned(),
                b: "gone".to_owned(),
            }],
            ..Workspace::default()
        };

        assert!(
            matches!(validate(&workspace), Err(Error::InvalidWorkspace { field }) if field == "link")
        );
    }

    #[test]
    fn a_link_joins_two_components_of_one_family() {
        let with = |links: Vec<Link>| Workspace {
            components: vec![
                component("t1", ComponentKind::Ssh, "s1"),
                component("t2", ComponentKind::Ssh, "s2"),
                component("f1", ComponentKind::Sftp, "s1"),
                component("f2", ComponentKind::Sftp, "s2"),
                component("m1", ComponentKind::Monitor, "s1"),
                local("l1"),
            ],
            links,
            ..Workspace::default()
        };
        let link = |a: &str, b: &str| Link {
            a: a.to_owned(),
            b: b.to_owned(),
        };
        let refused = |links: Vec<Link>| matches!(validate(&with(links)), Err(Error::InvalidWorkspace { field }) if field == "link");

        assert!(validate(&with(vec![link("t1", "t2")])).is_ok());
        assert!(
            validate(&with(vec![link("f1", "f2"), link("f2", "f1")])).is_ok(),
            "one each way"
        );
        assert!(refused(vec![link("t1", "f1")]), "across families");
        assert!(refused(vec![link("t1", "m1")]), "a monitor");
        assert!(
            refused(vec![link("t1", "t2"), link("t2", "t1")]),
            "a terminal pair twice"
        );
        assert!(
            refused(vec![link("f1", "f2"), link("f1", "f2")]),
            "the same direction twice"
        );
        assert!(
            validate(&with(vec![link("l1", "f1"), link("f2", "l1")])).is_ok(),
            "an upload and a download"
        );
        assert!(
            refused(vec![link("t1", "l1")]),
            "a terminal to the local machine"
        );
    }

    #[test]
    fn the_local_machine_has_no_host_and_there_is_one_per_layer() {
        let refused = |components: Vec<Component>| {
            validate(&Workspace {
                components,
                ..Workspace::default()
            })
            .err()
        };

        assert!(refused(vec![local("l1")]).is_none());
        assert!(matches!(
            refused(vec![Component { host: Some("s1".to_owned()), ..local("l1") }]),
            Some(Error::InvalidWorkspace { field }) if field == "component.host"
        ));
        assert!(matches!(
            refused(vec![Component { host: None, ..component("t1", ComponentKind::Ssh, "s1") }]),
            Some(Error::InvalidWorkspace { field }) if field == "component.host"
        ));
        assert!(matches!(
            refused(vec![local("l1"), local("l2")]),
            Some(Error::InvalidWorkspace { field }) if field == "component.kind"
        ));
        assert!(refused(vec![
            local("l1"),
            Component {
                layer: Some("k".to_owned()),
                ..local("l2")
            }
        ])
        .is_none());

        let pruned = prune(
            Workspace {
                components: vec![local("l1"), component("t1", ComponentKind::Ssh, "gone")],
                ..Workspace::default()
            },
            &HashSet::new(),
        );
        assert_eq!(
            pruned.components.len(),
            1,
            "the local machine has no host to lose"
        );
    }

    #[test]
    fn a_component_whose_host_left_the_book_is_dropped_with_what_pointed_at_it() {
        let workspace = Workspace {
            components: vec![
                component("c1", ComponentKind::Ssh, "s1"),
                component("c2", ComponentKind::Ssh, "gone"),
            ],
            links: vec![Link {
                a: "c1".to_owned(),
                b: "c2".to_owned(),
            }],
            visions: vec![Vision {
                id: "v1".to_owned(),
                name: "web".to_owned(),
                components: vec!["c1".to_owned(), "c2".to_owned()],
                open: true,
                layer: None,
            }],
            layers: vec![],
        };

        let pruned = prune(workspace, &HashSet::from(["s1"]));

        assert_eq!(pruned.components.len(), 1);
        assert!(pruned.links.is_empty());
        assert_eq!(pruned.visions[0].components, vec!["c1".to_owned()]);
    }
}
