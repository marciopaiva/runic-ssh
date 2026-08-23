//! Authentication against a real SSH server.
//!
//! The server is `russh`'s own, run in process on a loopback port. That keeps
//! the test honest — a real key exchange, a real handshake, a real refusal —
//! without needing `sshd` on three platforms' CI runners.
//!
//! Every key here is generated in memory and never written anywhere, which is
//! also what section 7.4 asks of the application itself.

use std::sync::Arc;

use russh::keys::{encode_pkcs8_pem, encode_pkcs8_pem_encrypted, PrivateKey, PublicKey};
use russh::server::{Auth, ChannelOpenHandle, Handler as ServerHandler, Msg, Server as _, Session};
use russh::Channel;
use russh::MethodKind;
use zeroize::Zeroizing;

use runic_ssh::ssh::connection::{connect, connect_within, ConnectionError, Credential, Endpoint};
use runic_ssh::ssh::known_hosts::KnownHosts;
use runic_ssh::ssh::trust::Trust;

const USER: &str = "deploy";
const PASSWORD: &str = "correct horse battery staple";
const PASSPHRASE: &str = "a passphrase for the key";

#[derive(Clone)]
struct TestServer {
    authorized: Arc<PublicKey>,
}

impl russh::server::Server for TestServer {
    type Handler = Self;
    fn new_client(&mut self, _peer: Option<std::net::SocketAddr>) -> Self {
        self.clone()
    }
}

impl ServerHandler for TestServer {
    type Error = russh::Error;

    async fn auth_password(&mut self, user: &str, password: &str) -> Result<Auth, Self::Error> {
        if user == USER && password == PASSWORD {
            Ok(Auth::Accept)
        } else {
            Ok(Auth::Reject {
                proceed_with_methods: None,
                partial_success: false,
            })
        }
    }

    async fn auth_publickey(
        &mut self,
        user: &str,
        offered: &PublicKey,
    ) -> Result<Auth, Self::Error> {
        if user == USER && offered == self.authorized.as_ref() {
            Ok(Auth::Accept)
        } else {
            Ok(Auth::Reject {
                proceed_with_methods: None,
                partial_success: false,
            })
        }
    }

    async fn channel_open_session(
        &mut self,
        _channel: Channel<Msg>,
        _reply: ChannelOpenHandle,
        _session: &mut Session,
    ) -> Result<(), Self::Error> {
        Ok(())
    }
}

/// Starts a server on a loopback port and returns its address and host key.
async fn start_server(authorized: PublicKey) -> (u16, PublicKey) {
    let host_key =
        PrivateKey::random(&mut rng(), russh::keys::Algorithm::Ed25519).expect("a host key");
    let host_public = host_key.public_key().clone();

    let config = Arc::new(russh::server::Config {
        keys: vec![host_key],
        methods: [MethodKind::Password, MethodKind::PublicKey]
            .as_slice()
            .into(),
        ..Default::default()
    });

    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
        .await
        .expect("a loopback port");
    let port = listener.local_addr().expect("an address").port();

    let mut server = TestServer {
        authorized: Arc::new(authorized),
    };
    tokio::spawn(async move {
        let _ = server.run_on_socket(config, &listener).await;
    });

    (port, host_public)
}

/// Keys are generated in memory and never written anywhere, which is what
/// section 7.4 asks of the application itself.
fn rng() -> impl rand::CryptoRng {
    rand::rng()
}

/// A `known_hosts` that already trusts this server, so the connection may
/// proceed to authentication.
fn trusting(port: u16, host_public: &PublicKey) -> KnownHosts {
    let mut known = KnownHosts::default();
    known.add(KnownHosts::entry_for(
        "127.0.0.1",
        port,
        host_public.algorithm().as_str(),
        host_public.to_bytes().expect("the host key encodes"),
    ));
    known
}

fn endpoint(port: u16) -> Endpoint {
    Endpoint {
        host: "127.0.0.1".to_owned(),
        port,
    }
}

