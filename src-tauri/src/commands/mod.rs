//! The IPC surface.
//!
//! The only module that knows Tauri exists. Handlers validate what the webview
//! sends, delegate to a domain module, and map the failure to [`IpcError`].
//! Business logic does not live here — it lives where it can be tested without
//! a webview or an app handle.

pub mod app;
pub mod candidate_logs;
pub mod chrome;
pub mod credential;
pub mod forward;
pub mod journal;
pub mod macros;
pub mod monitor;
pub mod ports;
pub mod processes;
pub mod sessions;
pub mod settings;
pub mod sftp;
pub mod sysinfo;
pub mod systemd;
pub mod tail;
pub mod terminal;
