//! A shell on this machine, not a remote one. See
//! adr/0074-add-local-shell-sessions-over-a-native-pty.md.
//!
//! This module is plain Rust, like `ssh` and `sftp`: it knows nothing of
//! Tauri, only of `portable_pty` and Tokio. `commands::local_shell` is the
//! only thing that wires it to a webview.

pub mod error;
pub mod kind;
pub mod pty;
pub mod registry;
