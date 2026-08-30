//! Cross-checks the parser against files written by OpenSSH itself, and
//! against `ssh-keygen`'s own lookup, over generated input rather than the
//! handful of examples the unit tests in `known_hosts.rs` use.
//!
//! Skipped when `ssh-keygen` is absent, so CI on a runner without OpenSSH does
//! not fail for the wrong reason. Run it locally when touching the parser: the
//! reference implementation is the only authority on this format.
//!
//! `ssh-keygen -F` is not a rubber stamp. Three genuine, confirmed
//! disagreements came out of writing this file, and each one is pinned as its
//! own unit test in `known_hosts.rs` with the reasoning for leaving it alone;
//! the three `ssh_keygen_disagrees_*` tests below are what confirmed each one
//! against the real binary in the first place, so a future OpenSSH becoming
//! stricter or looser is caught here rather than assumed to still hold. See
//! issue #129.

use std::path::{Path, PathBuf};
use std::process::Command;

use base64ct::{Base64, Encoding};
use rand::rngs::StdRng;
use rand::{RngExt, SeedableRng};

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

/// The query form OpenSSH itself writes: bracketed only for a non-standard
/// port, exactly as `known_hosts.rs`'s own `canonical_host` does.
fn query_form(host: &str, port: u16) -> String {
    if port == 22 {
        host.to_owned()
    } else {
        format!("[{host}]:{port}")
    }
}

