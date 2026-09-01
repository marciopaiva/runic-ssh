//! `sftp::session` against a real OpenSSH SFTP subsystem.
//!
//! `russh`'s own in-process test server (`ssh_connection.rs`) proves the
//! channel opens; it does not speak SFTP, so nothing about listing or
//! transferring a file can be proven against it. Only the reference
//! implementation can settle that, the same reasoning `against_openssh.rs`
//! and `known_hosts_against_openssh.rs` already follow.
//!
//! Ignored by default because CI has no container to talk to:
//!
//! ```sh
//! podman build -t runic-test-sshd src-tauri/tests/fixtures/sshd
//! podman run -d --name runic-test-sshd -p 2222:2222 runic-test-sshd
//! cargo test --test sftp_against_openssh -- --ignored --test-threads=1 --nocapture
//! ```
//!
//! `--test-threads=1`: several of these mutate the same fixture directory
//! (ADR-0048's create/rename/remove tests, alongside the upload/transfer
//! ones already here), and `many_concurrent_listings_on_one_connection_
//! all_agree_with_a_baseline` reads that same directory across its own
//! span expecting nothing else to touch it meanwhile. Run in parallel, a
//! mutating test landing mid-span makes that one fail on a real
//! interleaving rather than a bug in what either test proves; run
//! serially, the fixture is exactly as stable as `docs/testing.md` already
//! assumes.
//!
//! The remote-to-remote test also needs a second instance of the same
//! image, on `OTHER_PORT`:
//!
//! ```sh
//! podman run -d --name runic-test-sshd-2223 -p 2223:2222 runic-test-sshd
//! ```

use runic_ssh::sftp::error::SftpError;
use runic_ssh::sftp::session::{self, SftpSession};
use runic_ssh::ssh::connection::{
    connect, connect_reporting, connect_via, share, Connection, Credential, Endpoint,
};
use runic_ssh::ssh::known_hosts::KnownHosts;
use runic_ssh::ssh::trust::Trust;
use runic_ssh::vault::Secret;

const HOST: &str = "127.0.0.1";
const PORT: u16 = 2222;
/// A second, independent instance of the same fixture image (see
/// `docs/testing.md`), kept up alongside the one on `PORT` specifically so
/// a test can hold two connections open at once and call them different
/// hosts, the way ADR-0045's remote-to-remote transfer needs to be proven
/// against something other than one session talking to itself.
const OTHER_PORT: u16 = 2223;
const USER: &str = "deploy";
const PASSWORD: &str = "runic-test";
const HOME: &str = "/home/deploy";

fn endpoint(port: u16) -> Endpoint {
    Endpoint {
        host: HOST.to_owned(),
        port,
    }
}

