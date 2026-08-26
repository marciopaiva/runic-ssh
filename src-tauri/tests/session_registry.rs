//! What happens to a session while it is talking to its host.
//!
//! `Registry::with` takes the connection *out* of the map for the duration of
//! an operation, so the map lock is not held across the network. That is the
//! right instinct and the wrong mechanism: while the operation is in flight the
//! handle resolves to nothing, and every other call against that session —
//! a keystroke, a resize, a disconnect — fails as though the session did not
//! exist.
//!
//! Nothing hit it before, because the only operations that used `with` ran
//! before there was a terminal to type into. The status bar in #31 needs to
//! measure round trip latency on a timer, which puts a network operation in
//! flight while the user is typing. These tests are that case.

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

use russh::keys::{PrivateKey, PublicKey};
use russh::server::{Auth, ChannelOpenHandle, Handler as ServerHandler, Msg, Server as _, Session};
use russh::{Channel, MethodKind};

use runic_ssh::ssh::connection::{connect, Credential, Endpoint};
use runic_ssh::ssh::known_hosts::KnownHosts;
use runic_ssh::ssh::registry::{Open, Registry};
use runic_ssh::ssh::terminal::Input;
use runic_ssh::vault::Secret;

const USER: &str = "deploy";
const PASSWORD: &str = "correct horse battery staple";

#[derive(Clone)]
struct AcceptingServer;

impl russh::server::Server for AcceptingServer {
    type Handler = Self;
    fn new_client(&mut self, _peer: Option<std::net::SocketAddr>) -> Self {
        self.clone()
    }
}

impl ServerHandler for AcceptingServer {
    type Error = russh::Error;

