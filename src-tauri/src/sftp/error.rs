//! SFTP failures, internal to this module and its callers.
//!
//! This does not cross IPC itself: `error::Error` is the only type that does,
//! per its own module comment and ADR-0007, and `IpcError` is what a command
//! module builds from it. A variant here earns a place in `error::Error` when
//! a command actually needs to report it, the same way `ConnectionError`
//! already does. Nothing here carries a remote path or a filename either: the
//! message a user sees is written from the variant and the operation being
//! done, never from what the server said, since the server is the thing
//! `docs/security-model.md` calls hostile.

use crate::sftp::path::PathError;
use crate::ssh::connection::ConnectionError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum SftpError {
    /// The channel or the subsystem could not be opened. Whatever broke the
    /// connection itself is `ConnectionError`'s to describe; by the time it
    /// reaches here it is only ever "SFTP is not available right now".
    #[error("the connection is not available")]
    NotConnected,

    /// A name check from `sftp::path` refused a remote entry before it was
    /// let anywhere near a local write or a rendered listing.
    #[error("the remote name was refused: {0}")]
    RefusedName(#[from] PathError),

    #[error("the remote path does not exist")]
    NotFound,

    #[error("the server refused permission")]
    PermissionDenied,

    /// A local filesystem call failed: the chosen directory is not writable,
    /// the disk is full, or similar. Never the remote server's fault.
    #[error("the local filesystem refused the operation")]
    LocalIo,

    /// Every other SFTP-level failure: a bad packet, a status code with no
    /// more specific meaning here, a timeout waiting for a reply. Named once
    /// rather than per protocol detail, since none of those details are
    /// actionable by a user and every one of them already gets bubbled up as
    /// a bug report if it turns out to matter.
    #[error("the SFTP protocol failed")]
    Protocol,

    #[error("the transfer was cancelled")]
    Cancelled,
}

impl From<ConnectionError> for SftpError {
    fn from(_: ConnectionError) -> Self {
        Self::NotConnected
    }
}

impl From<std::io::Error> for SftpError {
    /// From reading or writing through `russh_sftp`'s own `File`, which
    /// speaks the SFTP protocol underneath a `tokio::io` interface. Distinct
    /// from `LocalIo`, which every call this module makes against this
    /// machine's own filesystem reports explicitly instead of routing
    /// through this conversion.
    fn from(_: std::io::Error) -> Self {
        Self::Protocol
    }
}

impl From<russh_sftp::client::error::Error> for SftpError {
    fn from(error: russh_sftp::client::error::Error) -> Self {
        use russh_sftp::client::error::Error as ClientError;
        use russh_sftp::protocol::StatusCode;

        match error {
            ClientError::Status(status) => match status.status_code {
                StatusCode::NoSuchFile => Self::NotFound,
                StatusCode::PermissionDenied => Self::PermissionDenied,
                _ => Self::Protocol,
            },
            _ => Self::Protocol,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_status_code_maps_to_the_specific_error_it_names() {
        use russh_sftp::client::error::Error as ClientError;
        use russh_sftp::protocol::{Status, StatusCode};

        let status = |code| {
            ClientError::Status(Status {
                id: 0,
                status_code: code,
                error_message: String::new(),
                language_tag: String::new(),
            })
        };

        assert_eq!(
            SftpError::from(status(StatusCode::NoSuchFile)),
            SftpError::NotFound
        );
        assert_eq!(
            SftpError::from(status(StatusCode::PermissionDenied)),
            SftpError::PermissionDenied
        );
        assert_eq!(
            SftpError::from(status(StatusCode::Failure)),
            SftpError::Protocol
        );
    }

    #[test]
    fn a_refused_name_carries_which_check_failed() {
        assert_eq!(
            SftpError::from(PathError::DotEntry),
            SftpError::RefusedName(PathError::DotEntry)
        );
    }
}