/// How many lines `ssh-keygen -F` considers a match for this host and port.
/// Counting rather than checking presence is what catches a duplicate or a
/// second key type silently collapsing into one match, or the reverse.
fn keygen_match_count(path: &Path, host: &str, port: u16) -> usize {
    let output = Command::new("ssh-keygen")
        .arg("-F")
        .arg(query_form(host, port))
        .arg("-f")
        .arg(path)
        .output()
        .expect("ssh-keygen runs");
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter(|line| line.starts_with("# Host"))
        .count()
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

const ED25519_KEY: &str = "AAAAC3NzaC1lZDI1NTE5AAAAILLTA2L+rjqJGBriF6L5/Hb5s08PmxcOY90k4tQFNwud";
const RSA_KEY: &str = "AAAAB3NzaC1yc2EAAAADAQABAAABgQC7vbqajDhA9K5tGm2xUcQ9Tf1RwNq4Yz8Lm3Kp";
const ECDSA_KEY: &str =
    "AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBBOreqfIzsce6yEA24n1o11rzUsGvJvXbc8XR4ub0nk3Qmvxs1CzWv8=";

/// The matrix issue #129 asks for: one line per shape, each host unique so a
/// query cannot accidentally cross into another case. Left out on purpose:
/// the three lines the `ssh_keygen_disagrees_*` tests below cover instead,
/// since folding them in here would make this test fail on a confirmed and
/// accepted disagreement rather than an unexpected one.
fn matrix_text() -> String {
    format!(
        "\
plain-host ssh-ed25519 {ED25519_KEY}
10.0.4.12 ssh-ed25519 {ED25519_KEY}
2001:db8::1 ssh-ed25519 {ED25519_KEY}
[bracket-host]:2222 ssh-ed25519 {ED25519_KEY}
[2001:db8::2]:2222 ssh-ed25519 {ED25519_KEY}
alias-a,alias-b,alias-c ssh-ed25519 {ED25519_KEY}
*.wild.internal,!carved.wild.internal ssh-rsa {RSA_KEY}
multi-key-host ssh-ed25519 {ED25519_KEY}
multi-key-host ssh-rsa {RSA_KEY}
multi-key-host ecdsa-sha2-nistp256 {ECDSA_KEY}
dup-host ssh-ed25519 {ED25519_KEY}
dup-host ssh-ed25519 {ED25519_KEY}
mixed-case-host ssh-ed25519 {ED25519_KEY}
whitespace-host\tssh-ed25519\t{ED25519_KEY}
@revoked revoked-host ssh-ed25519 {ED25519_KEY}
@cert-authority *.ca.internal ssh-rsa {RSA_KEY}
# a comment line
this is not a known_hosts line at all
"
    )
}

#[test]
fn ssh_keygen_agrees_on_a_generated_matrix() {
    if !ssh_keygen_available() {
        eprintln!("skipping: ssh-keygen not on PATH");
        return;
    }

    let dir = tempfile::tempdir().expect("a scratch dir");
    let path = dir.path().join("known_hosts");
    let text = matrix_text();
    std::fs::write(&path, &text).expect("writes the fixture");

    let file = KnownHosts::parse(&text);

    let queries: &[(&str, u16)] = &[
        ("plain-host", 22),
        ("no-such-host", 22),
        ("10.0.4.12", 22),
        ("2001:db8::1", 22),
        ("bracket-host", 2222),
        ("bracket-host", 22),
        ("2001:db8::2", 2222),
        ("alias-a", 22),
        ("alias-b", 22),
        ("alias-c", 22),
        ("host.wild.internal", 22),
        ("carved.wild.internal", 22),
        ("multi-key-host", 22),
        ("dup-host", 22),
        ("mixed-case-host", 22),
        ("MIXED-CASE-HOST", 22),
        ("whitespace-host", 22),
        ("revoked-host", 22),
        ("sub.ca.internal", 22),
    ];

    for &(host, port) in queries {
        let ours = file.matching(host, port).count();
        let theirs = keygen_match_count(&path, host, port);
        assert_eq!(ours, theirs, "disagreed on {host}:{port}");
    }
}

#[test]
fn ssh_keygen_agrees_after_hashing_the_matrix() {
    if !ssh_keygen_available() {
        eprintln!("skipping: ssh-keygen not on PATH");
        return;
    }

    /* Only the lines ssh-keygen -H will actually hash: it leaves a wildcard
    or negated pattern in the clear, and refuses to touch a file that also
    holds a line it cannot parse at all (the comment and the garbage line in
    `matrix_text` are exactly that), so this is `matrix_text` without either. */
    let hashable = format!(
        "\
plain-host ssh-ed25519 {ED25519_KEY}
10.0.4.12 ssh-ed25519 {ED25519_KEY}
2001:db8::1 ssh-ed25519 {ED25519_KEY}
[bracket-host]:2222 ssh-ed25519 {ED25519_KEY}
[2001:db8::2]:2222 ssh-ed25519 {ED25519_KEY}
alias-a,alias-b,alias-c ssh-ed25519 {ED25519_KEY}
*.wild.internal,!carved.wild.internal ssh-rsa {RSA_KEY}
multi-key-host ssh-ed25519 {ED25519_KEY}
multi-key-host ssh-rsa {RSA_KEY}
dup-host ssh-ed25519 {ED25519_KEY}
dup-host ssh-ed25519 {ED25519_KEY}
mixed-case-host ssh-ed25519 {ED25519_KEY}
whitespace-host\tssh-ed25519\t{ED25519_KEY}
@revoked revoked-host ssh-ed25519 {ED25519_KEY}
@cert-authority *.ca.internal ssh-rsa {RSA_KEY}
"
    );

    let dir = tempfile::tempdir().expect("a scratch dir");
    let path = dir.path().join("known_hosts");
    std::fs::write(&path, &hashable).expect("writes the fixture");

    let hashing = Command::new("ssh-keygen")
        .arg("-H")
        .arg("-f")
        .arg(&path)
        .output()
        .expect("ssh-keygen runs");
    assert!(
        hashing.status.success(),
        "ssh-keygen -H refused the fixture: {}",
        String::from_utf8_lossy(&hashing.stderr)
    );

    let hashed_text = std::fs::read_to_string(&path).expect("reads the hashed file");
    let file = KnownHosts::parse(&hashed_text);
    assert!(
        file.entries()
            .any(runic_ssh::ssh::known_hosts::Entry::is_hashed),
        "ssh-keygen -H did not actually hash anything to check against"
    );

    /* Lowercase only: mixed-case-host's own row in known_hosts.rs pins the
    one case where hashing and case-insensitivity interact, and it is a
    confirmed, accepted disagreement rather than something this test should
    also assert. */
    let queries: &[(&str, u16)] = &[
        ("plain-host", 22),
        ("10.0.4.12", 22),
        ("2001:db8::1", 22),
        ("bracket-host", 2222),
        ("2001:db8::2", 2222),
        ("alias-a", 22),
        ("alias-b", 22),
        ("host.wild.internal", 22),
        ("carved.wild.internal", 22),
        ("multi-key-host", 22),
        ("dup-host", 22),
        ("mixed-case-host", 22),
        ("whitespace-host", 22),
        ("revoked-host", 22),
        ("sub.ca.internal", 22),
    ];

    for &(host, port) in queries {
        let ours = file.matching(host, port).count();
        let theirs = keygen_match_count(&path, host, port);
        assert_eq!(ours, theirs, "disagreed on hashed {host}:{port}");
    }
}

/// Confirms, against the real binary, the three disagreements pinned as unit
/// tests in `known_hosts.rs`. If one of these starts failing, OpenSSH changed
/// and the reasoning next to the matching unit test needs a second look.
mod ssh_keygen_disagrees {
    use super::*;

    #[test]
    fn on_a_key_type_it_does_not_recognise() {
        if !ssh_keygen_available() {
            eprintln!("skipping: ssh-keygen not on PATH");
            return;
        }

        let dir = tempfile::tempdir().expect("a scratch dir");
        let path = dir.path().join("known_hosts");
        std::fs::write(
            &path,
            format!("unknown-type-host ssh-made-up-2027 {ED25519_KEY}\n"),
        )
        .expect("writes the fixture");

        let file = KnownHosts::parse(&std::fs::read_to_string(&path).unwrap());
        assert_eq!(file.matching("unknown-type-host", 22).count(), 1);
        assert_eq!(
            keygen_match_count(&path, "unknown-type-host", 22),
            0,
            "ssh-keygen started recognising a made-up key type"
        );
    }

    #[test]
    fn on_a_key_that_will_not_decode() {
        if !ssh_keygen_available() {
            eprintln!("skipping: ssh-keygen not on PATH");
            return;
        }

        let dir = tempfile::tempdir().expect("a scratch dir");
        let path = dir.path().join("known_hosts");
        std::fs::write(&path, "broken-host ssh-ed25519 not-valid-base64!!!\n")
            .expect("writes the fixture");

        let file = KnownHosts::parse(&std::fs::read_to_string(&path).unwrap());
        assert_eq!(file.matching("broken-host", 22).count(), 0);
        assert_eq!(
            keygen_match_count(&path, "broken-host", 22),
            1,
            "ssh-keygen started validating the key field on lookup"
        );
    }

    #[test]
    fn on_the_case_of_a_hashed_query() {
        if !ssh_keygen_available() {
            eprintln!("skipping: ssh-keygen not on PATH");
            return;
        }

        let dir = tempfile::tempdir().expect("a scratch dir");
        let path = dir.path().join("known_hosts");
        std::fs::write(
            &path,
            format!("mixed-case-host ssh-ed25519 {ED25519_KEY}\n"),
        )
        .expect("writes the fixture");
        let hashing = Command::new("ssh-keygen")
            .arg("-H")
            .arg("-f")
            .arg(&path)
            .output()
            .expect("ssh-keygen runs");
        assert!(hashing.status.success());

        let file = KnownHosts::parse(&std::fs::read_to_string(&path).unwrap());
        assert_eq!(
            file.matching("MIXED-CASE-HOST", 22).count(),
            1,
            "this module should still be case-insensitive on a hashed entry"
        );
        assert_eq!(
            keygen_match_count(&path, "MIXED-CASE-HOST", 22),
            0,
            "ssh-keygen started lowercasing a hashed query"
        );
    }
}

/// One random byte string, base64-encoded, plausible-looking key length.
fn random_key(rng: &mut StdRng) -> String {
    let len = rng.random_range(16..64);
    let mut bytes = vec![0_u8; len];
    rng.fill(&mut bytes[..]);
    Base64::encode_string(&bytes)
}

fn random_host(rng: &mut StdRng) -> String {
    const CHARS: &[u8] = b"abcdefghijklmnopqrstuvwxyz0123456789-";
    let len = rng.random_range(3..12);
    (0..len)
        .map(|_| CHARS[rng.random_range(0..CHARS.len())] as char)
        .collect()
}

/// One generated line, in a form `KnownHosts::parse` should read as a single
/// entry: a plain host, a comma-separated alias list, or a wildcard with a
/// negation, each with a random key type and blob.
fn random_entry_line(rng: &mut StdRng) -> String {
    const KEY_TYPES: &[&str] = &["ssh-ed25519", "ssh-rsa", "ecdsa-sha2-nistp256"];
    let key_type = KEY_TYPES[rng.random_range(0..KEY_TYPES.len())];
    let key = random_key(rng);
    let marker = match rng.random_range(0..8) {
        0 => "@revoked ",
        1 => "@cert-authority ",
        _ => "",
    };
    let comment = if rng.random_bool(0.5) {
        format!(" a random comment {}", rng.random_range(0..1000))
    } else {
        String::new()
    };

    match rng.random_range(0..4) {
        0 => format!("{marker}{} {key_type} {key}{comment}", random_host(rng)),
        1 => {
            let hosts: Vec<String> = (0..rng.random_range(2..4))
                .map(|_| random_host(rng))
                .collect();
            format!("{marker}{} {key_type} {key}{comment}", hosts.join(","))
        }
        2 => format!(
            "{marker}*.{},!excluded.{} {key_type} {key}{comment}",
            random_host(rng),
            random_host(rng)
        ),
        _ => format!(
            "{marker}[{}]:{} {key_type} {key}{comment}",
            random_host(rng),
            rng.random_range(1024..65535)
        ),
    }
}

/// A generated file: valid entries interleaved with the shapes `known_hosts.rs`
/// must preserve rather than parse, in random order and random quantity.
fn random_file_text(rng: &mut StdRng) -> String {
    let mut lines = Vec::new();
    for _ in 0..rng.random_range(5..30) {
        match rng.random_range(0..10) {
            0 => lines.push(String::new()),
            1 => lines.push(format!("# comment {}", rng.random_range(0..1000))),
            2 => lines.push("not a known_hosts line at all".to_owned()),
            3 => lines.push(format!("web ssh-ed25519 {}!!!", random_key(rng))),
            _ => lines.push(random_entry_line(rng)),
        }
    }
    lines.join("\n")
}

#[test]
fn parsing_round_trips_on_generated_files() {
    /* `parse(render(parse(x))) == parse(x)`, the property the module's own
    `a_file_round_trips` unit test already checks for one hand-written file.
    Seeded rather than truly random, so a failure here is reproducible from
    the seed printed in the assertion rather than a report nobody can
    reconstruct; that is the only reason this is not a truly random seed. */
    let mut rng = StdRng::seed_from_u64(0x6b6e6f776e5f68);

    for iteration in 0..200 {
        let text = random_file_text(&mut rng);
        let once = KnownHosts::parse(&text);
        let rendered = once.to_file();
        let twice = KnownHosts::parse(&rendered);

        assert_eq!(
            once, twice,
            "round trip failed on iteration {iteration}, input:\n{text}"
        );

        /* Idempotent from here on: rendering what was already rendered must
        reach a fixed point in one step, not drift on every write. */
        assert_eq!(twice.to_file(), rendered, "second render was not stable");
    }
}