    async fn auth_password(&mut self, _user: &str, _password: &str) -> Result<Auth, Self::Error> {
        Ok(Auth::Accept)
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
async fn start_server() -> (u16, PublicKey) {
    let host_key =
        PrivateKey::random(&mut rand::rng(), russh::keys::Algorithm::Ed25519).expect("a host key");
    let host_public = host_key.public_key().clone();

    let config = Arc::new(russh::server::Config {
        keys: vec![host_key],
        methods: [MethodKind::Password].as_slice().into(),
        ..Default::default()
    });

    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
        .await
        .expect("a loopback port");
    let port = listener.local_addr().expect("an address").port();

    tokio::spawn(async move {
        let _ = AcceptingServer.run_on_socket(config, &listener).await;
    });

    (port, host_public)
}

/// An authenticated session, already in the registry, with a shell attached.
async fn open_session() -> (
    Registry,
    runic_ssh::ssh::registry::SessionHandle,
    tokio::sync::mpsc::Receiver<Input>,
) {
    let (port, host_public) = start_server().await;

    let mut known = KnownHosts::default();
    known.add(KnownHosts::entry_for(
        "127.0.0.1",
        port,
        host_public.algorithm().as_str(),
        host_public.to_bytes().expect("the host key encodes"),
    ));

    let mut connection = connect(
        Endpoint {
            host: "127.0.0.1".to_owned(),
            port,
        },
        known,
    )
    .await
    .expect("connects");

    connection
        .authenticate(USER, Credential::Password(Secret::new(PASSWORD.to_owned())))
        .await
        .expect("authenticates");

    let registry = Registry::new();
    let handle = registry
        .insert(Open {
            connection,
            session_id: "web-01".to_owned(),
            user: USER.to_owned(),
            input: None,
        })
        .await;

    let (sender, receiver) = tokio::sync::mpsc::channel(8);
    registry.attach_input(handle, sender).await;

    (registry, handle, receiver)
}

#[tokio::test]
async fn a_keystroke_is_not_dropped_while_the_session_is_busy() {
    /* The user typing while the status bar measures latency. A dropped
    keystroke is invisible in the interface — the character simply never
    appears — which makes it the worst possible way for this to fail. */
    let (registry, handle, mut input) = open_session().await;
    let registry = Arc::new(registry);

    let busy = {
        let registry = Arc::clone(&registry);
        tokio::spawn(async move {
            registry
                .with(handle, |open| async move {
                    /* Standing in for a network round trip. */
                    tokio::time::sleep(Duration::from_millis(200)).await;
                    (open, ())
                })
                .await
        })
    };

    tokio::time::sleep(Duration::from_millis(50)).await;

    let sent = registry
        .send_input(handle, Input::Keys(b"ls\n".to_vec()))
        .await;

    assert!(
        sent.is_some(),
        "the keystroke was dropped because the session was mid-operation"
    );
    assert_eq!(input.recv().await, Some(Input::Keys(b"ls\n".to_vec())));

    busy.await
        .expect("the operation finishes")
        .expect("the handle resolved");
}

#[tokio::test]
async fn a_session_can_be_named_while_it_is_busy() {
    /* `session_of` is how an event finds out which saved host it belongs to.
    Returning None mid-operation makes output arrive attributed to nothing. */
    let (registry, handle, _input) = open_session().await;
    let registry = Arc::new(registry);

    let busy = {
        let registry = Arc::clone(&registry);
        tokio::spawn(async move {
            registry
                .with(handle, |open| async move {
                    tokio::time::sleep(Duration::from_millis(200)).await;
                    (open, ())
                })
                .await
        })
    };

    tokio::time::sleep(Duration::from_millis(50)).await;

    assert_eq!(registry.session_of(handle).await.as_deref(), Some("web-01"));

    busy.await
        .expect("the operation finishes")
        .expect("the handle resolved");
}

#[tokio::test]
async fn two_operations_on_one_session_take_turns() {
    /* The second used to find nothing and report the session as unknown.
    It should wait instead — and it must not run *alongside* the first, since
    both need the connection to themselves. */
    let (registry, handle, _input) = open_session().await;
    let registry = Arc::new(registry);
    let inside = Arc::new(AtomicUsize::new(0));
    let overlapped = Arc::new(AtomicBool::new(false));

    let run = |label: &'static str, delay: u64| {
        let registry = Arc::clone(&registry);
        let inside = Arc::clone(&inside);
        let overlapped = Arc::clone(&overlapped);

        async move {
            registry
                .with(handle, |busy| async move {
                    if inside.fetch_add(1, Ordering::SeqCst) != 0 {
                        overlapped.store(true, Ordering::SeqCst);
                    }
                    tokio::time::sleep(Duration::from_millis(delay)).await;
                    inside.fetch_sub(1, Ordering::SeqCst);
                    (busy, label)
                })
                .await
        }
    };

    let first = tokio::spawn(run("first", 150));
    tokio::time::sleep(Duration::from_millis(50)).await;
    let second = run("second", 0).await;

    assert_eq!(second, Some("second"));
    assert_eq!(first.await.expect("joins"), Some("first"));
    assert!(
        !overlapped.load(Ordering::SeqCst),
        "two operations held the same connection at once"
    );
}

#[tokio::test]
async fn disconnecting_waits_for_the_operation_in_flight() {
    /* Taking the session used to succeed immediately and hand back nothing,
    because the connection was out of the map — so a disconnect during
    authentication reported success and left the session running. */
    let (registry, handle, _input) = open_session().await;
    let registry = Arc::new(registry);
    let finished = Arc::new(AtomicBool::new(false));

    let busy = {
        let registry = Arc::clone(&registry);
        let finished = Arc::clone(&finished);
        tokio::spawn(async move {
            registry
                .with(handle, move |busy| async move {
                    tokio::time::sleep(Duration::from_millis(200)).await;
                    finished.store(true, Ordering::SeqCst);
                    (busy, ())
                })
                .await
        })
    };

    tokio::time::sleep(Duration::from_millis(50)).await;

    let closed = registry.close(handle).await;

    assert!(closed.is_some(), "the session could not be closed");
    assert!(
        finished.load(Ordering::SeqCst),
        "the socket was taken out from under an operation still using it"
    );
    assert_eq!(registry.count().await, 0);

    busy.await.expect("joins");
}

#[tokio::test]
async fn a_closed_session_stops_answering() {
    /* The other half of the same rule: once it is gone it is gone, and an
    operation that was waiting its turn is told so rather than resurrecting
    a connection nobody holds. */
    let (registry, handle, _input) = open_session().await;

    assert!(registry.close(handle).await.is_some());
    assert!(registry.close(handle).await.is_none());
    assert!(registry.session_of(handle).await.is_none());
    assert!(registry
        .send_input(handle, Input::Keys(b"ls\n".to_vec()))
        .await
        .is_none());
    assert!(registry
        .with(handle, |busy| async move { (busy, ()) })
        .await
        .is_none());
}

/// An authenticated connection with no shell attached, ready to be inserted.
async fn a_second_session() -> (Open, u16, ()) {
    let (port, host_public) = start_server().await;

    let mut known = KnownHosts::default();
    known.add(KnownHosts::entry_for(
        "127.0.0.1",
        port,
        host_public.algorithm().as_str(),
        host_public.to_bytes().expect("the host key encodes"),
    ));

    let mut connection = connect(
        Endpoint {
            host: "127.0.0.1".to_owned(),
            port,
        },
        known,
    )
    .await
    .expect("connects");

    connection
        .authenticate(USER, Credential::Password(Secret::new(PASSWORD.to_owned())))
        .await
        .expect("authenticates");

    (
        Open {
            connection,
            session_id: "second".to_owned(),
            user: USER.to_owned(),
            input: None,
        },
        port,
        (),
    )
}

#[tokio::test]
async fn a_handle_says_whether_it_already_has_a_shell() {
    /* The guard in `open_terminal` is this question and nothing else, and the
    command itself needs an app handle to call, so the invariant is tested
    where it lives. Before it existed, a second `open_terminal` on one handle
    opened a second shell and abandoned the first — still running, still
    holding a pty, still counting against the server's MaxSessions (#94). */
    let (registry, handle, _input) = open_session().await;

    /* `open_session` attaches an input channel, which is what a running shell
    leaves behind in the map. */
    assert!(registry.has_shell(handle).await);

    /* A second session, as it looks after authenticating and before anyone has
    asked for a terminal. Built rather than moved out of the first: since
    ADR-0024 a connection may be ridden by several sessions, so taking one out
    of the registry to put it back is no longer a thing that means anything. */
    let (second, _port, _key) = a_second_session().await;
    let fresh = registry.insert(second).await;

    assert!(
        !registry.has_shell(fresh).await,
        "a connection with no shell must not be mistaken for one that has one, \
         or the first terminal a session opens would be refused"
    );

    /* And the answer follows the entry rather than the connection: attaching
    input is what makes it true. */
    let (sender, _receiver) = tokio::sync::mpsc::channel(1);
    registry.attach_input(fresh, sender).await;
    assert!(registry.has_shell(fresh).await);

    registry
        .close(handle)
        .await
        .expect("the session is open")
        .expect("it closes");
    assert!(
        !registry.has_shell(handle).await,
        "a handle that no longer names a session has no shell"
    );
}

#[tokio::test]
async fn an_open_session_can_be_ridden_by_name() {
    /* What makes a chain reuse a bastion instead of opening a second
    connection to a host it is already logged in to. ADR-0024, #164.

    By saved session id rather than by handle, because the far session knows
    which host it is reached through and has never seen a handle for it. */
    let (registry, handle, _input) = open_session().await;

    let session_id = registry
        .session_of(handle)
        .await
        .expect("the handle names a session");

    assert!(
        registry.shared_of_session(&session_id).await.is_some(),
        "an open session is findable by the id a jump host reference names"
    );
    assert!(
        registry.shared_of_session("never-opened").await.is_none(),
        "a session nobody opened is not findable, so a chain opens its own"
    );

    /* And it stops being findable once it is closed, or a chain would ride a
    connection that is on its way out. */
    registry
        .close(handle)
        .await
        .expect("the session is open")
        .expect("it closes");

    assert!(registry.shared_of_session(&session_id).await.is_none());
}