#[tokio::test]
async fn a_password_authenticates() {
    let client_key = PrivateKey::random(&mut rng(), russh::keys::Algorithm::Ed25519).unwrap();
    let (port, host_public) = start_server(client_key.public_key().clone()).await;

    let mut connection = connect(endpoint(port), trusting(port, &host_public))
        .await
        .expect("the host key is trusted, so the connection opens");

    connection
        .authenticate(
            USER,
            Credential::Password(Zeroizing::new(PASSWORD.to_owned())),
        )
        .await
        .expect("the password is accepted");

    connection.disconnect().await.expect("a clean disconnect");
}

#[tokio::test]
async fn a_wrong_password_is_refused() {
    let client_key = PrivateKey::random(&mut rng(), russh::keys::Algorithm::Ed25519).unwrap();
    let (port, host_public) = start_server(client_key.public_key().clone()).await;

    let mut connection = connect(endpoint(port), trusting(port, &host_public))
        .await
        .unwrap();

    let refused = connection
        .authenticate(
            USER,
            Credential::Password(Zeroizing::new("wrong".to_owned())),
        )
        .await;

    assert!(matches!(
        refused,
        Err(ConnectionError::AuthenticationFailed)
    ));
}

#[tokio::test]
async fn an_unencrypted_private_key_authenticates() {
    let client_key = PrivateKey::random(&mut rng(), russh::keys::Algorithm::Ed25519).unwrap();
    let (port, host_public) = start_server(client_key.public_key().clone()).await;

    let mut pem = Vec::new();
    encode_pkcs8_pem(&client_key, &mut pem).expect("the key encodes");

    let mut connection = connect(endpoint(port), trusting(port, &host_public))
        .await
        .unwrap();

    connection
        .authenticate(
            USER,
            Credential::PrivateKey {
                pem: Zeroizing::new(String::from_utf8(pem).expect("utf-8")),
                passphrase: None,
            },
        )
        .await
        .expect("the key is accepted");
}

#[tokio::test]
async fn an_encrypted_private_key_authenticates() {
    let client_key = PrivateKey::random(&mut rng(), russh::keys::Algorithm::Ed25519).unwrap();
    let (port, host_public) = start_server(client_key.public_key().clone()).await;

    let mut pem = Vec::new();
    encode_pkcs8_pem_encrypted(&client_key, PASSPHRASE.as_bytes(), 4, &mut pem)
        .expect("the key encrypts");

    let mut connection = connect(endpoint(port), trusting(port, &host_public))
        .await
        .unwrap();

    connection
        .authenticate(
            USER,
            Credential::PrivateKey {
                pem: Zeroizing::new(String::from_utf8(pem).expect("utf-8")),
                passphrase: Some(Zeroizing::new(PASSPHRASE.to_owned())),
            },
        )
        .await
        .expect("the encrypted key is accepted");
}

#[tokio::test]
async fn the_wrong_passphrase_fails_before_the_network() {
    let client_key = PrivateKey::random(&mut rng(), russh::keys::Algorithm::Ed25519).unwrap();
    let (port, host_public) = start_server(client_key.public_key().clone()).await;

    let mut pem = Vec::new();
    encode_pkcs8_pem_encrypted(&client_key, PASSPHRASE.as_bytes(), 4, &mut pem).unwrap();

    let mut connection = connect(endpoint(port), trusting(port, &host_public))
        .await
        .unwrap();

    let refused = connection
        .authenticate(
            USER,
            Credential::PrivateKey {
                pem: Zeroizing::new(String::from_utf8(pem).unwrap()),
                passphrase: Some(Zeroizing::new("not the passphrase".to_owned())),
            },
        )
        .await;

    /* A key we cannot read is our failure, not the server's, and saying so
    lets the interface ask for the passphrase again rather than claiming the
    server rejected the user. */
    assert!(matches!(refused, Err(ConnectionError::KeyUnreadable)));
}

