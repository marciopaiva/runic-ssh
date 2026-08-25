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

/// Which host in a chain something happened to.
///
/// Exists because "connection refused" is useless when two hosts are involved:
/// the user cannot tell whether the bastion is down or the host behind it is,
/// and those call for opposite reactions. A direct connection is always
/// [`Hop::Target`], so nothing has to special-case the ordinary case.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Hop {
    /// The host the user asked for.
    #[default]
    Target,
    /// The host being reached through, on the way to the target.
    Bastion,
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

/// How long a connection may take to reach an open, authenticated-ready state.
///
/// russh sets no timeout of any kind: `client::Config::default()` leaves
/// `inactivity_timeout` at `None`, and the TCP connect inherits the kernel's,
/// which on Linux is roughly two minutes of SYN retries. Worse, a host that
/// completes the TCP handshake and then stalls mid-protocol waits **forever** —
/// there is no retry budget to run out.
///
/// Twenty seconds covers a slow link and a busy server with room to spare, and
/// is far inside the point where a person decides the application has hung.
/// Deliberately not applied to the session once it is open: this is a client
/// people leave connected and idle for hours, and an inactivity timeout there
/// would close the terminal they walked away from.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Debug, thiserror::Error)]
pub enum ConnectionError {
    #[error("the host could not be reached")]
    Unreachable,

    /// The host did not finish connecting inside [`CONNECT_TIMEOUT`].
    ///
    /// Distinct from [`Unreachable`](Self::Unreachable) because the two are not
    /// the same event and must not read as if they were: nothing answering at a
    /// port is a host that is down or a port that is wrong, while a timeout is
    /// most often a host that answered and then stopped talking — a firewall
    /// swallowing the reply, or a server too loaded to finish the handshake.
    #[error("the host did not answer in time")]
    TimedOut,

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
    /// Which host in the chain offered it. The prompt has to say so: two
    /// fingerprint screens in a row, for two different hosts, are the same
    /// screen to anybody not told otherwise.
    pub hop: Hop,
}

