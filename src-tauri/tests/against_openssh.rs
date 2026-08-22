//! The core against a real OpenSSH server.
//!
//! Every other SSH test in this crate runs against `russh`'s own server, which
//! keeps CI honest and fast but shares an implementation with the client. A
//! shared assumption is invisible to a test where both sides make it.
//!
//! These run against `sshd` in a container, and are ignored by default because
//! CI has no container to talk to. `docs/testing.md` has the details; in short:
//!
//! ```sh
//! podman build -t runic-test-sshd src-tauri/tests/fixtures/sshd
//! podman run -d --name runic-test-sshd -p 2222:2222 runic-test-sshd
//! cargo test --test against_openssh -- --ignored --nocapture
//! ```
//!
//! The container generates its host keys at start, so recreating it is how the
//! changed-key path gets exercised against something real.

use zeroize::Zeroizing;

use runic_ssh::ssh::connection::{connect, connect_reporting, Credential, Endpoint};
use runic_ssh::ssh::known_hosts::KnownHosts;
use runic_ssh::ssh::trust::Trust;

const HOST: &str = "127.0.0.1";
const PORT: u16 = 2222;
const USER: &str = "deploy";
const PASSWORD: &str = "runic-test";

fn endpoint() -> Endpoint {
    Endpoint {
        host: HOST.to_owned(),
        port: PORT,
    }
}

/// Reads the host key by connecting once and taking what was offered.
async fn offered_key() -> Vec<u8> {
    let (_, offered) = connect_reporting(endpoint(), KnownHosts::default())
        .await
        .err()
        .expect("an empty known_hosts must refuse");

    let offered = offered.expect("the server offered a key");
    assert!(
        matches!(offered.verdict, Trust::Unknown { .. }),
        "an unseen host key is unknown, not {:?}",
        offered.verdict
    );

    offered.key
}

fn trusting(key: Vec<u8>) -> KnownHosts {
    let mut known = KnownHosts::default();
    known.add(KnownHosts::entry_for(HOST, PORT, "ssh-ed25519", key));
    known
}

#[tokio::test]
#[ignore = "needs the test container; see the module comment"]
async fn an_unseen_host_key_is_refused_before_authentication() {
    /* Rule 3, against a real server: the refusal happens in the transport,
    before a credential is ever offered. */
    let _ = offered_key().await;
}

#[tokio::test]
#[ignore = "needs the test container; see the module comment"]
async fn a_password_authenticates_against_real_sshd() {
    let known = trusting(offered_key().await);

    let mut connection = connect(endpoint(), known).await.expect("connects");

    connection
        .authenticate(
            USER,
            Credential::Password(Zeroizing::new(PASSWORD.to_owned())),
        )
        .await
        .expect("authenticates");

    let mut channel = connection.open_shell(120, 40).await.expect("a shell opens");

    /* A pty from OpenSSH, not from a server we also wrote. */
    channel
        .data(&b"echo runic-ok; exit\n"[..])
        .await
        .expect("sends");

    let mut seen = Vec::new();
    while let Some(message) = channel.wait().await {
        match message {
            russh::ChannelMsg::Data { data } => seen.extend_from_slice(&data),
            russh::ChannelMsg::Eof | russh::ChannelMsg::Close => break,
            _ => {}
        }
    }

    let text = String::from_utf8_lossy(&seen);
    assert!(text.contains("runic-ok"), "the shell said: {text}");
}

#[tokio::test]
#[ignore = "needs the test container; see the module comment"]
async fn a_wrong_password_is_refused_by_real_sshd() {
    let known = trusting(offered_key().await);
    let mut connection = connect(endpoint(), known).await.expect("connects");

    let refused = connection
        .authenticate(
            USER,
            Credential::Password(Zeroizing::new("not the password".to_owned())),
        )
        .await;

    assert!(refused.is_err(), "sshd accepted the wrong password");
}

#[tokio::test]
#[ignore = "needs the test container; see the module comment"]
async fn a_changed_host_key_is_caught_against_real_sshd() {
    /* Recreate the container between the two halves of this test:
    `podman rm -f runic-test-sshd && podman run -d --name runic-test-sshd -p 2222:2222 runic-test-sshd`
    A stale key stands in for that here so the test can run unattended. */
    let mut known = KnownHosts::default();
    known.add(KnownHosts::entry_for(
        HOST,
        PORT,
        "ssh-ed25519",
        vec![0u8; 51],
    ));

    let (_, offered) = connect_reporting(endpoint(), known)
        .await
        .err()
        .expect("a key that does not match must refuse");

    let offered = offered.expect("the server offered a key");
    assert!(
        matches!(offered.verdict, Trust::Changed { .. }),
        "a different stored key is changed, not {:?}",
        offered.verdict
    );
}