#[tokio::test]
async fn an_untrusted_host_key_stops_the_connection_before_authentication() {
    /* Rule 3. There is no "accept for this session": the connection fails, and
    accepting means writing the key down and connecting again. */
    let client_key = PrivateKey::random(&mut rng(), russh::keys::Algorithm::Ed25519).unwrap();
    let (port, _host_public) = start_server(client_key.public_key().clone()).await;

    let refused = connect(endpoint(port), KnownHosts::default()).await;

    assert!(
        matches!(refused, Err(ConnectionError::HostKeyRejected(_))),
        "an unknown host key must refuse the connection"
    );
}

#[tokio::test]
async fn a_changed_host_key_stops_the_connection() {
    let client_key = PrivateKey::random(&mut rng(), russh::keys::Algorithm::Ed25519).unwrap();
    let (port, host_public) = start_server(client_key.public_key().clone()).await;

    /* Something else answering on this address, with a key we stored earlier. */
    let mut known = KnownHosts::default();
    known.add(KnownHosts::entry_for(
        "127.0.0.1",
        port,
        host_public.algorithm().as_str(),
        b"a key this host used to present".to_vec(),
    ));

    assert!(matches!(
        connect(endpoint(port), known).await,
        Err(ConnectionError::HostKeyRejected(_))
    ));
}

#[tokio::test]
async fn an_rsa_private_key_is_refused_before_it_is_used() {
    /* ADR-0010. RUSTSEC-2023-0071 is a timing attack on RSA private key
    operations with no fixed version available, and signing is the operation
    it reaches. This refusal is the only thing keeping that code unreached,
    so it is the only thing this test exists for. */
    let client_key = PrivateKey::random(&mut rng(), russh::keys::Algorithm::Ed25519).unwrap();
    let (port, host_public) = start_server(client_key.public_key().clone()).await;

    let rsa_key = PrivateKey::random(&mut rng(), russh::keys::Algorithm::Rsa { hash: None })
        .expect("an RSA key");

    let mut pem = Vec::new();
    encode_pkcs8_pem(&rsa_key, &mut pem).expect("the key encodes");

    let mut connection = connect(endpoint(port), trusting(port, &host_public))
        .await
        .unwrap();

    let refused = connection
        .authenticate(
            USER,
            Credential::PrivateKey {
                pem: Zeroizing::new(String::from_utf8(pem).expect("utf-8")),
                passphrase: None,
            },
        )
        .await;

    assert!(
        matches!(refused, Err(ConnectionError::RsaKeyRefused)),
        "an RSA private key must be refused, got {refused:?}"
    );
}

#[tokio::test]
async fn a_round_trip_is_measured_against_the_host() {
    /* The status bar's latency figure. The value itself cannot be asserted —
    it is a loopback measurement on a shared CI runner — so what is asserted
    is that the host actually answered, and answered in a time that could only
    have come from a round trip rather than from a local return. */
    let key = PrivateKey::random(&mut rng(), russh::keys::Algorithm::Ed25519).expect("a key");
    let (port, host_public) = start_server(key.public_key().clone()).await;

    let mut connection = connect(endpoint(port), trusting(port, &host_public))
        .await
        .expect("connects");

    connection
        .authenticate(
            USER,
            Credential::Password(Zeroizing::new(PASSWORD.to_owned())),
        )
        .await
        .expect("authenticates");

    let elapsed = connection.round_trip().await.expect("the host answered");

    assert!(
        elapsed < std::time::Duration::from_secs(5),
        "a loopback round trip took {elapsed:?}, which is not a round trip"
    );

    /* Measured twice: a first call that succeeded by accident — because the
    reply channel resolved on drop rather than on an answer — would give a
    second call nothing to resolve against. */
    connection
        .round_trip()
        .await
        .expect("the host answered again");
}

