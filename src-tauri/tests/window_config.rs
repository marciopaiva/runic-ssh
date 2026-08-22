//! Guards the per-platform window configuration.
//!
//! ADR-0005 chose Option C: Windows and Linux run undecorated with controls we
//! draw, macOS keeps its native traffic lights over an overlay titlebar. That
//! lands as two files, and the second one has a trap in it.
//!
//! Tauri merges a platform config over the base with `json_patch::merge`, which
//! is RFC 7386 — and RFC 7386 **replaces arrays wholesale** rather than merging
//! them element by element. `app.windows` is an array. So a macOS override
//! carrying only the chrome keys does not add three settings to the window; it
//! replaces the window, and macOS silently loses the title, the size and the
//! minimum size.
//!
//! The fix is to restate the whole window object. The cost of the fix is that
//! the two now drift apart the moment somebody changes one, and nothing at
//! build time notices — the symptom is a macOS window that is the wrong size,
//! on a machine the person making the change probably is not using. This test
//! is what notices.

use std::collections::BTreeMap;

/// The keys the macOS window is *supposed* to differ on. Everything else is a
/// restatement, and a restatement that disagrees is a bug.
const CHROME_KEYS: &[&str] = &["decorations", "titleBarStyle", "hiddenTitle"];

fn config(name: &str) -> serde_json::Value {
    let path = format!("{}/{name}", env!("CARGO_MANIFEST_DIR"));
    let text = std::fs::read_to_string(&path).unwrap_or_else(|_| panic!("{path} is missing"));
    serde_json::from_str(&text).unwrap_or_else(|_| panic!("{path} is not valid JSON"))
}

fn window(config: &serde_json::Value) -> BTreeMap<String, serde_json::Value> {
    let windows = config["app"]["windows"]
        .as_array()
        .expect("no app.windows array");

    assert_eq!(windows.len(), 1, "this test assumes a single window");

    windows[0]
        .as_object()
        .expect("the window is not an object")
        .iter()
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect()
}

#[test]
fn the_base_window_is_undecorated() {
    /* Windows and Linux. There is no titlebar to sit under, which is what the
    Titlebar component is for. */
    assert_eq!(window(&config("tauri.conf.json"))["decorations"], false);
}

#[test]
fn macos_keeps_its_own_titlebar_as_an_overlay() {
    let macos = window(&config("tauri.macos.conf.json"));

    assert_eq!(macos["decorations"], true);
    assert_eq!(macos["titleBarStyle"], "Overlay");
    /* Without this, macOS draws its window title over the tab strip in a
    colour that follows the system theme rather than ours. */
    assert_eq!(macos["hiddenTitle"], true);
}

#[test]
fn the_macos_override_restates_the_whole_window() {
    /* Because RFC 7386 replaces the array. Anything the base sets and the
    override omits is not inherited — it is gone. */
    let base = window(&config("tauri.conf.json"));
    let macos = window(&config("tauri.macos.conf.json"));

    let dropped: Vec<_> = base
        .keys()
        .filter(|key| !macos.contains_key(*key))
        .collect();

    assert!(
        dropped.is_empty(),
        "tauri.macos.conf.json omits {dropped:?}. The platform config replaces \
         app.windows outright, so an omitted key is not inherited from \
         tauri.conf.json — it is lost, and only on macOS."
    );
}

#[test]
fn the_two_windows_differ_only_in_their_chrome() {
    let base = window(&config("tauri.conf.json"));
    let macos = window(&config("tauri.macos.conf.json"));

    for (key, value) in &base {
        if CHROME_KEYS.contains(&key.as_str()) {
            continue;
        }

        assert_eq!(
            macos.get(key),
            Some(value),
            "{key} has drifted between tauri.conf.json and tauri.macos.conf.json. \
             The two are restatements of one window; only {CHROME_KEYS:?} may differ."
        );
    }
}

#[test]
fn both_configure_the_window_the_capability_is_scoped_to() {
    /* capabilities/default.json grants only to `main`. A window under another
    label would run with no permissions at all, and the symptom is a titlebar
    whose buttons do nothing. */
    assert_eq!(window(&config("tauri.conf.json"))["label"], "main");
    assert_eq!(window(&config("tauri.macos.conf.json"))["label"], "main");
}
