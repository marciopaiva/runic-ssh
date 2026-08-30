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

use runic_ssh::ssh::connection::{
    close_shared, connect, connect_via, connect_within, share, ConnectionError, Credential,
    Endpoint, Hop, Shared,
};
use runic_ssh::ssh::known_hosts::KnownHosts;
use runic_ssh::ssh::registry::ChainedBastions;
use runic_ssh::ssh::trust::Trust;
use runic_ssh::vault::Secret;

const USER: &str = "deploy";
const PASSWORD: &str = "correct horse battery staple";
const PASSPHRASE: &str = "a passphrase for the key";

#[derive(Clone)]
struct TestServer {
    authorized: Arc<PublicKey>,
    /// The one password this server accepts.
    password: &'static str,
    /// Whether it will forward a `direct-tcpip` channel. A bastion does; an
    /// ordinary host does not, and a bastion configured `AllowTcpForwarding no`
    /// does not either.
    forwards: bool,
    /// How many client sessions are open right now.
    live: Arc<std::sync::atomic::AtomicUsize>,
    /// Decrements `live` when this client's handler is dropped. `None` on the
    /// template the server clones from, `Some` on each accepted client.
    guard: Option<Arc<SessionGuard>>,
    /// Every password this server was offered.
    ///
    /// The point of recording them is one assertion: a bastion must never be
    /// offered the credential of the host behind it. Holding test constants in
    /// a test is not the thing rule 2 forbids, and the assertion it buys is the
    /// security property the whole chain exists for.
    seen: Arc<std::sync::Mutex<Vec<String>>>,
}

impl russh::server::Server for TestServer {
    type Handler = Self;
    fn new_client(&mut self, _peer: Option<std::net::SocketAddr>) -> Self {
        self.live.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let mut client = self.clone();
        client.guard = Some(Arc::new(SessionGuard(Arc::clone(&self.live))));
        client
    }
}

/// Held by an accepted client, and dropped when that client goes.
struct SessionGuard(Arc<std::sync::atomic::AtomicUsize>);

impl Drop for SessionGuard {
    fn drop(&mut self) {
        self.0.fetch_sub(1, std::sync::atomic::Ordering::Relaxed);
    }
}

impl ServerHandler for TestServer {
    type Error = russh::Error;

