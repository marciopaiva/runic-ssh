//! Local shell failures, internal to this module and its callers. This does
//! not cross IPC itself: `error::Error` is the only type that does, per its
//! own module comment and ADR-0007. A variant here earns a place in
//! `error::Error` when a command actually needs to report it.

/// Everything that can go wrong opening a local shell.
///
/// Deliberately one variant: the underlying `portable_pty` or OS error is
/// discarded rather than carried, the same way `sftp::error::SftpError`
/// collapses what it wraps. Nothing at the IPC boundary can act on *why* a
/// spawn failed beyond knowing that it did, and the discarded text is often
/// an OS error string this side did not write and cannot audit (rule 2).
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum LocalShellError {
    #[error("the local shell could not be started")]
    SpawnFailed,
}
