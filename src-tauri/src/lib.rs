#![forbid(unsafe_code)]

//! The privileged half of Runic SSH.
//!
//! Everything the webview is not trusted with lives here: the network, the
//! filesystem, and the OS keychain. The webview renders output from hosts the
//! user does not control, so nothing on this side hands it a secret and
//! nothing on this side trusts a value it sends.
//!
//! `commands` is the only module that knows Tauri exists. The domain modules
//! stay plain Rust so they can be tested without a webview or an app handle,
//! which is what keeps the test suite fast and the logic reviewable.

pub mod commands;
pub mod config;
pub mod error;

/// Builds and runs the application, blocking until the last window closes.
///
/// This lives in the library rather than in `main.rs` so that startup can be
/// exercised from a test without going through the binary.
///
/// # Errors
///
/// Returns the Tauri error if the runtime cannot be built or the context is
/// invalid. Both are startup failures, not conditions a user can reach.
pub fn run() -> tauri::Result<()> {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::settings::get_settings,
            commands::settings::set_locale,
        ])
        .run(tauri::generate_context!())
}
