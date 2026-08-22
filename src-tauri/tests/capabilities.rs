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
/// The four `core:window` grants beyond `default` are ADR-0005 being carried
/// out: the window is undecorated, so the minimise, maximise and close buttons
/// are ours to draw, and a button we draw is inert without permission to act.
/// `allow-start-dragging` is what `data-tauri-drag-region` calls — without it
/// the titlebar is a strip the window cannot be moved by.
///
/// Deliberately *not* here: `allow-is-maximized` and
/// `allow-internal-toggle-maximize`, which the interface also uses. Both are
/// already inside `core:window:default`, and restating them would make the set
/// look wider than it is.
const ALLOWED: &[&str] = &[
    "core:app:default",
    "core:event:default",
    "core:webview:default",
    "core:window:allow-close",
    "core:window:allow-minimize",
    "core:window:allow-start-dragging",
    "core:window:allow-toggle-maximize",
    "core:window:default",
];

fn capability() -> serde_json::Value {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/capabilities/default.json");
    let text = std::fs::read_to_string(path).expect("capabilities/default.json is missing");
    serde_json::from_str(&text).expect("capabilities/default.json is not valid JSON")
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