/// Checks the host key, and nothing else.
struct HostKeyCheck {
    endpoint: Endpoint,
    known: KnownHosts,
    hop: Hop,
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
                hop: self.hop,
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
            hop: self.hop,
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

/// A connection several sessions may ride at once.
///
/// The mutex is what authentication needs and nothing else does: `russh` takes
/// `&mut self` only for the authenticate calls, and `&self` for opening
/// channels, pinging and disconnecting. So a connection is exclusive for as
/// long as it is proving who it is, and shared for the rest of its life, which
/// is exactly when it becomes useful as a bastion. ADR-0024.
///
/// `None` inside means the connection has been taken to be closed.
pub type Shared = Arc<tokio::sync::Mutex<Option<Connection>>>;

/// Wraps a connection so it can be shared.
pub fn share(connection: Connection) -> Shared {
    Arc::new(tokio::sync::Mutex::new(Some(connection)))
}

/// A connection whose host key was trusted, before authentication.
pub struct Connection {
    handle: Handle<HostKeyCheck>,
    /// The bastion this session is carried on, when there is one.
    ///
    /// A share rather than sole ownership, since ADR-0024. The argument of
    /// ADR-0023 survives it: the channel dies with the connection carrying it,
    /// so the bastion has to outlive this session, and holding a share is what
    /// guarantees that. What changed is that several sessions may hold one, and
    /// the count rather than a single holder decides when it closes.
    via: Option<Shared>,
}

/// A chain that could not be completed, handing the bastion back.
///
/// The bastion is returned rather than dropped so the caller closes it
/// politely. Dropping it here would leave the server logging a broken socket
/// for a connection that was opened correctly and simply had nowhere to go.
pub struct ChainFailure {
    pub bastion: Shared,
    pub error: ConnectionError,
    pub offered: Option<OfferedKey>,
}

/// Opens a connection and verifies the host key.
///
/// Fails when the key is anything but already trusted, carrying the verdict.
pub async fn connect(endpoint: Endpoint, known: KnownHosts) -> Result<Connection, ConnectionError> {
    connect_reporting(endpoint, known)
        .await
        .map_err(|(error, _)| error)
}

/// [`connect`], with the timeout named by the caller.
///
/// Exists so the timeout can be *tested* rather than trusted. A test that
/// proves a stalled handshake gives up has to wait for it, and waiting
/// [`CONNECT_TIMEOUT`] would put twenty seconds on every CI run — so the
/// duration is a parameter here and a constant at the one call site that
/// matters.
pub async fn connect_within(
    endpoint: Endpoint,
    known: KnownHosts,
    timeout: Duration,
) -> Result<Connection, ConnectionError> {
    connect_reporting_within(endpoint, known, timeout)
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
    connect_reporting_within(endpoint, known, CONNECT_TIMEOUT).await
}

/// [`connect_reporting`], with the timeout named by the caller. See
/// [`connect_within`] for why that is a parameter at all.
pub async fn connect_reporting_within(
    endpoint: Endpoint,
    known: KnownHosts,
    timeout: Duration,
) -> Result<Connection, (ConnectionError, Option<OfferedKey>)> {
    let config = Arc::new(client::Config::default());
    let address = (endpoint.host.clone(), endpoint.port);
    let offered = Arc::new(std::sync::Mutex::new(None));

    let checker = HostKeyCheck {
        endpoint,
        known,
        hop: Hop::Target,
        offered: Arc::clone(&offered),
    };

    let attempt = tokio::time::timeout(timeout, client::connect(config, address, checker));

    settle(attempt.await, &offered)
        .map(|handle| Connection { handle, via: None })
        .map_err(|refusal| *refusal)
}

/// Turns a finished attempt into a handle or a verdict.
///
/// Shared by the direct and the chained path on purpose. This is where an
/// unknown host key becomes a refusal the caller can act on, and rule 3 having
/// two implementations is rule 3 having two chances to drift.
fn settle(
    outcome: Result<Result<Handle<HostKeyCheck>, russh::Error>, tokio::time::error::Elapsed>,
    offered: &Arc<std::sync::Mutex<Option<OfferedKey>>>,
) -> Result<Handle<HostKeyCheck>, Box<(ConnectionError, Option<OfferedKey>)>> {
    let taken = || offered.lock().ok().and_then(|mut slot| slot.take());

    let refused = |error, seen| Err(Box::new((error, seen)));

    match outcome {
        /* The timeout fires and the future is dropped, which closes the socket
        with it. Nothing is left running for the two minutes the kernel would
        otherwise spend, and nothing is left half-negotiated on the server. */
        Err(_elapsed) => refused(ConnectionError::TimedOut, taken()),
        Ok(Ok(handle)) => Ok(handle),
        Ok(Err(russh::Error::UnknownKey)) => {
            let seen = taken();
            let verdict = seen.as_ref().map_or(
                Trust::Unknown {
                    fingerprint: String::new(),
                    other_types: Vec::new(),
                },
                |offered| offered.verdict.clone(),
            );
            refused(ConnectionError::HostKeyRejected(Box::new(verdict)), seen)
        }
        Ok(Err(russh::Error::IO(_))) => refused(ConnectionError::Unreachable, None),
        Ok(Err(_)) => refused(ConnectionError::Transport, taken()),
    }
}

/// Opens a session on a host reachable only through `bastion`.
///
/// The bastion must already be authenticated: a `direct-tcpip` request on a
/// connection that has not authenticated is refused, which is the constraint
/// ADR-0023 is built around.
///
/// The far session is an ordinary [`Connection`] whose transport is a channel.
/// Its key exchange and its authentication run end to end with the far host, so
/// the bastion forwards ciphertext it cannot read and never sees the far
/// credential. That is the property the `ssh -A` pattern this replaces did not
/// have.
pub async fn connect_via(
    bastion: Shared,
    endpoint: Endpoint,
    known: KnownHosts,
) -> Result<Connection, ChainFailure> {
    connect_via_within(bastion, endpoint, known, CONNECT_TIMEOUT).await
}

/// [`connect_via`], with the timeout named by the caller. See
/// [`connect_within`] for why that is a parameter at all.
///
/// The budget is per hop rather than for the chain, so a failure can say which
/// host ran out of time. The cost is that a chain where both hops stall takes
/// twice this long to fail, and ADR-0023 accepts that.
pub async fn connect_via_within(
    bastion: Shared,
    endpoint: Endpoint,
    known: KnownHosts,
    timeout: Duration,
) -> Result<Connection, ChainFailure> {
    /* The bastion is held only while the channel is being opened, which is one
    round trip. Holding it for the far handshake as well would make every chain
    through one bastion wait on the slowest of them. */
    let opened = {
        let held = bastion.lock().await;
        match held.as_ref() {
            /* Taken to be closed while this was waiting its turn. */
            None => Err(ConnectionError::Transport),
            Some(carrier) => carrier.open_forward(&endpoint).await,
        }
    };

    let channel = match opened {
        Ok(channel) => channel,
        Err(error) => {
            return Err(ChainFailure {
                bastion,
                error,
                offered: None,
            })
        }
    };

    let config = Arc::new(client::Config::default());
    let offered = Arc::new(std::sync::Mutex::new(None));

    let checker = HostKeyCheck {
        endpoint,
        known,
        hop: Hop::Target,
        offered: Arc::clone(&offered),
    };

    let attempt = tokio::time::timeout(
        timeout,
        client::connect_stream(config, channel.into_stream(), checker),
    );

    match settle(attempt.await, &offered) {
        Ok(handle) => Ok(Connection {
            handle,
            via: Some(bastion),
        }),
        Err(refusal) => {
            let (error, offered) = *refusal;
            Err(ChainFailure {
                bastion,
                error,
                offered,
            })
        }
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
        &self,
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

    /// Opens a forwarded connection to `endpoint`, from this host.
    ///
    /// The primitive a chain is built on, and the one local port forwarding
    /// will need. Takes `&self`, which is what makes a bastion shareable:
    /// several sessions may open a channel on one connection at once.
    ///
    /// The originator is loopback rather than this machine's own address. The
    /// bastion has no use for it, it is written to the bastion's log, and it
    /// describes a network the user did not offer to describe.
    pub async fn open_forward(
        &self,
        endpoint: &Endpoint,
    ) -> Result<russh::Channel<russh::client::Msg>, ConnectionError> {
        self.handle
            .channel_open_direct_tcpip(
                endpoint.host.clone(),
                u32::from(endpoint.port),
                "127.0.0.1",
                0,
            )
            .await
            /* The bastion would not open the channel. That is the far host
            being unreachable *from the bastion*, and it is also exactly what a
            bastion with `AllowTcpForwarding no` looks like. The two are
            indistinguishable from here, so this says the thing that is true of
            both. */
            .map_err(|_| ConnectionError::Unreachable)
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
    pub async fn round_trip(&self) -> Result<Duration, ConnectionError> {
        let sent = Instant::now();

        self.handle
            .send_ping()
            .await
            .map_err(|_| ConnectionError::Transport)?;

        Ok(sent.elapsed())
    }

    /// Closes the connection politely, so the server logs a clean disconnect
    /// rather than a dropped socket.
    ///
    /// A chain closes from the far end in. The far session goes first, and the
    /// share of the bastion is let go afterwards, which closes it only if
    /// nothing else is riding it. That is [`close_shared`], and it is where
    /// ADR-0024's count does the remembering.
    pub async fn disconnect(self) -> Result<(), ConnectionError> {
        let Self { handle, via } = self;

        let closed = handle
            .disconnect(Disconnect::ByApplication, "", "en")
            .await
            .map_err(|_| ConnectionError::Transport);

        /* Let go of the bastion after the session it carried, and only then.
        A bastion serving five other sessions must survive this; one serving
        nobody must not be left holding a slot against the server's
        `MaxSessions` that no handle can reach. */
        if let Some(bastion) = via {
            let _ = Box::pin(close_shared(bastion)).await;
        }

        closed
    }

    /// Whether this session is carried on a bastion.
    pub fn is_chained(&self) -> bool {
        self.via.is_some()
    }
}

/// Lets go of a share, closing the connection if it was the last.
///
/// The whole of ADR-0024's lifetime rule, in one function. A connection several
/// sessions ride is closed by whichever of them leaves last, and none of them
/// has to know whether it is the last: the count knows.
pub async fn close_shared(shared: Shared) -> Result<(), ConnectionError> {
    let Ok(held) = Arc::try_unwrap(shared) else {
        /* Somebody is still riding it. Letting go of our share is the whole of
        closing, here. */
        return Ok(());
    };

    match held.into_inner() {
        Some(connection) => Box::pin(connection.disconnect()).await,
        /* Already taken to be closed by whoever held it before. */
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_hop_crosses_as_the_word_the_frontend_narrows_to() {
        /* Renaming a variant compiles on both sides and leaves a host key
        prompt that quietly stops saying which host it is asking about,
        which is the one thing that screen exists to do. Pinned as a
        literal here and in `src/ipc/errors.ts`. */
        assert_eq!(
            serde_json::to_string(&Hop::Target).expect("serializes"),
            r#""target""#
        );
        assert_eq!(
            serde_json::to_string(&Hop::Bastion).expect("serializes"),
            r#""bastion""#
        );
    }

    #[test]
    fn a_direct_connection_is_the_default_hop() {
        /* So nothing has to special-case the ordinary case, and a hop that was
        forgotten reads as the host the user asked for rather than as a
        bastion that does not exist. */
        assert_eq!(Hop::default(), Hop::Target);
    }
}