#[tokio::test]
async fn a_round_trip_needs_no_shell() {
    /* The status bar starts measuring as soon as a session exists. Requiring
    a channel would leave latency blank on exactly the sessions a user is
    most likely to be staring at: the ones still starting up. */
    let key = PrivateKey::random(&mut rng(), russh::keys::Algorithm::Ed25519).expect("a key");
    let (port, host_public) = start_server(key.public_key().clone()).await;

    let mut connection = connect(endpoint(port), trusting(port, &host_public))
        .await
        .expect("connects");

    connection
        .authenticate(
            USER,
            Credential::Password(Zeroizing::new(PASSWORD.to_owned())),
        )
        .await
        .expect("authenticates");

    assert!(connection.round_trip().await.is_ok());
}

#[test]
fn a_credential_never_prints_itself() {
    /* Rule 2. A Debug that leaks is the usual way a secret reaches a log
    nobody meant to write. */
    let password = Credential::Password(Zeroizing::new(PASSWORD.to_owned()));
    let key = Credential::PrivateKey {
        pem: Zeroizing::new("-----BEGIN OPENSSH PRIVATE KEY-----".to_owned()),
        passphrase: Some(Zeroizing::new(PASSPHRASE.to_owned())),
    };

    for rendered in [format!("{password:?}"), format!("{key:?}")] {
        assert!(
            !rendered.contains(PASSWORD),
            "the password leaked: {rendered}"
        );
        assert!(
            !rendered.contains(PASSPHRASE),
            "the passphrase leaked: {rendered}"
        );
        assert!(
            !rendered.contains("BEGIN OPENSSH"),
            "the key leaked: {rendered}"
        );
    }
}

#[test]
fn the_trust_verdict_survives_a_refusal() {
    /* The caller has to be able to tell an unknown host from a changed one:
    one prompts, the other blocks. */
    let unknown = ConnectionError::HostKeyRejected(Box::new(Trust::Unknown {
        fingerprint: "SHA256:x".to_owned(),
        other_types: Vec::new(),
    }));

    let ConnectionError::HostKeyRejected(verdict) = unknown else {
        panic!("expected a host key rejection");
    };
    assert!(matches!(*verdict, Trust::Unknown { .. }));
}

/// A socket that accepts and then says nothing at all.
///
/// This is the shape of failure that used to have no end: the TCP handshake
/// completes, so no retry budget is ever spent, and russh sets no timeout of
/// its own — `client::Config::default()` leaves `inactivity_timeout` at `None`.
/// The connection simply waited, and the only way out was to close the
/// application.
async fn silent_listener() -> u16 {
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
        .await
        .expect("a loopback port");
    let port = listener.local_addr().expect("a bound address").port();

    tokio::spawn(async move {
        /* Held open deliberately. Dropping the stream would send a FIN and the
        client would fail fast for the wrong reason, proving nothing. */
        if let Ok((stream, _)) = listener.accept().await {
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
            drop(stream);
        }
    });

    port
}

#[tokio::test]
async fn a_host_that_answers_and_then_says_nothing_gives_up() {
    let port = silent_listener().await;

    let result = connect_within(
        endpoint(port),
        KnownHosts::default(),
        std::time::Duration::from_millis(250),
    )
    .await;

    let outcome = result
        .map(|_| "connected")
        .map_err(|error| error.to_string());
    assert_eq!(outcome, Err("the host did not answer in time".to_owned()));
}

#[tokio::test]
async fn giving_up_is_not_reported_as_unreachable() {
    /* The two must stay distinct all the way to the user. "Nothing answered at
    that address and port" sends someone to check whether the host is up and
    whether the port is right — and here the host answered on the right port.
    Collapsing them would send every timeout chasing the wrong thing. */
    let port = silent_listener().await;

    let result = connect_within(
        endpoint(port),
        KnownHosts::default(),
        std::time::Duration::from_millis(250),
    )
    .await;

    let unreachable = ConnectionError::Unreachable.to_string();
    let outcome = result
        .map(|_| "connected")
        .map_err(|error| error.to_string());
    assert_ne!(outcome, Err(unreachable));
}
