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
pub mod ssh;
pub mod vault;

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
        .manage(ssh::registry::Registry::new())
        .manage(ssh::pending::PendingHostKeys::new())
        .manage(vault::Vault::default())
        .invoke_handler(tauri::generate_handler![
            commands::chrome::window_chrome,
            commands::settings::get_settings,
            commands::settings::set_locale,
            commands::sessions::list_sessions,
            commands::sessions::save_session,
            commands::sessions::delete_session,
            commands::sessions::connect_session,
            commands::sessions::trust_host_key,
            commands::sessions::credential_store_status,
            commands::sessions::remember_credential,
            commands::sessions::forget_credential,
            commands::sessions::authenticate_with_saved,
            commands::sessions::authenticate_session,
            commands::sessions::disconnect_session,
            commands::terminal::open_terminal,
            commands::terminal::send_input,
            commands::terminal::resize_terminal,
            commands::terminal::session_stats,
        ])
        .run(tauri::generate_context!())
}
