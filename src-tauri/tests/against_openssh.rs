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

use runic_ssh::ssh::connection::{
    close_shared, connect, connect_reporting, connect_via, share, Credential, Endpoint, Hop, Shared,
};
use runic_ssh::ssh::known_hosts::KnownHosts;
use runic_ssh::ssh::trust::Trust;
use runic_ssh::vault::Secret;

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
        .authenticate(USER, Credential::Password(Secret::new(PASSWORD.to_owned())))
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
            Credential::Password(Secret::new("not the password".to_owned())),
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
            Credential::Password(Secret::new(BASTION_PASSWORD.to_owned())),
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
        Credential::Password(Secret::new(TARGET_PASSWORD.to_owned())),
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
            Credential::Password(Secret::new(BASTION_PASSWORD.to_owned())),
        )
        .await;

    assert!(matches!(
        refused,
        Err(runic_ssh::ssh::connection::ConnectionError::AuthenticationFailed)
    ));

    far.disconnect().await.expect("the chain closes");
}

#[tokio::test]
#[ignore = "needs the jump fixture; see the block above"]
async fn two_hosts_ride_one_real_bastion() {
    /* ADR-0024 against OpenSSH's own forwarding rather than against a server
    we also wrote. Two direct-tcpip channels on one authenticated session, which
    is what a bastion is for and what #164 was not doing. */
    let key = offered_target_key().await;

    let mut known = KnownHosts::default();
    known.add(KnownHosts::entry_for(
        TARGET_HOST,
        TARGET_PORT,
        "ssh-ed25519",
        key,
    ));

    let bastion = open_bastion().await;

    let mut first = connect_via(
        std::sync::Arc::clone(&bastion),
        target_endpoint(),
        known.clone(),
    )
    .await
    .map_err(|failure| failure.error)
    .expect("the first host is reached");

    let mut second = connect_via(std::sync::Arc::clone(&bastion), target_endpoint(), known)
        .await
        .map_err(|failure| failure.error)
        .expect("the second host is reached over the same bastion");

    /* Both authenticate end to end, past a bastion that saw one login. */
    for far in [&mut first, &mut second] {
        far.authenticate(
            TARGET_USER,
            Credential::Password(Secret::new(TARGET_PASSWORD.to_owned())),
        )
        .await
        .expect("the far host accepts its own password");
    }

    /* Letting the bastion's own share go leaves the two riding it. */
    close_shared(bastion).await.expect("the share is let go");

    let mut channel = first.open_shell(120, 40).await.expect("a shell opens");
    channel
        .data(&b"echo still-here; exit\n"[..])
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
        text.contains("still-here"),
        "the bastion outlived its own share because two sessions ride it. It said: {text}"
    );

    first.disconnect().await.expect("the first closes");
    second.disconnect().await.expect("the last closes");
}

/// #251 reported a direct connection to `runic-test-sshd` sometimes hanging
/// on "Reaching <host>..." for 30s+, non-deterministically, against a
/// container confirmed healthy throughout. Forty of these, genuinely
/// sequential in one process (the report's own shape: "repeated attempts...
/// same running app process"), all landing well under five seconds, rules
/// the transport and `Connection::authenticate` themselves out as the
/// cause: the credential this test hands over never goes near a keychain,
/// unlike `authenticate_with_saved`, which is where the real cause was
/// found (`vault::resolve_credential_async`, #251's own fix).
#[tokio::test]
#[ignore = "needs the test container; see the module comment"]
async fn repeated_direct_connections_time_consistently() {
    let known = trusting(offered_key().await);

    let mut durations = Vec::new();
    for at in 0..40 {
        let started = std::time::Instant::now();

        let mut connection = connect(endpoint(), known.clone())
            .await
            .unwrap_or_else(|error| panic!("attempt {at} failed to connect: {error:?}"));

        connection
            .authenticate(USER, Credential::Password(Secret::new(PASSWORD.to_owned())))
            .await
            .unwrap_or_else(|error| panic!("attempt {at} failed to authenticate: {error:?}"));

        durations.push(started.elapsed());

        connection
            .disconnect()
            .await
            .unwrap_or_else(|error| panic!("attempt {at} failed to disconnect: {error:?}"));
    }

    let slowest = durations.iter().max().expect("at least one attempt ran");
    let median = {
        let mut sorted = durations.clone();
        sorted.sort();
        sorted[sorted.len() / 2]
    };

    assert!(
        *slowest < std::time::Duration::from_secs(5),
        "attempt took {slowest:?} against a median of {median:?}, out of {durations:?}"
    );
}

