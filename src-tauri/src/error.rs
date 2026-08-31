//! The error contract.
//!
//! Two types, deliberately. [`Error`] is what the domain modules raise and
//! carries whatever context is useful internally, including the underlying I/O
//! failure. [`IpcError`] is what crosses to the webview, and it carries a code
//! plus fields we declared on purpose — never a formatted sentence.
//!
//! That split is what makes rule 2 of `docs/security-model.md` structural. A
//! core that never builds a sentence cannot interpolate a secret into one, and
//! the frontend renders the message from its own catalogue against the code.
//! See ADR-0007.

use std::path::{Path, PathBuf};

use serde::Serialize;

#[cfg(test)]
use crate::config::Settings;

/// A failure inside the core.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("the platform configuration directory could not be resolved")]
    ConfigDirUnavailable,

    #[error("could not read the settings file")]
    SettingsUnreadable {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("the settings file is not valid JSON")]
    SettingsMalformed {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },

    #[error("could not write the settings file")]
    SettingsUnwritable {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("the locale tag is not acceptable")]
    InvalidLocale { requested: String },

    #[error("the SSH connection failed")]
    Ssh(#[from] Box<crate::ssh::connection::ConnectionError>),

    #[error("the SFTP operation failed")]
    Sftp(#[from] Box<crate::sftp::error::SftpError>),

    #[error("no saved session has that id")]
    UnknownSession { id: String },

    #[error("the jump host cannot be used")]
    InvalidProxyJump {
        problem: crate::config::sessions::ProxyJumpProblem,
    },

    /// Another saved session already names this exact host, port and user.
    /// `name` is that session's, so the refusal can say which one.
    #[error("another saved session already reaches this host")]
    DuplicateSession { name: String },

    /// A chain failed, and this says at which host. See [`Hop`].
    ///
    /// A wrapper rather than a field on every variant: "connection refused" is
    /// the same sentence whichever host refused, and the difference the user
    /// needs is which one it was.
    ///
    /// [`Hop`]: crate::ssh::connection::Hop
    #[error("the connection failed at one hop of a chain")]
    Chain {
        hop: crate::ssh::connection::Hop,
        #[source]
        inner: Box<Error>,
    },

    #[error("that connection is not open")]
    UnknownHandle,

    #[error("both a password and a private key were sent")]
    AmbiguousCredential,

    #[error("no credential was sent")]
    MissingCredential,

    #[error("the webview sent something malformed")]
    MalformedInput,

    #[error("the input is larger than the core will forward")]
    InputTooLarge,

    #[error("that connection already has a shell")]
    TerminalAlreadyOpen,

    #[error("the session is missing or malformed")]
    InvalidSession { field: String },

    #[error("that decision is not waiting on an answer")]
    UnknownDecision,

    #[error("that key was already accepted or refused")]
    NotAwaitingDecision,

    #[error("the file marks this key as revoked")]
    HostKeyRevoked,

    #[error("this host authenticates with a certificate, not a bare key")]
    HostKeyCertificateRequired,

    #[error("the host name typed back does not match")]
    ConfirmationMismatch,

    #[error("this machine has no credential store")]
    KeychainUnavailable { reason: String },

    #[error("the credential store refused a read")]
    KeychainReadFailed { reason: String },

    #[error("the credential store refused a write")]
    KeychainWriteFailed { reason: String },

    #[error("no credential is saved for this session")]
    NoSavedCredential,

    /// ADR-0035. The internal vault exists but this session has not unlocked
    /// it yet: nothing has asked for a credential it holds since launch.
    #[error("the internal vault is locked")]
    VaultLocked,

    /// ADR-0035. Asked to unlock or migrate a vault that was never enabled.
    #[error("the internal vault has not been set up")]
    VaultNotConfigured,

    /// ADR-0035. The master password did not open the verifier. Kept apart
    /// from [`Error::VaultUnreadable`] because the remedy differs: type it
    /// again, versus reset the vault.
    #[error("that password did not unlock the internal vault")]
    VaultWrongPassword,

    #[error("the internal vault could not be read")]
    VaultUnreadable { reason: String },

    #[error("the internal vault could not be written")]
    VaultUnwritable { reason: String },

    #[error("no credential request has that id")]
    UnknownRequest,

    /// The wizard's own bastion prompt (ADR-0033) was cancelled. Deliberately
    /// an error rather than a silent retry: a dismissed prompt fails the
    /// connection attempt, because retrying on its own is how a client ends up
    /// asking for a password nobody asked to be asked for.
    #[error("the credential prompt was dismissed")]
    CredentialDismissed,

    /// A window control we drew could not do what it was asked. Reported
    /// rather than dropped: a control that fails silently is indistinguishable
    /// from one that was never wired up, which is how a window nobody could
    /// close went unnoticed.
    #[error("the window refused the action")]
    WindowActionRefused,
}

/// A failure as the webview sees it: a code, and the fields it needs to render
/// a message of its own.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "code", rename_all = "camelCase")]
pub enum IpcError {
    ConfigDirUnavailable,
    SettingsUnreadable {
        path: String,
    },
    SettingsMalformed {
        path: String,
    },
    SettingsUnwritable {
        path: String,
    },
    InvalidLocale {
        requested: String,
    },

    /// The host could not be reached at all.
    HostUnreachable,
    /// The host did not finish connecting inside the client's own timeout.
    /// Separate from `HostUnreachable` because the host usually *did* answer:
    /// see `ssh::connection::CONNECT_TIMEOUT` and ADR-0016.
    ConnectTimedOut,
    /// The host key is not trusted. `verdict` names which of the five outcomes
    /// it was, so the interface can prompt, block or explain — the fingerprints
    /// travel with it because the user has to compare them by eye.
    HostKeyRejected {
        verdict: &'static str,
        offered: Option<String>,
        stored: Vec<String>,
    },
    /// The private key could not be decoded, most often a wrong passphrase.
    KeyUnreadable,
    /// An RSA private key was offered and refused. See ADR-0010.
    RsaKeyRefused,
    /// The server refused the credential.
    AuthenticationFailed,
    /// The transport failed for a reason we do not classify further.
    SshTransport,
    /// The session id does not name anything saved.
    UnknownSession {
        id: String,
    },
    /// The jump host a session names cannot be used. `problem` says which of
    /// the four ways, because they need different things from the reader: pick
    /// another, restore the one that is gone, or shorten a chain from whichever
    /// end is being edited.
    InvalidProxyJump {
        problem: &'static str,
    },
    /// Another saved session already reaches this exact host, port and user.
    /// `name` is that session's own name.
    DuplicateSession {
        name: String,
    },
    /// A failure that happened at one hop of a chain. `hop` names which host
    /// it happened at; `inner` is the failure itself.
    ///
    /// Additive: a caller that does not know this code falls through to the
    /// generic failure, which is what it did before chains existed.
    ChainFailed {
        hop: crate::ssh::connection::Hop,
        inner: Box<IpcError>,
    },
    /// The handle does not name an open connection.
    UnknownHandle,
    /// The webview sent both a password and a key, or neither.
    AmbiguousCredential,
    MissingCredential,
    MalformedInput,
    InputTooLarge,
    /// A second shell was asked for on a connection that already has one.
    ///
    /// Unreachable while the frontend keeps one terminal mounted per session
    /// (ADR-0014), which is why it carries no dedicated copy: the user should
    /// never meet it, and it falls through to the generic failure text.
    TerminalAlreadyOpen,
    /// A host key needs a decision. `pending` names it; `inner` says which of
    /// the five outcomes it was and carries the fingerprints to compare.
    HostKeyDecision {
        pending: crate::ssh::pending::PendingId,
        inner: Box<IpcError>,
    },
    UnknownDecision,
    NotAwaitingDecision,
    HostKeyRevoked,
    HostKeyCertificateRequired,
    ConfirmationMismatch,
    /// This machine has no credential store. `reason` is a fixed phrase, never
    /// the platform's own text — see `vault::describe`.
    KeychainUnavailable {
        reason: String,
    },
    KeychainReadFailed {
        reason: String,
    },
    KeychainWriteFailed {
        reason: String,
    },
    NoSavedCredential,
    /// ADR-0035: the internal vault exists but this session has not unlocked
    /// it yet.
    VaultLocked,
    /// ADR-0035: asked to unlock or migrate a vault that was never enabled.
    VaultNotConfigured,
    /// ADR-0035: the master password did not open the verifier.
    VaultWrongPassword,
    VaultUnreadable {
        reason: String,
    },
    VaultUnwritable {
        reason: String,
    },
    /// The request id does not name a prompt that is still open.
    UnknownRequest,
    /// The user closed or cancelled the prompt. The connection attempt fails;
    /// it is never retried on its own.
    CredentialDismissed,
    /// A window control we drew could not do what it was asked.
    WindowActionRefused,
    /// A saved session was rejected; `field` names which part.
    InvalidSession {
        field: String,
    },
    /// The SFTP channel or subsystem could not be opened.
    SftpNotConnected,
    /// A remote name failed `sftp::path::check_name` before it was let
    /// anywhere near a local write or a rendered listing. `check` names
    /// which of the five checks it failed, the same shape `InvalidProxyJump`
    /// already uses `problem` for: a code the frontend's own catalogue
    /// writes a sentence from, never a sentence written on this side.
    SftpNameRefused {
        check: &'static str,
    },
    SftpNotFound,
    SftpPermissionDenied,
    /// A local filesystem call failed: the chosen directory is not
    /// writable, the disk is full, or similar. Never the remote server's
    /// fault.
    SftpLocalIoFailed,
    /// Every other SFTP-level failure, named once rather than per protocol
    /// detail: see `sftp::error::SftpError::Protocol`.
    SftpProtocolFailed,
    SftpTransferCancelled,
}

/// Paths are shown to the user so they can find the file; the rest of the
/// path is not ours to guess at, so it crosses as it is.
fn shown(path: &Path) -> String {
    path.display().to_string()
}

impl From<Error> for IpcError {
    /// Maps a domain failure to its wire form.
    ///
    /// The `#[source]` chain is deliberately dropped rather than flattened into
    /// a string. It is the part that would carry an operating system message we
    /// did not write and cannot audit, and it is exactly how a value nobody
    /// meant to expose ends up in a toast.
    fn from(error: Error) -> Self {
        match error {
            Error::ConfigDirUnavailable => Self::ConfigDirUnavailable,
            Error::SettingsUnreadable { path, .. } => {
                Self::SettingsUnreadable { path: shown(&path) }
            }
            Error::SettingsMalformed { path, .. } => Self::SettingsMalformed { path: shown(&path) },
            Error::SettingsUnwritable { path, .. } => {
                Self::SettingsUnwritable { path: shown(&path) }
            }
            Error::InvalidLocale { requested } => Self::InvalidLocale { requested },
            Error::Ssh(ssh) => Self::from(*ssh),
            Error::Sftp(sftp) => Self::from(*sftp),
            Error::UnknownSession { id } => Self::UnknownSession { id },
            Error::InvalidProxyJump { problem } => Self::InvalidProxyJump {
                problem: match problem {
                    crate::config::sessions::ProxyJumpProblem::Itself => "itself",
                    crate::config::sessions::ProxyJumpProblem::Unknown => "unknown",
                    crate::config::sessions::ProxyJumpProblem::Chained => "chained",
                    crate::config::sessions::ProxyJumpProblem::Serving => "serving",
                },
            },
            Error::DuplicateSession { name } => Self::DuplicateSession { name },
            Error::Chain { hop, inner } => Self::ChainFailed {
                hop,
                inner: Box::new(Self::from(*inner)),
            },
            Error::UnknownHandle => Self::UnknownHandle,
            Error::AmbiguousCredential => Self::AmbiguousCredential,
            Error::MissingCredential => Self::MissingCredential,
            Error::MalformedInput => Self::MalformedInput,
            Error::InputTooLarge => Self::InputTooLarge,
            Error::TerminalAlreadyOpen => Self::TerminalAlreadyOpen,
            Error::InvalidSession { field } => Self::InvalidSession { field },
            Error::UnknownDecision => Self::UnknownDecision,
            Error::NotAwaitingDecision => Self::NotAwaitingDecision,
            Error::HostKeyRevoked => Self::HostKeyRevoked,
            Error::HostKeyCertificateRequired => Self::HostKeyCertificateRequired,
            Error::ConfirmationMismatch => Self::ConfirmationMismatch,
            Error::KeychainUnavailable { reason } => Self::KeychainUnavailable { reason },
            Error::KeychainReadFailed { reason } => Self::KeychainReadFailed { reason },
            Error::KeychainWriteFailed { reason } => Self::KeychainWriteFailed { reason },
            Error::NoSavedCredential => Self::NoSavedCredential,
            Error::VaultLocked => Self::VaultLocked,
            Error::VaultNotConfigured => Self::VaultNotConfigured,
            Error::VaultWrongPassword => Self::VaultWrongPassword,
            Error::VaultUnreadable { reason } => Self::VaultUnreadable { reason },
            Error::VaultUnwritable { reason } => Self::VaultUnwritable { reason },
            Error::UnknownRequest => Self::UnknownRequest,
            Error::CredentialDismissed => Self::CredentialDismissed,
            Error::WindowActionRefused => Self::WindowActionRefused,
        }
    }
}

impl From<Box<crate::ssh::connection::ConnectionError>> for IpcError {
    fn from(error: Box<crate::ssh::connection::ConnectionError>) -> Self {
        Self::from(*error)
    }
}

impl From<crate::ssh::connection::ConnectionError> for IpcError {
    /// Maps a connection failure to its wire form.
    ///
    /// The `russh` error is dropped rather than described. It is text we did
    /// not write and cannot audit, and it is the value most likely to carry
    /// something from a server we do not trust — a banner, a path, a reason
    /// string — straight into a toast. Rule 2.
    fn from(error: crate::ssh::connection::ConnectionError) -> Self {
        use crate::ssh::connection::ConnectionError as Ssh;
        use crate::ssh::trust::Trust;

        match error {
            Ssh::Unreachable => Self::HostUnreachable,
            Ssh::TimedOut => Self::ConnectTimedOut,
            Ssh::KeyUnreadable => Self::KeyUnreadable,
            Ssh::RsaKeyRefused => Self::RsaKeyRefused,
            Ssh::AuthenticationFailed => Self::AuthenticationFailed,
            Ssh::Transport => Self::SshTransport,
            Ssh::HostKeyRejected(verdict) => match *verdict {
                Trust::Matched => Self::SshTransport,
                Trust::Unknown { fingerprint, .. } => Self::HostKeyRejected {
                    verdict: "unknown",
                    offered: Some(fingerprint),
                    stored: Vec::new(),
                },
                Trust::Changed {
                    offered, stored, ..
                } => Self::HostKeyRejected {
                    verdict: "changed",
                    offered: Some(offered),
                    stored,
                },
                Trust::Revoked { fingerprint } => Self::HostKeyRejected {
                    verdict: "revoked",
                    offered: Some(fingerprint),
                    stored: Vec::new(),
                },
                Trust::CertificateRequired { fingerprint } => Self::HostKeyRejected {
                    verdict: "certificateRequired",
                    offered: Some(fingerprint),
                    stored: Vec::new(),
                },
            },
        }
    }
}

impl From<Box<crate::sftp::error::SftpError>> for IpcError {
    fn from(error: Box<crate::sftp::error::SftpError>) -> Self {
        Self::from(*error)
    }
}

impl From<crate::sftp::error::SftpError> for IpcError {
    /// Maps an SFTP failure to its wire form.
    ///
    /// `SftpNameRefused`'s `check` is one of `sftp::path::PathError`'s own
    /// five shapes, named rather than formatted: `PathError` already writes a
    /// safe sentence for a human, and this is the frontend's own catalogue
    /// doing the same job in whichever locale is active, from a code rather
    /// than from a string this side wrote.
    fn from(error: crate::sftp::error::SftpError) -> Self {
        use crate::sftp::error::SftpError as Sftp;
        use crate::sftp::path::PathError;

        match error {
            Sftp::NotConnected => Self::SftpNotConnected,
            Sftp::RefusedName(check) => Self::SftpNameRefused {
                check: match check {
                    PathError::Empty => "empty",
                    PathError::TooLong => "tooLong",
                    PathError::NotASingleSegment => "notASingleSegment",
                    PathError::DotEntry => "dotEntry",
                    PathError::ControlCharacter => "controlCharacter",
                },
            },
            Sftp::NotFound => Self::SftpNotFound,
            Sftp::PermissionDenied => Self::SftpPermissionDenied,
            Sftp::LocalIo => Self::SftpLocalIoFailed,
            Sftp::Protocol => Self::SftpProtocolFailed,
            Sftp::Cancelled => Self::SftpTransferCancelled,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wire(error: Error) -> serde_json::Value {
        serde_json::to_value(IpcError::from(error)).expect("an IPC error serializes")
    }

    #[test]
    fn every_variant_crosses_as_a_code() {
        let value = wire(Error::ConfigDirUnavailable);
        assert_eq!(value["code"], "configDirUnavailable");
    }

    #[test]
    fn declared_fields_cross_and_nothing_else() {
        let value = wire(Error::InvalidLocale {
            requested: "en_US".to_owned(),
        });

        assert_eq!(value["code"], "invalidLocale");
        assert_eq!(value["requested"], "en_US");
        assert_eq!(
            value.as_object().expect("an object").len(),
            2,
            "an IPC error carries its code and the fields we declared, nothing more"
        );
    }

    #[test]
    fn the_source_chain_never_crosses() {
        /* This is the rule that matters. The underlying failure carries an
        operating system message we did not write and cannot audit, and
        flattening it into a string is exactly how a value nobody meant to
        expose reaches a toast. Rule 2 of the security model. */
        let source = std::io::Error::new(std::io::ErrorKind::PermissionDenied, "hunter2");
        let value = wire(Error::SettingsUnreadable {
            path: std::path::PathBuf::from("/tmp/settings.json"),
            source,
        });

        let json = value.to_string();
        assert!(
            !json.contains("hunter2"),
            "the source message crossed the boundary: {json}"
        );
        assert_eq!(value["code"], "settingsUnreadable");
        assert_eq!(value["path"], "/tmp/settings.json");
    }

    #[test]
    fn no_variant_carries_a_sentence() {
        /* A message field would invite the core to build prose, which is what
        makes localisation impossible and redaction a habit rather than a
        property. ADR-0007. */
        for error in [
            Error::ConfigDirUnavailable,
            Error::InvalidLocale {
                requested: "x".to_owned(),
            },
            Error::SettingsMalformed {
                path: std::path::PathBuf::from("/tmp/s.json"),
                source: serde_json::from_str::<Settings>("{").expect_err("a parse failure"),
            },
        ] {
            let value = wire(error);
            for forbidden in ["message", "description", "detail", "reason"] {
                assert!(
                    value.get(forbidden).is_none(),
                    "an IPC error must not carry a {forbidden} field"
                );
            }
        }
    }

    #[test]
    fn an_sftp_failure_crosses_with_its_own_code() {
        use crate::sftp::error::SftpError;

        let value = wire(Error::Sftp(Box::new(SftpError::NotFound)));
        assert_eq!(value["code"], "sftpNotFound");
    }

    #[test]
    fn a_refused_name_crosses_with_which_check_failed_and_no_sentence() {
        use crate::sftp::error::SftpError;
        use crate::sftp::path::PathError;

        let value = wire(Error::Sftp(Box::new(SftpError::RefusedName(
            PathError::ControlCharacter,
        ))));

        assert_eq!(value["code"], "sftpNameRefused");
        assert_eq!(value["check"], "controlCharacter");
        for forbidden in ["message", "description", "detail", "reason"] {
            assert!(
                value.get(forbidden).is_none(),
                "an IPC error must not carry a {forbidden} field"
            );
        }
    }
}
