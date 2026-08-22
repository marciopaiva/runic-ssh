//! Cross-checks the parser against files written by OpenSSH itself.
//!
//! Skipped when `ssh-keygen` is absent, so CI on a runner without OpenSSH does
//! not fail for the wrong reason. Run it locally when touching the parser: the
//! reference implementation is the only authority on this format.

use std::path::PathBuf;
use std::process::Command;

use runic_ssh::ssh::known_hosts::{fingerprint, KnownHosts};

fn ssh_keygen_available() -> bool {
    Command::new("ssh-keygen")
        .arg("-A")
        .arg("-?")
        .output()
        .is_ok()
}

fn fixture(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(name)
}

#[test]
fn fingerprints_agree_with_ssh_keygen() {
    if !ssh_keygen_available() {
        eprintln!("skipping: ssh-keygen not on PATH");
        return;
    }

    let path = fixture("known_hosts_plain");
    let text = std::fs::read_to_string(&path).expect("the fixture");
    let file = KnownHosts::parse(&text);

    let output = Command::new("ssh-keygen")
        .arg("-lf")
        .arg(&path)
        .output()
        .expect("ssh-keygen runs");
    let listed = String::from_utf8_lossy(&output.stdout);

    let mut checked = 0;
    for (entry, line) in file.entries().zip(listed.lines()) {
        let theirs = line.split_whitespace().nth(1).expect("a fingerprint field");
        assert_eq!(
            entry.fingerprint(),
            theirs,
            "fingerprint disagreed with ssh-keygen"
        );
        checked += 1;
    }

    assert!(checked > 0, "the fixture produced no comparable entries");
}

#[test]
fn hashed_hosts_written_by_ssh_keygen_match() {
    /* The hash is HMAC-SHA1 over the host as OpenSSH canonicalises it. Getting
    this wrong means failing to recognise a host we do know, which downgrades
    a changed key to an unknown one. Only the reference implementation can
    settle it. */
    let text = std::fs::read_to_string(fixture("known_hosts_hashed")).expect("the fixture");
    let file = KnownHosts::parse(&text);

    assert!(
        file.matching("web-01", 22).next().is_some(),
        "hashed host did not match"
    );
    assert!(
        file.matching("10.0.4.12", 22).next().is_some(),
        "hashed address did not match"
    );
    assert!(
        file.matching("db-01", 2222).next().is_some(),
        "hashed bracketed host did not match"
    );
    assert!(
        file.matching("db-01", 22).next().is_none(),
        "port was ignored"
    );
}

#[test]
fn the_empty_fingerprint_is_the_known_constant() {
    assert_eq!(
        fingerprint(b""),
        "SHA256:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU"
    );
}
