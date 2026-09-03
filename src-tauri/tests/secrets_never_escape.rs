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

use runic_ssh::error::IpcError;
use runic_ssh::ssh::connection::{connect, ConnectionError, Credential, Endpoint};
use runic_ssh::ssh::known_hosts::KnownHosts;
use runic_ssh::ssh::trust::{decide, Trust};
use runic_ssh::vault::Secret;

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
        /* Carries only a port, never a secret, so no canary belongs on this
        one; it is here for the same reason every other variant is: the
        exhaustive match below must account for it. */
        ConnectionError::RemoteForwardRefused { port: 8080 },
    ];

    for error in &all {
        match error {
            ConnectionError::Unreachable
            | ConnectionError::TimedOut
            | ConnectionError::KeyUnreadable
            | ConnectionError::RsaKeyRefused
            | ConnectionError::AuthenticationFailed
            | ConnectionError::Transport
            | ConnectionError::RemoteForwardRefused { .. }
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
        Credential::Password(Secret::new(PASSWORD.to_owned())),
        Credential::PrivateKey {
            pem: Secret::new(format!("-----{PEM_MARKER}-----")),
            passphrase: Some(Secret::new(PASSPHRASE.to_owned())),
        },
        Credential::PrivateKey {
            pem: Secret::new(format!("-----{PEM_MARKER}-----")),
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
            Credential::Password(Secret::new(PASSWORD.to_owned())),
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
                pem: Secret::new(String::from_utf8(pem).unwrap()),
                passphrase: Some(Secret::new(PASSPHRASE.to_owned())),
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

/* ------------------------------------------------------------------------ *
 * What is kept, rather than what is used. #131, ADR-0025.
 * ------------------------------------------------------------------------ */

#[test]
fn what_the_keychain_holds_never_renders_itself() {
    /* This file tested the credential the transport uses and never the shape
    the store holds, and that shape derived `Debug` over a bare `String`.
    It rendered `Password { secret: "hunter2" }`, in main, until this week.
    One `dbg!` was the whole distance between rule 2 and a password in a
    terminal. */
    let password = runic_ssh::vault::StoredCredential::Password {
        secret: Secret::new("hunter2"),
    };
    assert_clean("a stored password", &format!("{password:?}"));

    let key = runic_ssh::vault::StoredCredential::PrivateKey {
        pem: Secret::new("-----BEGIN OPENSSH PRIVATE KEY-----hunter2"),
        passphrase: Some(Secret::new("correct horse battery staple")),
    };
    assert_clean("a stored key", &format!("{key:?}"));

    /* And it still says the one thing that is not a secret, or the redaction
    would have taken the information with it. Since ADR-0026 the wording comes
    from a derive rather than from a sentence somebody wrote, so this asserts
    the fact rather than the phrasing: encrypted reads `Some`, unencrypted
    reads `None`. */
    assert!(format!("{key:?}").contains("passphrase: Some"));
    assert!(format!(
        "{:?}",
        runic_ssh::vault::StoredCredential::PrivateKey {
            pem: Secret::new("-----BEGIN OPENSSH PRIVATE KEY-----"),
            passphrase: None,
        }
    )
    .contains("passphrase: None"));
}

#[test]
fn a_secret_kept_for_this_run_never_renders_itself() {
    /* ADR-0025 added a second place a credential can be. A store that can
    print itself is one `dbg!` away from every password in it. */
    let secrets = runic_ssh::vault::SessionSecrets::new();
    let id = runic_ssh::vault::CredentialId::for_session("web-01");
    secrets.keep(&id, &Secret::new("hunter2"));

    /* It does not implement `Debug` at all, which is the point: this asserts
    what can be reached rather than how it prints, because there is no way
    to print it. */
    assert_eq!(secrets.count(), 1);
    assert!(secrets.resolve(&id).is_some());

    secrets.forget(&id);
    assert_eq!(secrets.count(), 0);
    assert!(secrets.resolve(&id).is_none());
}

/* ------------------------------------------------------------------------ *
 * What cannot be written at all. #131, ADR-0026.
 *
 * The tests above assert that the types we thought of render safely. They pass
 * unchanged when somebody adds a type nobody thought of, which is the failure
 * that already happened once in this repository. These assert the shape of the
 * types themselves, so the answer does not depend on the list being complete.
 * ------------------------------------------------------------------------ */

/// Asks, at compile time, whether a type implements a trait.
///
/// The mechanism is inherent method resolution. Rust tries an inherent method
/// before a trait method, and skips the inherent one when its bound does not
/// hold, so `Is<T>` answers `true` from the inherent impl when `T` satisfies
/// the bound and falls through to the trait's default of `false` when it does
/// not. It is the one way to ask this question on stable without a compile-fail
/// harness, which would be a new dev dependency.
///
/// The controls in the tests below are not decoration. A probe that answered
/// `false` for everything, by a typo or a change in resolution, would pass
/// every assertion here and prove nothing, so each test asserts a type that
/// *does* implement the trait first.
mod is {
    use std::marker::PhantomData;

    pub struct Is<T>(pub PhantomData<T>);

    pub trait NotSerialize {
        fn serializes(&self) -> bool {
            false
        }
    }
    impl<T> NotSerialize for Is<T> {}
    impl<T: serde::Serialize> Is<T> {
        pub fn serializes(&self) -> bool {
            true
        }
    }

    pub trait NotDisplay {
        fn displays(&self) -> bool {
            false
        }
    }
    impl<T> NotDisplay for Is<T> {}
    impl<T: std::fmt::Display> Is<T> {
        pub fn displays(&self) -> bool {
            true
        }
    }
}

macro_rules! serializes {
    ($t:ty) => {{
        #[allow(unused_imports)]
        use crate::is::NotSerialize as _;
        is::Is::<$t>(std::marker::PhantomData).serializes()
    }};
}

macro_rules! displays {
    ($t:ty) => {{
        #[allow(unused_imports)]
        use crate::is::NotDisplay as _;
        is::Is::<$t>(std::marker::PhantomData).displays()
    }};
}

#[test]
fn no_type_holding_a_secret_can_be_serialized() {
    /* Rule 1 and rule 2 together: a secret must not cross toward the frontend,
    and the way it would is by being a field of something a command returns.
    Refusing `Serialize` on the types themselves means that does not compile,
    rather than being caught by whoever reviews the new field. */
    assert!(
        serializes!(String),
        "the probe answers true for a type that does"
    );
    assert!(serializes!(runic_ssh::error::IpcError));

    assert!(!serializes!(runic_ssh::vault::Secret));
    assert!(!serializes!(runic_ssh::vault::StoredCredential));
    assert!(!serializes!(runic_ssh::vault::SessionSecrets));
    assert!(!serializes!(Credential));
    assert!(!serializes!(runic_ssh::ssh::credentials::Answer));
}

#[test]
fn no_type_holding_a_secret_can_be_displayed() {
    /* `Debug` is redacted, and `Display` is the hole a redacted `Debug` leaves
    open: `format!("{secret}")` reads as harmless and prints the material. The
    answer is not a second redaction to maintain but no implementation at all,
    so the format string does not compile. */
    assert!(
        displays!(String),
        "the probe answers true for a type that does"
    );
    assert!(displays!(ConnectionError));

    assert!(!displays!(runic_ssh::vault::Secret));
    assert!(!displays!(runic_ssh::vault::StoredCredential));
    assert!(!displays!(Credential));
}

#[test]
fn a_panic_while_holding_a_secret_carries_nothing_of_it() {
    /* Rule 2 names the panic message specifically. A panic payload is not a
    log, but it is printed to stderr by the default hook and captured by
    anything watching the process, which is the same thing in every way that
    matters. */
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(|_| {}));

    let payload = std::panic::catch_unwind(|| {
        let secret = Secret::new(PASSWORD);
        let credential = Credential::Password(Secret::new(PASSWORD));

        /* Written the way it would actually be written: somebody formatting
        what they are holding into the message, because they want to know
        which credential failed. */
        panic!("authentication gave up on {secret:?} / {credential:?}");
    })
    .expect_err("the closure panics");

    std::panic::set_hook(previous);

    let rendered = payload
        .downcast_ref::<String>()
        .expect("a formatted panic payload");
    assert_clean("a panic payload", rendered);
}

#[test]
fn a_secret_says_nothing_about_its_length() {
    /* Not even how long it is. A four character password and a 3000 character
    private key are different facts about somebody's security, and a rendering
    that distinguishes them has narrowed the search for whoever reads it. */
    let short = format!("{:?}", Secret::new("a"));
    let long = format!("{:?}", Secret::new("-".repeat(3000)));

    assert_eq!(short, long);
}

#[test]
fn no_field_named_like_a_secret_escapes_the_secret_type() {
    /* The tests in `mod is`, above, catch a type nobody wrapped, once
    somebody lists it in `serializes!` or `displays!`. This catches the type
    nobody listed: a field whose name reads as secret material but whose
    declared type does not mention `Secret` at all. It is a lint over the
    source, in the same spirit as `the_ssh_layer_never_reaches_for_the_filesystem`
    above, and it shares that test's honesty about what it cannot see: a type
    built up across two lines, or a type alias hiding `String` behind another
    name, gets past it. What it does catch is #177's ordinary case, a field
    written as `token: String`.

    Scoped to `src/`, not `tests/`: `tests/ssh_connection.rs` has fixture
    structs with fields like `password: &'static str`, which are literal test
    credentials rather than anything the application itself renders. */
    let src = std::path::PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/src"));
    let markers = ["password", "secret", "passphrase", "pem", "token"];

    /* `vault::mod::Wire` is the one deliberate exception: ADR-0026 names it
    "the one place in the tree secret material is named to serde". Its
    fields borrow through `Secret::expose` into a bare `&str` rather than
    holding one, which is why they read as a violation here and are exempted
    by name instead of by the pattern happening to miss them. */
    let exempt = |enclosing: &str| enclosing == "Wire";

    let mut violations = Vec::new();
    for path in rust_files(&src) {
        let source = std::fs::read_to_string(&path).expect("readable source");
        let mut enclosing = String::new();

        for line in source.lines() {
            let trimmed = line.trim_start();
            let after_vis = trimmed
                .strip_prefix("pub(crate) ")
                .or_else(|| trimmed.strip_prefix("pub "))
                .unwrap_or(trimmed);

            if let Some(name) = after_vis
                .strip_prefix("struct ")
                .or_else(|| after_vis.strip_prefix("enum "))
            {
                enclosing = name
                    .split(|c: char| !c.is_alphanumeric() && c != '_')
                    .find(|part| !part.is_empty())
                    .unwrap_or("")
                    .to_owned();
                continue;
            }

            let Some(colon) = after_vis.find(':') else {
                continue;
            };
            let field = after_vis[..colon].trim();
            let is_field = !field.is_empty()
                && field
                    .chars()
                    .next()
                    .is_some_and(|c| c == '_' || c.is_ascii_lowercase())
                && field.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
            if !is_field || !markers.iter().any(|marker| field.contains(marker)) {
                continue;
            }

            let ty = after_vis[colon + 1..].trim().trim_end_matches(',');
            if !looks_like_a_type(ty) || ty.contains("Secret") || exempt(&enclosing) {
                continue;
            }
            violations.push(format!("{}: `{field}: {ty}`", path.display()));
        }
    }

    assert!(
        violations.is_empty(),
        "a field named like a secret is not typed as one; wrap it in `Secret`:\n{}",
        violations.join("\n")
    );
}

/// Tells a type from a value with the same `name: X` shape.
///
/// A struct literal (`Wire::Password { secret: secret.expose() }`) and a
/// `match` pattern (`Credential::PrivateKey { passphrase: Some(_), .. }`) read
/// exactly like a field declaration to a scanner that only looks at one line.
/// What tells them apart is what `X` looks like: a type starts with an
/// uppercase identifier or a primitive keyword, optionally behind a reference
/// and a lifetime; `Some(..)`, `None`, `Ok(..)`, `Err(..)` and a bare
/// lowercase identifier are a pattern or a value instead.
fn looks_like_a_type(ty: &str) -> bool {
    if ty.starts_with("Some(") || ty == "None" || ty.starts_with("Ok(") || ty.starts_with("Err(") {
        return false;
    }

    let mut rest = ty.strip_prefix('&').unwrap_or(ty);
    if rest.starts_with('\'') {
        rest = rest.split_whitespace().nth(1).unwrap_or("");
    }
    let ident: String = rest
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric() || *c == '_')
        .collect();

    match ident.chars().next() {
        Some(c) if c.is_ascii_uppercase() => true,
        Some(_) => {
            const PRIMITIVES: [&str; 17] = [
                "str", "bool", "char", "u8", "u16", "u32", "u64", "u128", "usize", "i8", "i16",
                "i32", "i64", "i128", "isize", "f32", "f64",
            ];
            PRIMITIVES.contains(&ident.as_str())
        }
        None => false,
    }
}

/// Every `.rs` file under `dir`, recursively.
fn rust_files(dir: &std::path::Path) -> Vec<std::path::PathBuf> {
    let mut out = Vec::new();
    for entry in std::fs::read_dir(dir).expect("a readable directory") {
        let path = entry.expect("a directory entry").path();
        if path.is_dir() {
            out.extend(rust_files(&path));
        } else if path.extension().and_then(|e| e.to_str()) == Some("rs") {
            out.push(path);
        }
    }
    out
}