#[tokio::test]
#[ignore = "needs the test container; see the module comment"]
async fn run_command_executes_a_real_command_on_real_sshd() {
    /* `ssh_connection.rs` proves the channel mechanics against a fake server
    that answers every exec the same way. This is the one test that proves a
    real remote shell actually ran what was asked and reported how it
    exited, against `sshd` rather than `russh`'s own server. */
    let known = trusting(offered_key().await);
    let mut connection = connect(endpoint(), known).await.expect("connects");

    connection
        .authenticate(USER, Credential::Password(Secret::new(PASSWORD.to_owned())))
        .await
        .expect("authenticates");

    let ok = connection
        .run_command("echo runic-ok")
        .await
        .expect("the command runs");
    assert_eq!(ok.stdout, b"runic-ok\n");
    assert_eq!(ok.exit_status, Some(0));

    let failed = connection
        .run_command("false")
        .await
        .expect("a failing command still runs");
    assert_eq!(failed.exit_status, Some(1));
}

#[tokio::test]
#[ignore = "needs the test container; see the module comment"]
async fn the_monitor_command_parses_against_a_real_linux_host() {
    /* `ssh::monitor::parse`'s own tests feed it canned text; this proves the
    text a real Linux host actually prints for the combined command still
    parses, on whatever distribution the fixture container runs. */
    let known = trusting(offered_key().await);
    let mut connection = connect(endpoint(), known).await.expect("connects");

    connection
        .authenticate(USER, Credential::Password(Secret::new(PASSWORD.to_owned())))
        .await
        .expect("authenticates");

    let output = connection
        .run_command(&runic_ssh::ssh::monitor::command())
        .await
        .expect("the monitor command runs");

    let stats = runic_ssh::ssh::monitor::parse(&output.stdout);

    assert!(
        stats.cpu_percent.is_some(),
        "no CPU reading from a real /proc/stat: {stats:?}"
    );
    assert!(
        stats.memory.is_some(),
        "no memory reading from a real /proc/meminfo: {stats:?}"
    );
    assert!(
        stats.swap.is_some(),
        "no swap reading from a real /proc/meminfo: {stats:?}"
    );
    assert!(
        stats.disk.is_some(),
        "no disk reading from a real df -P -T: {stats:?}"
    );
    assert!(
        !stats.filesystems.is_empty(),
        "no filesystems from a real df -P -T: {stats:?}"
    );
    assert!(
        stats.network.is_some(),
        "no network rate from a real /proc/net/dev: {stats:?}"
    );
    assert!(
        stats.uptime_seconds.is_some(),
        "no uptime reading from a real /proc/uptime: {stats:?}"
    );
    assert!(
        stats.load_average.is_some(),
        "no load average from a real /proc/loadavg: {stats:?}"
    );
}

#[tokio::test]
#[ignore = "needs the test container; see the module comment"]
async fn a_host_with_no_systemd_reports_no_units_rather_than_failing() {
    /* The fixture container is BusyBox-based and has no `systemctl` at all,
    which makes it exactly the host this behavior exists for: real command
    execution against a real "not found" shell error, not a canned string. */
    let known = trusting(offered_key().await);
    let mut connection = connect(endpoint(), known).await.expect("connects");

    connection
        .authenticate(USER, Credential::Password(Secret::new(PASSWORD.to_owned())))
        .await
        .expect("authenticates");

    let output = connection
        .run_command(runic_ssh::ssh::systemd::list_units_command())
        .await
        .expect("the command runs even though systemctl does not exist");

    assert_eq!(
        runic_ssh::ssh::systemd::parse_units(&output.stdout),
        Vec::new()
    );
}

#[tokio::test]
#[ignore = "needs the test container; see the module comment"]
async fn the_sysinfo_command_parses_against_a_real_linux_host() {
    let known = trusting(offered_key().await);
    let mut connection = connect(endpoint(), known).await.expect("connects");

    connection
        .authenticate(USER, Credential::Password(Secret::new(PASSWORD.to_owned())))
        .await
        .expect("authenticates");

    let output = connection
        .run_command(&runic_ssh::ssh::sysinfo::command())
        .await
        .expect("the sysinfo command runs");

    let info = runic_ssh::ssh::sysinfo::parse(&output.stdout);

    assert!(
        info.kernel.is_some(),
        "no kernel reading from a real uname -srm: {info:?}"
    );
    assert!(
        info.hostname.is_some(),
        "no hostname reading from a real host: {info:?}"
    );
}