/// Reads the host key by connecting once and taking what was offered, the
/// same helper `against_openssh.rs` uses.
async fn offered_key(port: u16) -> Vec<u8> {
    let (_, offered) = connect_reporting(endpoint(port), KnownHosts::default())
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

fn trusting(port: u16, key: Vec<u8>) -> KnownHosts {
    let mut known = KnownHosts::default();
    known.add(KnownHosts::entry_for(HOST, port, "ssh-ed25519", key));
    known
}

/// Connects, authenticates and opens an SFTP session in one call.
///
/// The `Connection` is handed back too, and kept alive for as long as the
/// session is used: nothing here calls `Connection::disconnect`, and the
/// channel the session runs over is only guaranteed to answer while the
/// connection that opened it has not been torn down.
async fn authenticated(port: u16) -> (Connection, SftpSession) {
    let known = trusting(port, offered_key(port).await);
    let mut connection = connect(endpoint(port), known).await.expect("connects");
    connection
        .authenticate(USER, Credential::Password(Secret::new(PASSWORD.to_owned())))
        .await
        .expect("authenticates");
    let sftp = session::open(&connection).await.expect("opens sftp");
    (connection, sftp)
}

#[tokio::test]
#[ignore = "needs the test container; see the module comment"]
async fn listing_the_home_directory_shows_the_fixtures_files() {
    let (_connection, sftp) = authenticated(PORT).await;

    let entries = session::list(&sftp, HOME).await.expect("lists");
    let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();

    assert!(names.contains(&"README"), "entries were: {names:?}");
    assert!(names.contains(&"logs"), "entries were: {names:?}");
    assert!(names.contains(&"config"), "entries were: {names:?}");

    let logs = entries
        .iter()
        .find(|e| e.name == "logs")
        .expect("the logs directory is listed");
    assert!(logs.is_dir, "logs should be a directory");
    assert!(!logs.is_symlink, "logs is a real directory, not a symlink");

    let readme = entries
        .iter()
        .find(|e| e.name == "README")
        .expect("README is listed");
    assert!(!readme.is_dir, "README is a file");
    assert!(readme.size > 0, "README is not empty");

    /* `.` and `..` are real SFTP entries a server sends; they must not
    survive `check_name`'s filtering to appear as if they were ordinary
    files. */
    assert!(!names.contains(&"."));
    assert!(!names.contains(&".."));
}

/// What `commands::sftp::sftp_list` does per call: a fresh channel, then one
/// listing over it.
async fn open_and_list(connection: &Connection, path: &str) -> Vec<session::Entry> {
    let sftp = session::open(connection).await.expect("opens sftp");
    session::list(&sftp, path).await.expect("lists")
}

/// #252 suspected that two of these in flight for the same connection could
/// corrupt one another's result, after a truncated listing was observed once
/// while building the SFTP sidebar tree. Eight of these, genuinely
/// concurrent across worker threads, never reproduced it: this is a
/// regression guard against the shape of that suspicion, not evidence the
/// original observation had this cause. #252 stays open with that written
/// down, since the observation itself was real and is still unexplained.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "needs the test container; see #252 and the module comment"]
async fn many_concurrent_listings_on_one_connection_all_agree_with_a_baseline() {
    let known = trusting(PORT, offered_key(PORT).await);
    let mut connection = connect(endpoint(PORT), known).await.expect("connects");
    connection
        .authenticate(USER, Credential::Password(Secret::new(PASSWORD.to_owned())))
        .await
        .expect("authenticates");

    let mut baseline: Vec<String> = open_and_list(&connection, HOME)
        .await
        .into_iter()
        .map(|entry| entry.name)
        .collect();
    baseline.sort();

    let connection = std::sync::Arc::new(connection);
    let mut tasks = tokio::task::JoinSet::new();
    for _ in 0..8 {
        let connection = std::sync::Arc::clone(&connection);
        tasks.spawn(async move { open_and_list(&connection, HOME).await });
    }

    let results = tasks.join_all().await;
    for (at, entries) in results.into_iter().enumerate() {
        let mut names: Vec<String> = entries.into_iter().map(|entry| entry.name).collect();
        names.sort();
        assert_eq!(names, baseline, "listing {at} disagreed with the baseline");
    }
}

#[tokio::test]
#[ignore = "needs the test container; see the module comment"]
async fn listing_an_absent_directory_is_a_typed_not_found() {
    let (_connection, sftp) = authenticated(PORT).await;

    let error = session::list(&sftp, "/home/deploy/does-not-exist")
        .await
        .expect_err("the directory does not exist");

    assert_eq!(error, SftpError::NotFound);
}

#[tokio::test]
#[ignore = "needs the test container; see the module comment"]
async fn downloading_the_readme_matches_what_the_container_wrote() {
    let (_connection, sftp) = authenticated(PORT).await;
    let dir = tempfile::tempdir().expect("a scratch directory");

    let mut seen_progress = false;
    let destination = session::download(&sftp, &format!("{HOME}/README"), dir.path(), |_| {
        seen_progress = true;
    })
    .await
    .expect("downloads");

    assert_eq!(destination, dir.path().join("README"));
    let contents = std::fs::read_to_string(&destination).expect("reads the download");
    assert!(
        contents.contains("hello from the"),
        "unexpected contents: {contents:?}"
    );
    assert!(seen_progress, "progress was never reported");
}

#[tokio::test]
#[ignore = "needs the test container; see the module comment"]
async fn downloading_a_larger_file_reports_progress_up_to_its_total() {
    let (_connection, sftp) = authenticated(PORT).await;
    let dir = tempfile::tempdir().expect("a scratch directory");

    let mut last_transferred = 0_u64;
    let mut last_total = None;
    let destination = session::download(
        &sftp,
        &format!("{HOME}/logs/big.log"),
        dir.path(),
        |progress| {
            assert!(
                progress.transferred >= last_transferred,
                "progress went backwards"
            );
            last_transferred = progress.transferred;
            last_total = progress.total;
        },
    )
    .await
    .expect("downloads");

    let on_disk = std::fs::metadata(&destination)
        .expect("the file landed")
        .len();
    assert_eq!(
        last_transferred, on_disk,
        "reported progress matches what landed"
    );
    assert_eq!(
        last_total,
        Some(on_disk),
        "reported total matches what landed"
    );
}

#[tokio::test]
#[ignore = "needs the test container; see the module comment"]
async fn uploading_then_downloading_round_trips_the_content() {
    let (_connection, sftp) = authenticated(PORT).await;
    let scratch = tempfile::tempdir().expect("a scratch directory");

    let local_source = scratch.path().join("upload-me.txt");
    let content = b"a file this test wrote and will now send over SFTP\n";
    std::fs::write(&local_source, content).expect("writes the source file");

    let mut upload_progress = 0_u64;
    let remote_path = session::upload(&sftp, &local_source, HOME, |progress| {
        upload_progress = progress.transferred;
    })
    .await
    .expect("uploads");

    assert_eq!(remote_path, format!("{HOME}/upload-me.txt"));
    assert_eq!(upload_progress, content.len() as u64);

    let round_tripped = session::download(&sftp, &remote_path, scratch.path(), |_| {})
        .await
        .expect("downloads it back");
    let read_back = std::fs::read(&round_tripped).expect("reads the round trip");
    assert_eq!(read_back, content);

    /* The fixture is a long-lived container other tests and the maintainer
    poke at by hand; leaving what this test wrote there would be found later
    with no note of where it came from. */
    session::remove(&sftp, HOME, "upload-me.txt", false)
        .await
        .expect("removes what this test uploaded");
}

/// ADR-0045: neither end of this is a local file. Two real, independent
/// connections (`PORT` and `OTHER_PORT`), so this proves the transfer
/// against something other than one session talking to itself.
///
/// The fixture's own README is identical on every instance of the image,
/// which would make "the destination now has the source's README" true
/// whether or not the transfer actually moved anything. A freshly uploaded,
/// distinctively-named file with unique content is what makes the
/// assertion mean something.
#[tokio::test]
#[ignore = "needs both test containers; see the module comment"]
async fn transferring_between_two_connections_matches_the_source() {
    let (_source_connection, source) = authenticated(PORT).await;
    let (_dest_connection, destination) = authenticated(OTHER_PORT).await;

    let scratch = tempfile::tempdir().expect("a scratch directory");
    let local_source = scratch.path().join("remote-to-remote.txt");
    let content = b"ADR-0045's own remote-to-remote transfer wrote this\n";
    std::fs::write(&local_source, content).expect("writes the file this test transfers");

    let source_path = session::upload(&source, &local_source, HOME, |_| {})
        .await
        .expect("seeds the source with a file only this test could have put there");

    let mut transferred = 0_u64;
    let dest_path = session::transfer(&source, &source_path, &destination, HOME, |progress| {
        transferred = progress.transferred;
    })
    .await
    .expect("transfers");

    assert_eq!(dest_path, format!("{HOME}/remote-to-remote.txt"));
    assert_eq!(transferred, content.len() as u64);

    let round_tripped = session::download(&destination, &dest_path, scratch.path(), |_| {})
        .await
        .expect("downloads what landed on the destination");
    assert_eq!(
        std::fs::read(&round_tripped).expect("reads the transferred copy"),
        content,
    );

    source
        .remove_file(&source_path)
        .await
        .expect("removes what this test uploaded to the source");
    destination
        .remove_file(&dest_path)
        .await
        .expect("removes what this test transferred to the destination");
}

/// Temporary diagnosis for a report that a transfer to a destination behind
/// a jump host never lands, even though a plain listing of one already
/// works. Uses the same bastion/target fixture `against_openssh.rs` does
/// (`docs/testing.md`, "A bastion and a host behind it"), and the same
/// `authenticated` shape as this file's other tests for the direct source.
const BASTION_PORT: u16 = 2226;
const BASTION_USER: &str = "jump";
const BASTION_PASSWORD: &str = "runic-bastion";
const TARGET_HOST: &str = "target.internal";
const TARGET_PORT: u16 = 2222;
const TARGET_USER: &str = "deploy";
const TARGET_PASSWORD: &str = "runic-target";

#[tokio::test]
#[ignore = "needs the jump fixture; see docs/testing.md"]
async fn transferring_to_a_destination_behind_a_jump_host() {
    let (_source_connection, source) = authenticated(PORT).await;

    let (_, offered) = connect_reporting(
        Endpoint {
            host: HOST.to_owned(),
            port: BASTION_PORT,
        },
        KnownHosts::default(),
    )
    .await
    .err()
    .expect("an empty known_hosts must refuse the bastion");
    let mut known = KnownHosts::default();
    known.add(KnownHosts::entry_for(
        HOST,
        BASTION_PORT,
        "ssh-ed25519",
        offered.expect("the bastion offered a key").key,
    ));

    let mut bastion = connect(
        Endpoint {
            host: HOST.to_owned(),
            port: BASTION_PORT,
        },
        known.clone(),
    )
    .await
    .expect("the bastion connects");
    bastion
        .authenticate(
            BASTION_USER,
            Credential::Password(Secret::new(BASTION_PASSWORD.to_owned())),
        )
        .await
        .expect("the bastion authenticates");

    let target_endpoint = Endpoint {
        host: TARGET_HOST.to_owned(),
        port: TARGET_PORT,
    };
    let failure = connect_via(share(bastion), target_endpoint.clone(), known.clone())
        .await
        .err()
        .expect("an empty known_hosts must refuse the far host too");
    known.add(KnownHosts::entry_for(
        TARGET_HOST,
        TARGET_PORT,
        "ssh-ed25519",
        failure.offered.expect("the far host offered a key").key,
    ));

    let mut bastion = connect(
        Endpoint {
            host: HOST.to_owned(),
            port: BASTION_PORT,
        },
        known.clone(),
    )
    .await
    .expect("the bastion reconnects");
    bastion
        .authenticate(
            BASTION_USER,
            Credential::Password(Secret::new(BASTION_PASSWORD.to_owned())),
        )
        .await
        .expect("the bastion authenticates again");

    let mut far = connect_via(share(bastion), target_endpoint, known)
        .await
        .map_err(|failure| failure.error)
        .expect("the far host connects through the bastion");
    far.authenticate(
        TARGET_USER,
        Credential::Password(Secret::new(TARGET_PASSWORD.to_owned())),
    )
    .await
    .expect("the far host authenticates");

    let destination = session::open(&far)
        .await
        .expect("opens sftp on the far host");

    let scratch = tempfile::tempdir().expect("a scratch directory");
    let local_source = scratch.path().join("via-jump.txt");
    let content = b"a file this test wrote to check a jump-hosted transfer\n";
    std::fs::write(&local_source, content).expect("writes the source file");

    let source_path = session::upload(&source, &local_source, HOME, |_| {})
        .await
        .expect("seeds the source with a file only this test could have put there");

    let mut transferred = 0_u64;
    let dest_path = session::transfer(
        &source,
        &source_path,
        &destination,
        "/home/deploy",
        |progress| {
            transferred = progress.transferred;
        },
    )
    .await
    .expect("transfers to the destination behind the bastion");

    assert_eq!(dest_path, "/home/deploy/via-jump.txt");
    assert_eq!(transferred, content.len() as u64);

    source
        .remove_file(&source_path)
        .await
        .expect("removes what this test uploaded to the source");
    destination
        .remove_file(&dest_path)
        .await
        .expect("removes what this test transferred to the destination");
}

/// ADR-0048.
#[tokio::test]
#[ignore = "needs the test container; see the module comment"]
async fn creating_a_directory_makes_it_listable_and_it_is_removable_after() {
    let (_connection, sftp) = authenticated(PORT).await;

    let created = session::create_dir(&sftp, HOME, "a-new-directory")
        .await
        .expect("creates the directory");
    assert_eq!(created, format!("{HOME}/a-new-directory"));

    let entries = session::list(&sftp, HOME).await.expect("lists");
    assert!(
        entries
            .iter()
            .any(|e| e.name == "a-new-directory" && e.is_dir),
        "the new directory should be listed"
    );

    session::remove(&sftp, HOME, "a-new-directory", true)
        .await
        .expect("removes the now-empty directory");
}

/// ADR-0048.
#[tokio::test]
#[ignore = "needs the test container; see the module comment"]
async fn a_hostile_new_directory_name_is_refused_before_reaching_the_server() {
    let (_connection, sftp) = authenticated(PORT).await;

    let error = session::create_dir(&sftp, HOME, "../escape")
        .await
        .expect_err("a name with a separator is refused");

    assert!(matches!(error, SftpError::RefusedName(_)));
}

/// ADR-0048.
#[tokio::test]
#[ignore = "needs the test container; see the module comment"]
async fn renaming_moves_the_entry_within_its_own_directory() {
    let (_connection, sftp) = authenticated(PORT).await;

    session::create_dir(&sftp, HOME, "rename-me")
        .await
        .expect("creates a directory to rename");

    let renamed = session::rename(&sftp, HOME, "rename-me", "renamed")
        .await
        .expect("renames it");
    assert_eq!(renamed, format!("{HOME}/renamed"));

    let entries = session::list(&sftp, HOME).await.expect("lists");
    assert!(
        !entries.iter().any(|e| e.name == "rename-me"),
        "the old name is gone"
    );
    assert!(
        entries.iter().any(|e| e.name == "renamed"),
        "the new name is listed"
    );

    session::remove(&sftp, HOME, "renamed", true)
        .await
        .expect("removes what this test created");
}

/// ADR-0048: SFTP v3's own `remove_dir` only removes an empty directory,
/// so a directory with a file inside it proves the recursive walk, not
/// only the empty-directory case already covered above.
#[tokio::test]
#[ignore = "needs the test container; see the module comment"]
async fn removing_a_directory_removes_what_is_inside_it_too() {
    let (_connection, sftp) = authenticated(PORT).await;
    let scratch = tempfile::tempdir().expect("a scratch directory");

    let dir_path = session::create_dir(&sftp, HOME, "non-empty-dir")
        .await
        .expect("creates the directory");

    let local_source = scratch.path().join("inner.txt");
    std::fs::write(&local_source, b"x").expect("writes the fixture");
    let inner_path = session::upload(&sftp, &local_source, &dir_path, |_| {})
        .await
        .expect("uploads a file inside the new directory");

    session::remove(&sftp, HOME, "non-empty-dir", true)
        .await
        .expect("removes the directory and everything inside it");

    let entries = session::list(&sftp, HOME).await.expect("lists");
    assert!(
        !entries.iter().any(|e| e.name == "non-empty-dir"),
        "the directory should be gone"
    );

    let error = session::list(&sftp, &inner_path)
        .await
        .expect_err("the file inside it went with it");
    assert_eq!(error, SftpError::NotFound);
}
