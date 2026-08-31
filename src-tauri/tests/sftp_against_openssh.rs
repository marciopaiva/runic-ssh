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
//! cargo test --test sftp_against_openssh -- --ignored --nocapture
//! ```

use runic_ssh::sftp::error::SftpError;
use runic_ssh::sftp::session::{download, list, upload};
use runic_ssh::ssh::connection::{connect, connect_reporting, Credential, Endpoint};
use runic_ssh::ssh::known_hosts::KnownHosts;
use runic_ssh::ssh::trust::Trust;
use runic_ssh::vault::Secret;

const HOST: &str = "127.0.0.1";
const PORT: u16 = 2222;
const USER: &str = "deploy";
const PASSWORD: &str = "runic-test";
const HOME: &str = "/home/deploy";

fn endpoint() -> Endpoint {
    Endpoint {
        host: HOST.to_owned(),
        port: PORT,
    }
}

/// Reads the host key by connecting once and taking what was offered, the
/// same helper `against_openssh.rs` uses.
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

async fn authenticated() -> runic_ssh::ssh::connection::Connection {
    let known = trusting(offered_key().await);
    let mut connection = connect(endpoint(), known).await.expect("connects");
    connection
        .authenticate(USER, Credential::Password(Secret::new(PASSWORD.to_owned())))
        .await
        .expect("authenticates");
    connection
}

#[tokio::test]
#[ignore = "needs the test container; see the module comment"]
async fn listing_the_home_directory_shows_the_fixtures_files() {
    let connection = authenticated().await;

    let entries = list(&connection, HOME).await.expect("lists");
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

#[tokio::test]
#[ignore = "needs the test container; see the module comment"]
async fn listing_an_absent_directory_is_a_typed_not_found() {
    let connection = authenticated().await;

    let error = list(&connection, "/home/deploy/does-not-exist")
        .await
        .expect_err("the directory does not exist");

    assert_eq!(error, SftpError::NotFound);
}

#[tokio::test]
#[ignore = "needs the test container; see the module comment"]
async fn downloading_the_readme_matches_what_the_container_wrote() {
    let connection = authenticated().await;
    let dir = tempfile::tempdir().expect("a scratch directory");

    let mut seen_progress = false;
    let destination = download(&connection, &format!("{HOME}/README"), dir.path(), |_| {
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
    let connection = authenticated().await;
    let dir = tempfile::tempdir().expect("a scratch directory");

    let mut last_transferred = 0_u64;
    let mut last_total = None;
    let destination = download(
        &connection,
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
    let connection = authenticated().await;
    let scratch = tempfile::tempdir().expect("a scratch directory");

    let local_source = scratch.path().join("upload-me.txt");
    let content = b"a file this test wrote and will now send over SFTP\n";
    std::fs::write(&local_source, content).expect("writes the source file");

    let mut upload_progress = 0_u64;
    let remote_path = upload(&connection, &local_source, HOME, |progress| {
        upload_progress = progress.transferred;
    })
    .await
    .expect("uploads");

    assert_eq!(remote_path, format!("{HOME}/upload-me.txt"));
    assert_eq!(upload_progress, content.len() as u64);

    let round_tripped = download(&connection, &remote_path, scratch.path(), |_| {})
        .await
        .expect("downloads it back");
    let read_back = std::fs::read(&round_tripped).expect("reads the round trip");
    assert_eq!(read_back, content);

    /* The fixture is a long-lived container other tests and the maintainer
    poke at by hand; leaving what this test wrote there would be found later
    with no note of where it came from. `remove_file` is deliberately not
    part of `sftp::session` (deletion is out of #127's first cut), so this
    goes around it rather than adding the operation just to clean up after
    a test. */
    let channel = connection.open_sftp().await.expect("reopens for cleanup");
    let sftp = russh_sftp::client::SftpSession::new(channel.into_stream())
        .await
        .expect("starts a session for cleanup");
    sftp.remove_file(&remote_path)
        .await
        .expect("removes what this test uploaded");
}
