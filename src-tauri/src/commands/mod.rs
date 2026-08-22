//! The IPC surface.
//!
//! The only module that knows Tauri exists. Handlers validate what the webview
//! sends, delegate to a domain module, and map the failure to [`IpcError`].
//! Business logic does not live here — it lives where it can be tested without
//! a webview or an app handle.

pub mod settings;
