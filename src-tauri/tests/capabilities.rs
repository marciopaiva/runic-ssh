//! Guards the capability set.
//!
//! A capability is a permanent grant to code that renders hostile input, so
//! section 7.6 of `CLAUDE.md` makes widening one a Phase 2 proposal with an ADR.
//! This test is what turns that rule into something CI can enforce: the list is
//! pinned, and adding to it fails here until someone updates this file
//! deliberately.

use std::collections::BTreeSet;

/// Every permission the application is allowed to hold today.
///
/// `allow-start-dragging` is what Tauri's own drag-region script calls, so an
/// undecorated window cannot be moved without it.
///
/// Deliberately *not* here, and worth reading twice: minimise, maximise and
/// close. ADR-0005 made those controls ours to draw, and they act through a
/// command of ours rather than through the window API — so the code that
/// renders hostile output never holds permission to close the window. They
/// were granted once, and the grant bought a button that failed silently when
/// anything went wrong.
///
/// Also not here: `allow-is-maximized` and `allow-internal-toggle-maximize`,
/// which the interface uses and `core:window:default` already includes.
const ALLOWED: &[&str] = &[
    "core:app:default",
    "core:event:default",
    "core:webview:default",
    "core:window:allow-start-dragging",
    "core:window:default",
];

fn capability() -> serde_json::Value {
    named("default.json")
}

fn named(file: &str) -> serde_json::Value {
    let path = format!("{}/capabilities/{file}", env!("CARGO_MANIFEST_DIR"));
    let text = std::fs::read_to_string(&path).unwrap_or_else(|_| panic!("{path} is missing"));
    serde_json::from_str(&text).unwrap_or_else(|_| panic!("{path} is not valid JSON"))
}

/// Every capability file in the crate, so a new one cannot appear unreviewed.
fn every_capability() -> Vec<(String, serde_json::Value)> {
    let directory = concat!(env!("CARGO_MANIFEST_DIR"), "/capabilities");

    let mut found: Vec<_> = std::fs::read_dir(directory)
        .expect("the capabilities directory is missing")
        .filter_map(Result::ok)
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| name.ends_with(".json"))
        .map(|name| {
            let value = named(&name);
            (name, value)
        })
        .collect();

    found.sort_by(|a, b| a.0.cmp(&b.0));
    found
}

fn permissions(value: &serde_json::Value) -> BTreeSet<String> {
    value["permissions"]
        .as_array()
        .expect("the capability has no permissions array")
        .iter()
        .map(|p| {
            p.as_str()
                .expect("a permission is not a string; object form needs its own review")
                .to_owned()
        })
        .collect()
}

#[test]
fn permission_set_matches_the_reviewed_list() {
    let granted = permissions(&capability());
    let allowed: BTreeSet<String> = ALLOWED.iter().map(|s| (*s).to_owned()).collect();

    let added: Vec<_> = granted.difference(&allowed).collect();
    assert!(
        added.is_empty(),
        "capability widened without review: {added:?}. \
         Widening needs a Phase 2 proposal and an ADR (CLAUDE.md 7.6). \
         If that happened, add the permission to ALLOWED in this test."
    );

    let removed: Vec<_> = allowed.difference(&granted).collect();
    assert!(
        removed.is_empty(),
        "capability narrowed: {removed:?}. That is welcome — drop it from ALLOWED too."
    );
}

#[test]
fn every_capability_is_one_of_the_two_reviewed() {
    /* A third capability file grants something to a window nobody looked at.
    Adding one is fine; adding one without this test failing is not. */
    let names: Vec<_> = every_capability()
        .into_iter()
        .map(|(name, _)| name)
        .collect();

    assert_eq!(names, vec!["credential.json", "default.json"]);
}

#[test]
fn the_credential_window_is_granted_nothing() {
    /* ADR-0008: this is the window a secret is typed into. It invokes the
    application's own commands, which the ACL does not gate, and it needs
    nothing at all from the core plugins. The shortest list is the point, and
    an addition here deserves the same scrutiny as one to `default`. */
    let credential = named("credential.json");

    assert!(
        permissions(&credential).is_empty(),
        "the credential window was granted a permission: {:?}",
        permissions(&credential)
    );
}

#[test]
fn each_capability_names_the_one_window_it_is_for() {
    for (name, value) in every_capability() {
        let windows: Vec<_> = value["windows"]
            .as_array()
            .unwrap_or_else(|| panic!("{name} is not scoped to any window"))
            .iter()
            .filter_map(|w| w.as_str())
            .collect();

        assert_eq!(
            windows.len(),
            1,
            "{name} is scoped to more than one window, so a grant reaches a \
             window it was not reviewed for"
        );
    }
}

#[test]
fn no_blanket_permission_is_granted() {
    for permission in permissions(&capability()) {
        assert_ne!(
            permission, "core:default",
            "core:default pulls in far more than this application needs"
        );
        assert!(
            !permission.ends_with(":allow-all"),
            "{permission} is a blanket grant"
        );
    }
}

#[test]
fn capability_is_scoped_to_the_main_window() {
    let value = capability();
    let windows: Vec<_> = value["windows"]
        .as_array()
        .expect("the capability is not scoped to any window")
        .iter()
        .filter_map(|w| w.as_str())
        .collect();

    assert_eq!(
        windows,
        vec!["main"],
        "a capability scoped beyond the main window reaches windows nobody reviewed"
    );
}
