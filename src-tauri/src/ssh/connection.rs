//! Opening, authenticating and closing an SSH connection.
//!
//! Two rules from `docs/security-model.md` shape this module more than
//! anything else.
//!
//! **Rule 3.** The host key is checked before authentication is attempted, and
//! a connection whose key is not already trusted *fails*. There is no "accept
//! for this session" path through the transport: accepting a key means writing
//! it to `known_hosts` and connecting again. That costs one extra TCP
//! connection and removes every code path in which a session proceeds on a key
//! nobody trusted.
//!
//! **Rule 4.** Passwords and passphrases are held in [`Zeroizing`] and dropped
//! as soon as authentication returns. Once a secret is handed to `russh` its
//! lifetime belongs to `russh`; what we can guarantee is that our copy does not
//! outlive the call.

use std::sync::Arc;
use std::time::{Duration, Instant};

use russh::client::{self, Handle};
use russh::keys::{decode_secret_key, PrivateKeyWithHashAlg};
use russh::{ChannelId, Disconnect};
use zeroize::Zeroizing;

use crate::ssh::known_hosts::KnownHosts;
use crate::ssh::trust::{decide, Trust};

/// Where to connect, and under what identity the host key is checked.
#[derive(Debug, Clone)]
pub struct Endpoint {
    pub host: String,
    pub port: u16,
}

/// How to prove who we are.
///
/// Every field is [`Zeroizing`]: the value is wiped when this is dropped, which
/// is immediately after the authentication attempt.
pub enum Credential {
    Password(Zeroizing<String>),
    /// An OpenSSH private key, with the passphrase if it is encrypted.
    PrivateKey {
        pem: Zeroizing<String>,
        passphrase: Option<Zeroizing<String>>,
    },
}

impl std::fmt::Debug for Credential {
    /// Never prints the material. Rule 2: a `Debug` that leaks is the usual
    /// way a secret reaches a log nobody meant to write.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Password(_) => f.write_str("Credential::Password(<redacted>)"),
            Self::PrivateKey { passphrase, .. } => f.write_fmt(format_args!(
                "Credential::PrivateKey {{ pem: <redacted>, encrypted: {} }}",
                passphrase.is_some()
            )),
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ConnectionError {
    #[error("the host could not be reached")]
    Unreachable,

    /// The host key is not one we already trust. Carries the verdict so the
    /// caller can prompt, block, or refuse — see [`Trust`].
    /// Boxed because `Trust::Changed` carries both fingerprints and the key
    /// itself, and every caller of every connection call would otherwise pay
    /// that size on the success path too.
    #[error("the host key was not accepted")]
    HostKeyRejected(Box<Trust>),

    #[error("the private key could not be read")]
    KeyUnreadable,

    /// An RSA private key was offered. Refused deliberately: RUSTSEC-2023-0071
    /// is a timing attack on RSA private key operations with no fixed version
    /// available, and signing is the operation it reaches. Verifying an RSA
    /// *host* key is a public-key operation and stays supported.
    /// See ADR-0010.
    #[error("RSA private keys are refused while RUSTSEC-2023-0071 stands")]
    RsaKeyRefused,

    #[error("the server refused the credential")]
    AuthenticationFailed,

    #[error("the SSH transport failed")]
    Transport,
}

/// What a server offered, kept so a refusal can be acted on.
#[derive(Debug, Clone)]
pub struct OfferedKey {
    pub host: String,
    pub port: u16,
    pub key_type: String,
    pub key: Vec<u8>,
    pub verdict: Trust,
}

/// Checks the host key, and nothing else.
struct HostKeyCheck {
    endpoint: Endpoint,
    known: KnownHosts,
    /// What was offered and what we made of it, kept so the caller can see
    /// *why* a connection was refused and can act on it afterwards.
    offered: Arc<std::sync::Mutex<Option<OfferedKey>>>,
}

impl HostKeyCheck {
    fn remember(&self, offered: OfferedKey) {
        if let Ok(mut slot) = self.offered.lock() {
            *slot = Some(offered);
        }
    }
}

impl client::Handler for HostKeyCheck {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        key: &russh::keys::PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        let russh::keys::PublicKeyOrCertificate::PublicKey { key, .. } = key else {
            /* A certificate needs certificate verification, which we do not
            implement. Refusing is the only honest answer. */
            self.remember(OfferedKey {
                host: self.endpoint.host.clone(),
                port: self.endpoint.port,
                key_type: String::from("ssh-certificate"),
                key: Vec::new(),
                verdict: Trust::CertificateRequired {
                    fingerprint: String::from("SHA256:<certificate>"),
                },
            });
            return Ok(false);
        };

        let Ok(blob) = key.to_bytes() else {
            return Ok(false);
        };

        let verdict = decide(
            &self.known,
            &self.endpoint.host,
            self.endpoint.port,
            key.algorithm().as_str(),
            &blob,
        );

        let accepted = matches!(verdict, Trust::Matched);

        self.remember(OfferedKey {
            host: self.endpoint.host.clone(),
            port: self.endpoint.port,
            key_type: key.algorithm().as_str().to_owned(),
            key: blob,
            verdict,
        });

        Ok(accepted)
    }

    async fn data(
        &mut self,
        _channel: ChannelId,
        _data: &[u8],
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        Ok(())
    }
}

