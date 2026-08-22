//! The SSH layer.
//!
//! Plain Rust with no Tauri in sight, so every part of it can be exercised
//! without a webview or an app handle.

pub mod connection;
pub mod known_hosts;
pub mod trust;
