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

use runic_ssh::ssh::connection::{
    close_shared, connect, connect_reporting, connect_via, share, Credential, Endpoint, Hop, Shared,
};
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

/* ------------------------------------------------------------------------ *
 * A host reached through a bastion. ADR-0023, issue #133.
 *
 * The in-process test proves the mechanism with russh on both ends. This one
 * proves it against OpenSSH's own direct-tcpip, and against a topology where
 * the far host is genuinely unreachable from this machine: a chain that
 * quietly connected direct could not pass it.
 *
 *   podman network create runic-jump
 *   podman build -t runic-test-bastion --build-arg USERNAME=jump \
 *     --build-arg PASSWORD=runic-bastion --build-arg ROLE=bastion \
 *     src-tauri/tests/fixtures/sshd
 *   podman build -t runic-test-target --build-arg USERNAME=deploy \
 *     --build-arg PASSWORD=runic-target --build-arg ROLE="target behind the bastion" \
 *     src-tauri/tests/fixtures/sshd
 *   podman run -d --name runic-test-target --network runic-jump \
 *     --network-alias target.internal runic-test-target
 *   podman run -d --name runic-test-bastion --network runic-jump \
 *     -p 2226:2222 runic-test-bastion
 *
 * `docs/testing.md`, under "A bastion and a host behind it", has the rest.
 * ------------------------------------------------------------------------ */

const BASTION_PORT: u16 = 2226;
const BASTION_USER: &str = "jump";
const BASTION_PASSWORD: &str = "runic-bastion";

/// The far host, named as only the bastion's network can resolve it.
///
/// That is the point rather than an accident. `target.internal` does not
/// resolve on this machine, so the name is meaningless here and is resolved by
/// the bastion. Reaching it at all is proof the hop happened.
const TARGET_HOST: &str = "target.internal";
const TARGET_PORT: u16 = 2222;
const TARGET_USER: &str = "deploy";
const TARGET_PASSWORD: &str = "runic-target";

fn bastion_endpoint() -> Endpoint {
    Endpoint {
        host: HOST.to_owned(),
        port: BASTION_PORT,
    }
}

fn target_endpoint() -> Endpoint {
    Endpoint {
        host: TARGET_HOST.to_owned(),
        port: TARGET_PORT,
    }
}

/// Connects to the bastion and authenticates, ready to carry a chain.
///
/// Handed back as a share since ADR-0024: a bastion is ridden rather than
/// owned, and several sessions may hold the same one.
async fn open_bastion() -> Shared {
    let (_, offered) = connect_reporting(bastion_endpoint(), KnownHosts::default())
        .await
        .err()
        .expect("an empty known_hosts must refuse");
    let offered = offered.expect("the bastion offered a key");

    let mut known = KnownHosts::default();
    known.add(KnownHosts::entry_for(
        HOST,
        BASTION_PORT,
        "ssh-ed25519",
        offered.key,
    ));

    let mut bastion = connect(bastion_endpoint(), known)
        .await
        .expect("the bastion connects");

    bastion
        .authenticate(
            BASTION_USER,
            Credential::Password(Zeroizing::new(BASTION_PASSWORD.to_owned())),
        )
        .await
        .expect("the bastion authenticates");

    share(bastion)
}

/// Reads the far host's key by reaching it through the bastion once.
async fn offered_target_key() -> Vec<u8> {
    let failure = connect_via(
        open_bastion().await,
        target_endpoint(),
        KnownHosts::default(),
    )
    .await
    .err()
    .expect("an empty known_hosts must refuse the far host too");

    let offered = failure.offered.expect("the far host offered a key");
    assert_eq!(
        offered.hop,
        Hop::Target,
        "the prompt has to be able to say which host is asking"
    );
    assert!(
        matches!(offered.verdict, Trust::Unknown { .. }),
        "an unseen far key is unknown, not {:?}",
        offered.verdict
    );

    close_shared(failure.bastion).await.expect("it closes");
    offered.key
}

#[tokio::test]
#[ignore = "needs the jump fixture; see the block above"]
async fn the_far_host_key_is_verified_through_real_openssh() {
    /* Rule 3 at the second hop, against a real server. A tunnel is not a
    reason to trust what comes out of it. */
    let _ = offered_target_key().await;
}

#[tokio::test]
#[ignore = "needs the jump fixture; see the block above"]
async fn a_shell_opens_on_a_host_this_machine_cannot_reach() {
    let key = offered_target_key().await;

    let mut known = KnownHosts::default();
    known.add(KnownHosts::entry_for(
        TARGET_HOST,
        TARGET_PORT,
        "ssh-ed25519",
        key,
    ));

    let mut far = connect_via(open_bastion().await, target_endpoint(), known)
        .await
        .map_err(|failure| failure.error)
        .expect("the far host is reached through the bastion");

    assert!(far.is_chained());

    far.authenticate(
        TARGET_USER,
        Credential::Password(Zeroizing::new(TARGET_PASSWORD.to_owned())),
    )
    .await
    .expect("the far host accepts its own password");

    let mut channel = far.open_shell(120, 40).await.expect("a shell opens");

    channel
        .data(&b"cat /home/deploy/README; exit\n"[..])
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
    assert!(
        text.contains("target behind the bastion"),
        "a pty on the far host, through OpenSSH's own forwarding. It said: {text}"
    );

    far.disconnect().await.expect("the chain closes");
}

#[tokio::test]
#[ignore = "needs the jump fixture; see the block above"]
async fn the_bastion_password_does_not_open_the_far_host() {
    /* The credential that crosses the tunnel is the far host's own, and the
    bastion never sees it. If one password opened both, this fixture could not
    tell an implementation that sent the wrong one from one that worked. */
    let key = offered_target_key().await;

    let mut known = KnownHosts::default();
    known.add(KnownHosts::entry_for(
        TARGET_HOST,
        TARGET_PORT,
        "ssh-ed25519",
        key,
    ));

    let mut far = connect_via(open_bastion().await, target_endpoint(), known)
        .await
        .map_err(|failure| failure.error)
        .expect("the far host is reached");

    let refused = far
        .authenticate(
            TARGET_USER,
            Credential::Password(Zeroizing::new(BASTION_PASSWORD.to_owned())),
        )
        .await;

    assert!(matches!(
        refused,
        Err(runic_ssh::ssh::connection::ConnectionError::AuthenticationFailed)
    ));

    far.disconnect().await.expect("the chain closes");
}