/// A connection whose host key was trusted, before authentication.
pub struct Connection {
    handle: Handle<HostKeyCheck>,
}

/// Opens a connection and verifies the host key.
///
/// Fails when the key is anything but already trusted, carrying the verdict.
pub async fn connect(endpoint: Endpoint, known: KnownHosts) -> Result<Connection, ConnectionError> {
    connect_reporting(endpoint, known)
        .await
        .map_err(|(error, _)| error)
}

/// Connects, and on a host key refusal hands back what was offered.
///
/// The caller needs the key itself, not only the verdict: accepting it later
/// means writing those exact bytes, and asking the server again would let a
/// different answer be written than the one the user was shown.
pub async fn connect_reporting(
    endpoint: Endpoint,
    known: KnownHosts,
) -> Result<Connection, (ConnectionError, Option<OfferedKey>)> {
    let config = Arc::new(client::Config::default());
    let address = (endpoint.host.clone(), endpoint.port);
    let offered = Arc::new(std::sync::Mutex::new(None));

    let checker = HostKeyCheck {
        endpoint,
        known,
        offered: Arc::clone(&offered),
    };

    let taken = || offered.lock().ok().and_then(|mut slot| slot.take());

    match client::connect(config, address, checker).await {
        Ok(handle) => Ok(Connection { handle }),
        Err(russh::Error::UnknownKey) => {
            let seen = taken();
            let verdict = seen.as_ref().map_or(
                Trust::Unknown {
                    fingerprint: String::new(),
                    other_types: Vec::new(),
                },
                |offered| offered.verdict.clone(),
            );
            Err((ConnectionError::HostKeyRejected(Box::new(verdict)), seen))
        }
        Err(russh::Error::IO(_)) => Err((ConnectionError::Unreachable, None)),
        Err(_) => Err((ConnectionError::Transport, taken())),
    }
}

impl Connection {
    /// Attempts authentication once. The credential is dropped, and wiped, on
    /// return whether it succeeded or not.
    pub async fn authenticate(
        &mut self,
        user: &str,
        credential: Credential,
    ) -> Result<(), ConnectionError> {
        let result = match &credential {
            Credential::Password(password) => self
                .handle
                .authenticate_password(user, password.as_str())
                .await
                .map_err(|_| ConnectionError::Transport)?,

            Credential::PrivateKey { pem, passphrase } => {
                let key = decode_secret_key(pem, passphrase.as_ref().map(|p| p.as_str()))
                    .map_err(|_| ConnectionError::KeyUnreadable)?;

                /* Refused before signing, which is the operation the attack
                reaches. Checked here rather than at the call site because
                this is the only place a private key is used. */
                if matches!(key.algorithm(), russh::keys::Algorithm::Rsa { .. }) {
                    return Err(ConnectionError::RsaKeyRefused);
                }

                let key = PrivateKeyWithHashAlg::new(Arc::new(key), None);

                self.handle
                    .authenticate_publickey(user, key)
                    .await
                    .map_err(|_| ConnectionError::Transport)?
            }
        };

        drop(credential);

        if result.success() {
            Ok(())
        } else {
            Err(ConnectionError::AuthenticationFailed)
        }
    }

    /// Opens an interactive shell with a pty of the given size.
    ///
    /// The pty is requested before the shell: a shell started without one has
    /// no terminal to draw on, and programs that check for one behave as if
    /// they were being piped.
    pub async fn open_shell(
        &mut self,
        columns: u16,
        rows: u16,
    ) -> Result<russh::Channel<russh::client::Msg>, ConnectionError> {
        let channel = self
            .handle
            .channel_open_session()
            .await
            .map_err(|_| ConnectionError::Transport)?;

        channel
            .request_pty(
                true,
                "xterm-256color",
                u32::from(columns),
                u32::from(rows),
                0,
                0,
                &[],
            )
            .await
            .map_err(|_| ConnectionError::Transport)?;

        channel
            .request_shell(true)
            .await
            .map_err(|_| ConnectionError::Transport)?;

        Ok(channel)
    }

    /// Measures the round trip to the host.
    ///
    /// Sends `keepalive@openssh.com` with `want_reply` set and times the
    /// answer. Every server replies to it — usually with REQUEST_FAILURE,
    /// because it does not recognise the request — and a reply is all this
    /// needs. That is the same mechanism OpenSSH's `ServerAliveInterval` uses,
    /// for the same reason.
    ///
    /// Worth knowing before calling this on a timer: a request the host has to
    /// answer is traffic, and traffic resets an idle timeout. Polling this
    /// keeps a session alive that would otherwise have been dropped by the
    /// server. That is usually what a user wants and never what they asked
    /// for, so the caller decides when to stop — see `should_probe` on the
    /// frontend side.
    pub async fn round_trip(&mut self) -> Result<Duration, ConnectionError> {
        let sent = Instant::now();

        self.handle
            .send_ping()
            .await
            .map_err(|_| ConnectionError::Transport)?;

        Ok(sent.elapsed())
    }

    /// Closes the connection politely, so the server logs a clean disconnect
    /// rather than a dropped socket.
    pub async fn disconnect(self) -> Result<(), ConnectionError> {
        self.handle
            .disconnect(Disconnect::ByApplication, "", "en")
            .await
            .map_err(|_| ConnectionError::Transport)
    }
}
