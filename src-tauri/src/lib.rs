#![forbid(unsafe_code)]
// Section 6 of `CLAUDE.md` asked for this in prose, and the prose was the only
// thing asking. A panic in the core takes the whole application down, and with
// it every other session it was holding open, so the rule is worth more as a
// lint than as a sentence. Inactive under `cfg(test)`, where a panic is how a
// test reports a failure.
#![cfg_attr(not(test), deny(clippy::unwrap_used, clippy::expect_used))]

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
pub mod sftp;
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
        /* The window is created from `tauri.conf.json`, which is read before
        any of our code runs, so ADR-0005's escape hatch cannot be a
        declarative setting: a stored preference can only be applied to a
        window that already exists. Non-fatal by construction — a user whose
        decorations do not come back has a cosmetic problem, and refusing to
        start would turn it into a total one. */
        .setup(|app| {
            commands::chrome::restore_decorations(app.handle());

            /* `InternalVault` (ADR-0035) holds an unlocked session's key in
            memory for as long as the process runs, which is what a value
            registered here, once, gives it. `SessionStore` and the rest
            resolve the same directory fresh on every call because they hold
            nothing between calls; this is the one store that does. */
            use tauri::Manager;
            let directory = app
                .path()
                .app_config_dir()
                .map_err(|_| error::Error::ConfigDirUnavailable)?;
            app.manage(vault::InternalVault::new(directory));

            Ok(())
        })
        .manage(ssh::registry::Registry::new())
        /* A bastion a chain opened, found again by the next chain to the same
        one rather than opened twice. ADR-0037. */
        .manage(ssh::registry::ChainedBastions::new())
        .manage(ssh::pending::PendingHostKeys::new())
        /* A jump host's answer, held against the decision that interrupts it.
        Never persisted, and gone when the process is. ADR-0027. */
        .manage(ssh::pending::CarriedCredentials::new())
        .manage(ssh::credentials::CredentialRequests::new())
        .manage(vault::Vault::default())
        /* Never persisted, and gone when the process is. ADR-0025. */
        .manage(vault::SessionSecrets::new())
        .manage(sftp::transfer::Transfers::new())
        .invoke_handler(tauri::generate_handler![
            commands::app::app_version,
            commands::chrome::window_chrome,
            commands::chrome::window_action,
            commands::chrome::set_native_decorations,
            commands::settings::get_settings,
            commands::settings::set_locale,
            commands::settings::set_theme,
            commands::sessions::list_sessions,
            commands::sessions::save_session,
            commands::sessions::delete_session,
            commands::sessions::connect_session,
            commands::sessions::trust_host_key,
            commands::sessions::dismiss_host_key,
            commands::sessions::host_key_decision,
            commands::sessions::credential_store_status,
            commands::sessions::internal_vault_status,
            commands::sessions::enable_internal_vault,
            commands::sessions::unlock_internal_vault,
            commands::sessions::disable_internal_vault,
            commands::sessions::reset_internal_vault,
            commands::sessions::remember_credential,
            commands::sessions::keep_credential_for_run,
            commands::sessions::session_credential_kept,
            commands::sessions::forget_credential,
            commands::sessions::authenticate_with_saved,
            commands::sessions::authenticate_session,
            commands::sessions::disconnect_session,
            commands::credential::credential_prompt,
            commands::credential::submit_credential,
            commands::credential::dismiss_credential,
            commands::terminal::open_terminal,
            commands::terminal::send_input,
            commands::terminal::resize_terminal,
            commands::terminal::session_stats,
            commands::sftp::sftp_list,
            commands::sftp::local_list_directory,
            commands::sftp::sftp_download,
            commands::sftp::sftp_upload,
            commands::sftp::sftp_transfer,
            commands::sftp::sftp_cancel,
            commands::sftp::sftp_mkdir,
            commands::sftp::sftp_rename,
            commands::sftp::sftp_remove,
            commands::sftp::local_mkdir,
            commands::sftp::local_rename,
            commands::sftp::local_remove,
        ])
        .run(tauri::generate_context!())
}