    async fn auth_password(&mut self, user: &str, password: &str) -> Result<Auth, Self::Error> {
        if let Ok(mut seen) = self.seen.lock() {
            seen.push(password.to_owned());
        }
        if user == USER && password == self.password {
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

    /// Forwards the channel to the address it names, which is what makes this
    /// server a bastion.
    ///
    /// The upstream connection is made *before* the channel is accepted. The
    /// other order accepts a channel and then discovers there is nothing behind
    /// it, which reaches the client as a session that opens and immediately
    /// stops rather than as a refusal it can report.
    async fn channel_open_direct_tcpip(
        &mut self,
        channel: Channel<Msg>,
        host_to_connect: &str,
        port_to_connect: u32,
        _originator_address: &str,
        _originator_port: u32,
        reply: ChannelOpenHandle,
        _session: &mut Session,
    ) -> Result<(), Self::Error> {
        if !self.forwards {
            reply
                .reject(russh::ChannelOpenFailure::AdministrativelyProhibited)
                .await;
            return Ok(());
        }

        let Ok(mut upstream) =
            tokio::net::TcpStream::connect(format!("{host_to_connect}:{port_to_connect}")).await
        else {
            reply.reject(russh::ChannelOpenFailure::ConnectFailed).await;
            return Ok(());
        };

        reply.accept().await;

        tokio::spawn(async move {
            let mut downstream = channel.into_stream();
            let _ = tokio::io::copy_bidirectional(&mut downstream, &mut upstream).await;
        });

        Ok(())
    }
}

/// Starts a server on a loopback port and returns its address and host key.
async fn start_server(authorized: PublicKey) -> (u16, PublicKey) {
    let (port, key, _seen) = start_host(authorized, PASSWORD, false).await;
    (port, key)
}

/// [`start_server`], with what the chain tests need to vary.
///
/// Returns the passwords the server is offered, so a test can assert what it
/// was never asked for.
async fn start_host(
    authorized: PublicKey,
    password: &'static str,
    forwards: bool,
) -> (u16, PublicKey, Arc<std::sync::Mutex<Vec<String>>>) {
    let (port, key, seen, _live) = start_counted(authorized, password, forwards).await;
    (port, key, seen)
}

/// [`start_host`], also handing back its live session count.
#[allow(clippy::type_complexity)]
async fn start_counted(
    authorized: PublicKey,
    password: &'static str,
    forwards: bool,
) -> (
    u16,
    PublicKey,
    Arc<std::sync::Mutex<Vec<String>>>,
    Arc<std::sync::atomic::AtomicUsize>,
) {
    let live = Arc::new(std::sync::atomic::AtomicUsize::new(0));
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

    let seen = Arc::new(std::sync::Mutex::new(Vec::new()));
    let mut server = TestServer {
        authorized: Arc::new(authorized),
        password,
        forwards,
        live: Arc::clone(&live),
        guard: None,
        seen: Arc::clone(&seen),
    };
    tokio::spawn(async move {
        let _ = server.run_on_socket(config, &listener).await;
    });

    (port, host_public, seen, live)
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
        .authenticate(USER, Credential::Password(Secret::new(PASSWORD.to_owned())))
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
        .authenticate(USER, Credential::Password(Secret::new("wrong".to_owned())))
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
                pem: Secret::new(String::from_utf8(pem).expect("utf-8")),
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
                pem: Secret::new(String::from_utf8(pem).expect("utf-8")),
                passphrase: Some(Secret::new(PASSPHRASE.to_owned())),
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
                pem: Secret::new(String::from_utf8(pem).unwrap()),
                passphrase: Some(Secret::new("not the passphrase".to_owned())),
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
                pem: Secret::new(String::from_utf8(pem).expect("utf-8")),
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
        .authenticate(USER, Credential::Password(Secret::new(PASSWORD.to_owned())))
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
        .authenticate(USER, Credential::Password(Secret::new(PASSWORD.to_owned())))
        .await
        .expect("authenticates");

    assert!(connection.round_trip().await.is_ok());
}

#[test]
fn a_credential_never_prints_itself() {
    /* Rule 2. A Debug that leaks is the usual way a secret reaches a log
    nobody meant to write. */
    let password = Credential::Password(Secret::new(PASSWORD.to_owned()));
    let key = Credential::PrivateKey {
        pem: Secret::new("-----BEGIN OPENSSH PRIVATE KEY-----".to_owned()),
        passphrase: Some(Secret::new(PASSPHRASE.to_owned())),
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

/* ------------------------------------------------------------------------ *
 * A host reached through a bastion. ADR-0023.
 * ------------------------------------------------------------------------ */

/// Deliberately not [`PASSWORD`]. The bastion and the host behind it having
/// different credentials is what makes it possible to assert that one never
/// reached the other, which is the property the whole design exists for.
const BASTION_PASSWORD: &str = "the bastion has a password of its own";

struct Chain {
    bastion_port: u16,
    bastion_key: PublicKey,
    target_port: u16,
    target_key: PublicKey,
    /// Every password the bastion was offered.
    bastion_saw: Arc<std::sync::Mutex<Vec<String>>>,
    /// How many sessions the bastion currently holds open.
    bastion_live: Arc<std::sync::atomic::AtomicUsize>,
}

/// A forwarding bastion and a host behind it.
///
/// Both listen on loopback, so the far host is reachable directly here too.
/// That is on purpose: this file tests the mechanism, and the topology where
/// the target is genuinely unreachable is what the container fixture in
/// `docs/testing.md` is for. The two answer different questions and neither
/// substitutes for the other.
async fn a_chain(forwards: bool) -> Chain {
    let unused = PrivateKey::random(&mut rng(), russh::keys::Algorithm::Ed25519)
        .expect("a key")
        .public_key()
        .clone();

    let (bastion_port, bastion_key, bastion_saw, bastion_live) =
        start_counted(unused.clone(), BASTION_PASSWORD, forwards).await;
    let (target_port, target_key, _, _) = start_counted(unused, PASSWORD, false).await;

    Chain {
        bastion_port,
        bastion_key,
        target_port,
        target_key,
        bastion_saw,
        bastion_live,
    }
}

/// Connects to the bastion and authenticates, which is what `direct-tcpip`
/// requires before it will open anything.
async fn open_bastion(chain: &Chain) -> Shared {
    let mut bastion = connect(
        endpoint(chain.bastion_port),
        trusting(chain.bastion_port, &chain.bastion_key),
    )
    .await
    .expect("the bastion accepts its own key");

    bastion
        .authenticate(
            USER,
            Credential::Password(Secret::new(BASTION_PASSWORD.to_owned())),
        )
        .await
        .expect("the bastion accepts its own password");

    share(bastion)
}

#[tokio::test]
async fn a_session_rides_a_channel_through_a_bastion() {
    let chain = a_chain(true).await;
    let bastion = open_bastion(&chain).await;

    let mut far = connect_via(
        bastion,
        endpoint(chain.target_port),
        trusting(chain.target_port, &chain.target_key),
    )
    .await
    .map_err(|failure| failure.error)
    .expect("the far host is reached through the bastion");

    assert!(far.is_chained(), "the far session knows it rides a bastion");

    /* The far session is an ordinary connection: it authenticates with its own
    credential, end to end, over a transport that happens to be a channel. */
    far.authenticate(USER, Credential::Password(Secret::new(PASSWORD.to_owned())))
        .await
        .expect("the far host accepts its own password");
}

#[tokio::test]
async fn a_bastion_is_never_offered_the_far_credential() {
    /* This is the property that made ProxyJump replace `ssh -A bastion`. The
    bastion forwards bytes it cannot read; the key exchange and the
    authentication with the far host run end to end past it. */
    let chain = a_chain(true).await;
    let bastion = open_bastion(&chain).await;

    let mut far = connect_via(
        bastion,
        endpoint(chain.target_port),
        trusting(chain.target_port, &chain.target_key),
    )
    .await
    .map_err(|failure| failure.error)
    .expect("the far host is reached");

    far.authenticate(USER, Credential::Password(Secret::new(PASSWORD.to_owned())))
        .await
        .expect("the far host accepts its own password");

    let seen = chain.bastion_saw.lock().expect("the log is readable");
    assert!(
        seen.iter().any(|offered| offered == BASTION_PASSWORD),
        "the bastion was offered its own password"
    );
    assert!(
        !seen.iter().any(|offered| offered == PASSWORD),
        "the bastion was never offered the far host's password, and saw {} attempt(s)",
        seen.len()
    );
}

#[tokio::test]
async fn the_far_host_key_is_checked_through_the_chain() {
    /* Rule 3 applies to the second hop exactly as it does to the first. A
    tunnel is not a reason to trust what comes out of it. */
    let chain = a_chain(true).await;
    let bastion = open_bastion(&chain).await;

    let failure = connect_via(bastion, endpoint(chain.target_port), KnownHosts::default())
        .await
        .err()
        .expect("an unknown far key stops the chain");

    assert!(matches!(
        failure.error,
        ConnectionError::HostKeyRejected(ref verdict) if matches!(**verdict, Trust::Unknown { .. })
    ));

    let offered = failure.offered.expect("the far key is handed back");
    assert_eq!(
        offered.hop,
        Hop::Target,
        "the prompt has to be able to say which host is asking"
    );
    assert_eq!(offered.port, chain.target_port);

    /* The bastion comes back rather than being dropped, so it can be closed
    politely instead of leaving a broken socket in the server's log. */
    close_shared(failure.bastion).await.expect("it closes");
}

#[tokio::test]
async fn a_bastion_that_refuses_forwarding_hands_itself_back() {
    /* `AllowTcpForwarding no` is a real and reasonable bastion configuration,
    and from here it is indistinguishable from the far host being down. The
    error says the thing that is true of both. */
    let chain = a_chain(false).await;
    let bastion = open_bastion(&chain).await;

    let failure = connect_via(
        bastion,
        endpoint(chain.target_port),
        trusting(chain.target_port, &chain.target_key),
    )
    .await
    .err()
    .expect("a bastion that will not forward cannot reach the far host");

    assert!(matches!(failure.error, ConnectionError::Unreachable));
    assert!(failure.offered.is_none(), "no key was ever offered");
    close_shared(failure.bastion).await.expect("it closes");
}

#[tokio::test]
async fn closing_a_chain_releases_the_bastion() {
    let chain = a_chain(true).await;
    let bastion = open_bastion(&chain).await;

    let far = connect_via(
        bastion,
        endpoint(chain.target_port),
        trusting(chain.target_port, &chain.target_key),
    )
    .await
    .map_err(|failure| failure.error)
    .expect("the far host is reached");

    assert_eq!(
        chain
            .bastion_live
            .load(std::sync::atomic::Ordering::Relaxed),
        1,
        "the bastion is holding the session that carries the chain"
    );

    far.disconnect().await.expect("the chain closes");

    /* What this proves is that the bastion does not outlive the session it
    carried. It does not prove the disconnect was *polite*: russh's server
    handler has no disconnect hook, so a dropped connection and a disconnected
    one look identical from here. The container fixture in `docs/testing.md`
    is where that distinction is visible, in the bastion's own log.

    The failure this does catch is the one that matters: a bastion retained
    somewhere and left holding a slot against `MaxSessions` that no handle can
    reach and no user can see. The server drops its handler on its own task, so
    this waits rather than reading immediately. */
    let mut waited = std::time::Duration::ZERO;
    while chain
        .bastion_live
        .load(std::sync::atomic::Ordering::Relaxed)
        != 0
        && waited < std::time::Duration::from_secs(5)
    {
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        waited += std::time::Duration::from_millis(10);
    }

    assert_eq!(
        chain
            .bastion_live
            .load(std::sync::atomic::Ordering::Relaxed),
        0,
        "the bastion did not outlive the session it carried"
    );
}

/* ------------------------------------------------------------------------ *
 * One bastion, several hosts behind it. ADR-0024.
 * ------------------------------------------------------------------------ */

/// Waits for the bastion's live session count to settle, or gives up.
///
/// The server drops its handler on its own task, so a count read the instant
/// after a disconnect is a count read too early.
async fn settles_at(chain: &Chain, expected: usize) -> usize {
    let mut waited = std::time::Duration::ZERO;
    loop {
        let live = chain
            .bastion_live
            .load(std::sync::atomic::Ordering::Relaxed);
        if live == expected || waited >= std::time::Duration::from_secs(5) {
            return live;
        }
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        waited += std::time::Duration::from_millis(10);
    }
}

#[tokio::test]
async fn two_hosts_behind_one_bastion_cost_it_one_login() {
    /* The whole of #164. Before this, six hosts behind a bastion meant six
    connections to it, six authentications, and six entries in the log it
    exists to produce. */
    let chain = a_chain(true).await;
    let bastion = open_bastion(&chain).await;

    let first = connect_via(
        Arc::clone(&bastion),
        endpoint(chain.target_port),
        trusting(chain.target_port, &chain.target_key),
    )
    .await
    .map_err(|failure| failure.error)
    .expect("the first host is reached");

    let second = connect_via(
        Arc::clone(&bastion),
        endpoint(chain.target_port),
        trusting(chain.target_port, &chain.target_key),
    )
    .await
    .map_err(|failure| failure.error)
    .expect("the second host is reached over the same bastion");

    assert_eq!(
        settles_at(&chain, 1).await,
        1,
        "one bastion connection carries both"
    );

    let offered = chain.bastion_saw.lock().expect("the log is readable").len();
    assert_eq!(offered, 1, "the bastion was authenticated once, not twice");

    first.disconnect().await.expect("the first closes");
    second.disconnect().await.expect("the second closes");
    close_shared(bastion).await.expect("the share is let go");
}

/* ---------------------------------------------------------------- *
 * A bastion a chain opened, found by the next chain. ADR-0037.
 * ---------------------------------------------------------------- */

#[tokio::test]
async fn a_second_chain_rides_the_bastion_the_first_one_opened() {
    let chain = a_chain(true).await;
    let bastions = ChainedBastions::new();
    let bastion = open_bastion(&chain).await;

    /* What #200 named: nothing did this before. A second chain to the same
    bastion had no way to find the first one's, so it opened its own. */
    bastions.remember("bastion".to_owned(), &bastion).await;

    let found = bastions
        .find("bastion")
        .await
        .expect("the bastion the first chain opened is still open");

    let second = connect_via(
        found,
        endpoint(chain.target_port),
        trusting(chain.target_port, &chain.target_key),
    )
    .await
    .map_err(|failure| failure.error)
    .expect("the second chain reaches the target through the bastion it found");

    let offered = chain.bastion_saw.lock().expect("the log is readable").len();
    assert_eq!(
        offered, 1,
        "the bastion the second chain found was not authenticated again"
    );

    second.disconnect().await.expect("closes");
    close_shared(bastion).await.expect("the share is let go");
}

#[tokio::test]
async fn a_bastion_closed_by_its_last_rider_stops_being_found() {
    /* The property ADR-0037 rests its whole argument on: a weak entry must
    never be why `close_shared`'s `Arc::try_unwrap` fails to see the count
    fall to one, and once it has closed for real, the entry must not resolve
    to a connection that no longer exists. */
    let chain = a_chain(true).await;
    let bastions = ChainedBastions::new();
    let bastion = open_bastion(&chain).await;

    bastions.remember("bastion".to_owned(), &bastion).await;
    close_shared(bastion)
        .await
        .expect("the only rider closes it");

    assert!(
        bastions.find("bastion").await.is_none(),
        "a dead weak reference does not resurrect a bastion nothing rides any more"
    );
}

#[tokio::test]
async fn closing_one_host_leaves_the_others_connected() {
    /* Seen on the maintainer's machine as the reason not to take the smallest
    option: a `top` was running on a host behind a bastion whose own tab was
    closed. Whatever sharing does, it must not break that. */
    let chain = a_chain(true).await;
    let bastion = open_bastion(&chain).await;

    let first = connect_via(
        Arc::clone(&bastion),
        endpoint(chain.target_port),
        trusting(chain.target_port, &chain.target_key),
    )
    .await
    .map_err(|failure| failure.error)
    .expect("the first host is reached");

    let mut second = connect_via(
        Arc::clone(&bastion),
        endpoint(chain.target_port),
        trusting(chain.target_port, &chain.target_key),
    )
    .await
    .map_err(|failure| failure.error)
    .expect("the second host is reached");

    /* The share the registry would hold for the bastion's own session, let go
    as if its tab had been closed. */
    close_shared(bastion).await.expect("the share is let go");
    first.disconnect().await.expect("the first closes");

    assert_eq!(
        settles_at(&chain, 1).await,
        1,
        "the bastion is still carrying the session that is left"
    );

    /* And the survivor is not merely counted, it works. */
    second
        .authenticate(USER, Credential::Password(Secret::new(PASSWORD.to_owned())))
        .await
        .expect("the surviving session still authenticates through the bastion");

    second.disconnect().await.expect("the last one closes");
    assert_eq!(
        settles_at(&chain, 0).await,
        0,
        "the last session out closes the bastion"
    );
}

#[tokio::test]
async fn a_bastion_nobody_rides_is_not_left_open() {
    /* The other half of the count. A share let go by its only holder closes
    the connection rather than leaving a slot against the server's
    MaxSessions that no handle can reach. */
    let chain = a_chain(true).await;
    let bastion = open_bastion(&chain).await;

    assert_eq!(settles_at(&chain, 1).await, 1);

    close_shared(bastion).await.expect("it closes");

    assert_eq!(
        settles_at(&chain, 0).await,
        0,
        "nothing was left holding it"
    );
}
