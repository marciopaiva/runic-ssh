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
/// One line per command, and no plugin `default` set. ADR-0013: a `default` set
/// is every command a plugin exposes, not the minimum it needs, and taking four
/// of them granted this window 45 commands to reach five.
///
/// Three of these are called by scripts Tauri injects into the page, so they
/// have no caller anywhere in this repository and `grep` will not find one.
/// This comment is the only place that records what they are for:
///
/// * `allow-start-dragging` and `allow-internal-toggle-maximize` are what
///   `drag.js` calls on a drag and on a double click. ADR-0005 made the title
///   bar ours, so without the second one a double click on it stops maximising.
/// * `allow-internal-toggle-devtools` is what `toggle-devtools.js` calls on
///   Ctrl+Shift+I. The command behind it is compiled out of a release build, so
///   this grant is inert once packaged and exists for the dev loop only.
///
/// `allow-is-maximized` is ours, from `ipc/chrome.ts`. `allow-listen` and
/// `allow-unlisten` are ours too; `allow-emit` is deliberately absent, because
/// events run one way here — the core emits and the webview listens.
///
/// Deliberately *not* here, and worth reading twice: minimise, maximise and
/// close. ADR-0005 made those controls ours to draw, and ADR-0012 has them act
/// through a command of ours rather than through the window API — so the code
/// that renders hostile output never holds permission to close the window.
/// They were granted once, and the grant bought a button that failed silently
/// when anything went wrong. `window_action_cannot_name_a_window` below is what
/// keeps that swap honest.
const ALLOWED: &[&str] = &[
    "core:event:allow-listen",
    "core:event:allow-unlisten",
    "core:webview:allow-internal-toggle-devtools",
    "core:window:allow-internal-toggle-maximize",
    "core:window:allow-is-maximized",
    "core:window:allow-start-dragging",
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
fn every_capability_is_the_one_reviewed() {
    /* A second capability file grants something to a window nobody looked at.
    Adding one is fine; adding one without this test failing is not. */
    let names: Vec<_> = every_capability()
        .into_iter()
        .map(|(name, _)| name)
        .collect();

    assert_eq!(names, vec!["default.json"]);
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

/// The text of `window_action`, signature and body, from its own source.
///
/// Read rather than called because the property being guarded is the shape of
/// the function, and a shape is not observable from a call.
fn window_action_source() -> String {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/src/commands/chrome.rs");
    let text = std::fs::read_to_string(path).expect("commands/chrome.rs is missing");

    let start = text
        .find("pub async fn window_action")
        .expect("window_action is gone or renamed; ADR-0012 explains what it was for");
    let tail = &text[start..];
    let end = tail.find("\n}\n").map_or(tail.len(), |at| at + 2);

    tail[..end].to_owned()
}

#[test]
fn window_action_cannot_name_a_window() {
    /* ADR-0012, and the single edit that would undo it.

    Three `core:window` permissions are absent from ALLOWED because the webview
    no longer acts on the window itself — it asks `window_action`, and Tauri
    injects the window that called. Application commands are *not* gated by the
    ACL, so the moment that command can be told which window to act on, any
    document can act on any window: the credential prompt included, whose empty
    capability is ADR-0008's argument that the main webview cannot touch the
    window a password is typed into.

    Nothing else notices that edit. The capability file still reads as narrow,
    the ACL still has nothing to check, and the tests above still pass. */
    let source = window_action_source();
    let signature = source
        .split_once('{')
        .map_or(source.as_str(), |(head, _)| head);

    assert!(
        signature.contains("window: WebviewWindow<"),
        "window_action no longer takes the calling window. Read ADR-0012 before \
         changing this: the injected window is what stops one document acting \
         on another. Signature is:\n{signature}"
    );

    for naming in ["String", "&str", "AppHandle"] {
        assert!(
            !signature.contains(naming),
            "window_action takes a `{naming}`, which is a way to name a window \
             other than the caller's — the reach ADR-0012 removed, and the \
             reason three permissions could leave the capability. Signature \
             is:\n{signature}"
        );
    }

    /* The other route to the same place: a handle reached through `Manager`
    turns a label back into any window in the application. */
    assert!(
        !source.contains("get_webview_window"),
        "window_action looks a window up by label. ADR-0012: it may act on the \
         window that called it and no other."
    );
}

#[test]
fn no_plugin_default_set_is_granted() {
    /* ADR-0013, and the edit that would undo it quietly.

    `core:window:default` reads like a minimum and is 28 commands; the four sets
    this file used to hold were 45, against five the application calls. Swapping
    a line below back to its plugin's `default` set would leave every other test
    here passing — the list would still be short, still be reviewed, still name
    a reason each. Only this test can see the difference. */
    for permission in permissions(&capability()) {
        assert!(
            !permission.ends_with(":default"),
            "{permission} is a plugin default set, which grants every command \
             that plugin exposes rather than the ones this application calls. \
             ADR-0013: name each command instead."
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
