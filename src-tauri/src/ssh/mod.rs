//! The SSH layer.
//!
//! Plain Rust with no Tauri in sight, so every part of it can be exercised
//! without a webview or an app handle.

pub mod connection;
pub mod credentials;
pub mod forward;
pub mod journal;
pub mod known_hosts;
pub mod monitor;
pub mod pending;
pub mod ports;
pub mod processes;
pub mod registry;
pub mod socks;
pub mod stats;
pub mod sysinfo;
pub mod systemd;
pub mod tail;
pub mod terminal;
pub mod text;
pub mod trust;
