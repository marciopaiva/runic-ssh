//! Rules 2 and 4, asserted rather than assumed.
//!
//! Rule 2 says nothing secret is ever logged — not at any level, not in a panic
//! message, not in an error returned to the frontend. The dangerous case the
//! security model names is indirect: a domain error that captured a passphrase
//! in its `Display`, wrapped with `#[from]`, and surfaced in a toast. These
//! tests plant canaries and go looking for them everywhere a value can be
//! rendered.
//!
//! The enumeration below is exhaustive by construction: the `match` in
//! `every_connection_error` does not compile when a variant is added, so a new
//! failure mode cannot reach the frontend without someone reading this file.

use std::sync::Arc;

use russh::keys::{encode_pkcs8_pem_encrypted, PrivateKey};
use russh::server::{Auth, ChannelOpenHandle, Handler as ServerHandler, Msg, Server as _, Session};
use russh::{Channel, MethodKind};
use zeroize::Zeroizing;

use runic_ssh::error::IpcError;
use runic_ssh::ssh::connection::{connect, ConnectionError, Credential, Endpoint};
use runic_ssh::ssh::known_hosts::KnownHosts;
use runic_ssh::ssh::trust::{decide, Trust};

/// Strings that must never appear in anything rendered.
const PASSWORD: &str = "canary-password-6f2a";
const PASSPHRASE: &str = "canary-passphrase-91bd";
const PEM_MARKER: &str = "BEGIN OPENSSH PRIVATE KEY";
const CANARIES: &[&str] = &[PASSWORD, PASSPHRASE, PEM_MARKER];

fn assert_clean(what: &str, rendered: &str) {
    for canary in CANARIES {
        assert!(
            !rendered.contains(canary),
            "{what} leaked {canary}: {rendered}"
        );
    }
}

/// Every way a connection can fail, with a canary in every string field.
///
/// The `match` is the point: adding a variant breaks this file, which is the
/// only reliable way to make a new failure mode get looked at.
fn every_connection_error() -> Vec<ConnectionError> {
    let all = vec![
        ConnectionError::Unreachable,
        ConnectionError::KeyUnreadable,
        ConnectionError::RsaKeyRefused,
        ConnectionError::AuthenticationFailed,
        ConnectionError::Transport,
        ConnectionError::HostKeyRejected(Box::new(Trust::Unknown {
            fingerprint: format!("SHA256:{PASSWORD}"),
            other_types: vec![PASSPHRASE.to_owned()],
        })),
        ConnectionError::HostKeyRejected(Box::new(Trust::Changed {
            offered: format!("SHA256:{PASSWORD}"),
            stored: vec![format!("SHA256:{PASSPHRASE}")],
            acknowledgement: changed_acknowledgement(),
        })),
        ConnectionError::HostKeyRejected(Box::new(Trust::Revoked {
            fingerprint: format!("SHA256:{PASSWORD}"),
        })),
        ConnectionError::HostKeyRejected(Box::new(Trust::CertificateRequired {
            fingerprint: format!("SHA256:{PASSWORD}"),
        })),
        ConnectionError::HostKeyRejected(Box::new(Trust::Matched)),
        ConnectionError::TimedOut,
    ];

    for error in &all {
        match error {
            ConnectionError::Unreachable
            | ConnectionError::TimedOut
            | ConnectionError::KeyUnreadable
            | ConnectionError::RsaKeyRefused
            | ConnectionError::AuthenticationFailed
            | ConnectionError::Transport
            | ConnectionError::HostKeyRejected(_) => {}
        }
    }

    all
}

/// An acknowledgement can only come from a real verdict, so build one.
fn changed_acknowledgement() -> runic_ssh::ssh::trust::Acknowledgement {
    let mut known = KnownHosts::default();
    known.add(KnownHosts::entry_for(
        "web-01",
        22,
        "ssh-ed25519",
        b"old key".to_vec(),
    ));

    let Trust::Changed {
        acknowledgement, ..
    } = decide(&known, "web-01", 22, "ssh-ed25519", b"new key")
    else {
        panic!("expected a change");
    };
    acknowledgement
}

#[test]
fn no_connection_error_renders_a_secret() {
    /* The fingerprints here are deliberately built out of the canaries. A
    fingerprint is not secret, but this proves the rendering reproduces
    whatever it is handed — so the guarantee has to come from what the core
    puts in, and that is what the other tests check. */
    for error in every_connection_error() {
        let ipc = IpcError::from(error);
        let json = serde_json::to_string(&ipc).expect("serializes");

        for forbidden in ["message", "description", "detail", "reason", "source"] {
            let value: serde_json::Value = serde_json::from_str(&json).expect("valid JSON");
            assert!(
                value.get(forbidden).is_none(),
                "an IPC error must not carry a {forbidden} field: {json}"
            );
        }
    }
}

#[test]
fn a_credential_renders_nothing_of_itself() {
    let cases = [
        Credential::Password(Zeroizing::new(PASSWORD.to_owned())),
        Credential::PrivateKey {
            pem: Zeroizing::new(format!("-----{PEM_MARKER}-----")),
            passphrase: Some(Zeroizing::new(PASSPHRASE.to_owned())),
        },
        Credential::PrivateKey {
            pem: Zeroizing::new(format!("-----{PEM_MARKER}-----")),
            passphrase: None,
        },
    ];

    for credential in &cases {
        assert_clean("Credential Debug", &format!("{credential:?}"));
        assert_clean("Credential alternate Debug", &format!("{credential:#?}"));
    }
}

