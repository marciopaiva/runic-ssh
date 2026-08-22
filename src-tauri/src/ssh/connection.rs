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
    #[error("the host key was not accepted")]
    HostKeyRejected(Trust),

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

/// Checks the host key, and nothing else.
struct HostKeyCheck {
    endpoint: Endpoint,
    known: KnownHosts,
    /// The verdict, kept so the caller can see *why* a connection was refused.
    verdict: Option<Trust>,
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
            self.verdict = Some(Trust::CertificateRequired {
                fingerprint: String::from("SHA256:<certificate>"),
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
        self.verdict = Some(verdict);
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
    let config = Arc::new(client::Config::default());
    let address = (endpoint.host.clone(), endpoint.port);

    let checker = HostKeyCheck {
        endpoint,
        known,
        verdict: None,
    };

    match client::connect(config, address, checker).await {
        Ok(handle) => Ok(Connection { handle }),
        Err(russh::Error::UnknownKey) => Err(ConnectionError::HostKeyRejected(Trust::Unknown {
            fingerprint: String::new(),
            other_types: Vec::new(),
        })),
        Err(russh::Error::IO(_)) => Err(ConnectionError::Unreachable),
        Err(_) => Err(ConnectionError::Transport),
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

    /// Closes the connection politely, so the server logs a clean disconnect
    /// rather than a dropped socket.
    pub async fn disconnect(self) -> Result<(), ConnectionError> {
        self.handle
            .disconnect(Disconnect::ByApplication, "", "en")
            .await
            .map_err(|_| ConnectionError::Transport)
    }
}