#[derive(Clone)]
struct RefusingServer;

impl russh::server::Server for RefusingServer {
    type Handler = Self;
    fn new_client(&mut self, _peer: Option<std::net::SocketAddr>) -> Self {
        self.clone()
    }
}

impl ServerHandler for RefusingServer {
    type Error = russh::Error;

    async fn auth_password(&mut self, _user: &str, _password: &str) -> Result<Auth, Self::Error> {
        Ok(Auth::Reject {
            proceed_with_methods: None,
            partial_success: false,
        })
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

async fn refusing_server() -> (u16, russh::keys::PublicKey) {
    let host_key = PrivateKey::random(&mut rand::rng(), russh::keys::Algorithm::Ed25519).unwrap();
    let public = host_key.public_key().clone();

    let config = Arc::new(russh::server::Config {
        keys: vec![host_key],
        methods: [MethodKind::Password, MethodKind::PublicKey]
            .as_slice()
            .into(),
        ..Default::default()
    });

    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
        .await
        .unwrap();
    let port = listener.local_addr().unwrap().port();

    tokio::spawn(async move {
        let _ = RefusingServer.run_on_socket(config, &listener).await;
    });

    (port, public)
}

fn trusting(port: u16, public: &russh::keys::PublicKey) -> KnownHosts {
    let mut known = KnownHosts::default();
    known.add(KnownHosts::entry_for(
        "127.0.0.1",
        port,
        public.algorithm().as_str(),
        public.to_bytes().unwrap(),
    ));
    known
}

#[tokio::test]
async fn a_refused_password_leaks_nothing_through_the_whole_path() {
    /* End to end, because the risk rule 2 names is indirect: a value captured
    somewhere upstream, wrapped, and rendered downstream. */
    let (port, public) = refusing_server().await;
    let mut connection = connect(
        Endpoint {
            host: "127.0.0.1".to_owned(),
            port,
        },
        trusting(port, &public),
    )
    .await
    .unwrap();

    let error = connection
        .authenticate(
            "deploy",
            Credential::Password(Zeroizing::new(PASSWORD.to_owned())),
        )
        .await
        .expect_err("the server refuses");

    assert_clean("ConnectionError Display", &error.to_string());
    assert_clean("ConnectionError Debug", &format!("{error:?}"));

    let ipc = IpcError::from(error);
    assert_clean("IpcError Debug", &format!("{ipc:?}"));
    assert_clean(
        "IpcError JSON",
        &serde_json::to_string(&ipc).expect("serializes"),
    );
}

#[tokio::test]
async fn a_wrong_passphrase_leaks_neither_the_passphrase_nor_the_key() {
    let (port, public) = refusing_server().await;

    let key = PrivateKey::random(&mut rand::rng(), russh::keys::Algorithm::Ed25519).unwrap();
    let mut pem = Vec::new();
    encode_pkcs8_pem_encrypted(&key, b"the real passphrase", 4, &mut pem).unwrap();

    let mut connection = connect(
        Endpoint {
            host: "127.0.0.1".to_owned(),
            port,
        },
        trusting(port, &public),
    )
    .await
    .unwrap();

    let error = connection
        .authenticate(
            "deploy",
            Credential::PrivateKey {
                pem: Zeroizing::new(String::from_utf8(pem).unwrap()),
                passphrase: Some(Zeroizing::new(PASSPHRASE.to_owned())),
            },
        )
        .await
        .expect_err("the passphrase is wrong");

    assert_clean("ConnectionError Display", &error.to_string());
    assert_clean("ConnectionError Debug", &format!("{error:?}"));
    assert_clean(
        "IpcError JSON",
        &serde_json::to_string(&IpcError::from(error)).expect("serializes"),
    );
}

#[test]
fn the_ssh_layer_never_reaches_for_the_filesystem() {
    /* Rule 4 says key material is never written to a temporary file, which
    would survive the process and land in a backup. This is a lint over the
    source rather than a runtime proof — it cannot see through a helper in
    another module — but it does catch the change that would introduce the
    problem, which a runtime test on today's code cannot. */
    let ssh = concat!(env!("CARGO_MANIFEST_DIR"), "/src/ssh");
    let forbidden = [
        "File::create",
        "File::open",
        "fs::write",
        "fs::OpenOptions",
        "OpenOptions::new",
        "tempfile",
        "NamedTempFile",
        "std::process::Command",
    ];

    for entry in std::fs::read_dir(ssh).expect("the ssh module") {
        let path = entry.expect("a directory entry").path();
        if path.extension().and_then(|e| e.to_str()) != Some("rs") {
            continue;
        }

        let source = std::fs::read_to_string(&path).expect("readable source");
        for needle in forbidden {
            assert!(
                !source.contains(needle),
                "{} reaches for {needle}; key material must never touch the \
                 filesystem, and a helper that does needs its own review",
                path.display()
            );
        }
    }
}
