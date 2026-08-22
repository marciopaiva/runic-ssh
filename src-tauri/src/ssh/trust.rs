//! Deciding whether a host key may be used.
//!
//! Rule 3 of `docs/security-model.md` is the single control standing between
//! the user and a network attacker, and the rule notes it is the one most often
//! weakened for convenience. So the outcome is a value the caller must match on
//! exhaustively, and the only way to accept a key that changed is to carry back
//! a token this module issued — which it only issues alongside the change
//! itself.
//!
//! The issue that asked for this asked for three outcomes. The file format
//! forces five: collapsing a revoked key or a certificate-authority host into
//! "unknown" would prompt the user to trust a key the file explicitly refuses,
//! which is worse than either.

use crate::ssh::known_hosts::{fingerprint, Entry, KnownHosts, Marker};

/// What `known_hosts` says about a key a server just offered.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Trust {
    /// A stored key for this host and type holds exactly these bytes.
    Matched,

    /// Nothing stored for this host and key type. Prompt with the fingerprint.
    Unknown {
        fingerprint: String,
        /// Other key types already trusted for this host, if any. A host we
        /// know offering a type we have not seen is a weaker signal than a
        /// host we have never met, and the prompt should say so.
        other_types: Vec<String>,
    },

    /// A stored key for this host and type holds *different* bytes. Block.
    Changed {
        offered: String,
        stored: Vec<String>,
        /// The only way to accept this. See [`KnownHosts::replace`].
        acknowledgement: Acknowledgement,
    },

    /// The file marks this exact key `@revoked`. Never acceptable, and not
    /// overridable — an override would defeat the only purpose of the marker.
    Revoked { fingerprint: String },

    /// A `@cert-authority` entry covers this host, so it authenticates with a
    /// certificate rather than a bare key. We do not implement certificate
    /// verification, and treating this as "unknown" would invite the user to
    /// trust a raw key where the file says one should not be offered.
    CertificateRequired { fingerprint: String },
}

/// Proof that a specific change was decided on.
///
/// Fields are private and there is no public constructor, so one cannot be
/// built for a change that was never produced by [`decide`] — which means an
/// override always refers to a change someone was actually shown.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Acknowledgement {
    host: String,
    port: u16,
    key_type: String,
    key: Vec<u8>,
}

impl Acknowledgement {
    pub fn host(&self) -> &str {
        &self.host
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn key_type(&self) -> &str {
        &self.key_type
    }

    pub fn fingerprint(&self) -> String {
        fingerprint(&self.key)
    }
}

/// Decides what may be done with an offered key.
///
/// Order matters and is not arbitrary: a revoked key is refused even if some
/// other line would have accepted it, and a certificate-authority host is
/// answered before the absence of a bare key is mistaken for a new host.
pub fn decide(known: &KnownHosts, host: &str, port: u16, key_type: &str, key: &[u8]) -> Trust {
    let relevant: Vec<&Entry> = known.matching(host, port).collect();

    if relevant
        .iter()
        .any(|entry| entry.marker == Some(Marker::Revoked) && entry.key == key)
    {
        return Trust::Revoked {
            fingerprint: fingerprint(key),
        };
    }

    if relevant
        .iter()
        .any(|entry| entry.marker == Some(Marker::CertAuthority))
    {
        return Trust::CertificateRequired {
            fingerprint: fingerprint(key),
        };
    }

    /* Only unmarked entries speak for a bare host key. A @revoked line for a
    different key says nothing about this one. */
    let usable: Vec<&&Entry> = relevant
        .iter()
        .filter(|entry| entry.marker.is_none())
        .collect();

    let same_type: Vec<&&Entry> = usable
        .iter()
        .copied()
        .filter(|entry| entry.key_type == key_type)
        .collect();

    if same_type.is_empty() {
        let other_types = usable
            .iter()
            .map(|entry| entry.key_type.clone())
            .collect::<Vec<_>>();

        return Trust::Unknown {
            fingerprint: fingerprint(key),
            other_types,
        };
    }

    if same_type.iter().any(|entry| entry.key == key) {
        return Trust::Matched;
    }

    Trust::Changed {
        offered: fingerprint(key),
        stored: same_type.iter().map(|entry| entry.fingerprint()).collect(),
        acknowledgement: Acknowledgement {
            host: host.to_owned(),
            port,
            key_type: key_type.to_owned(),
            key: key.to_vec(),
        },
    }
}

impl KnownHosts {
    /// Replaces the stored key for a host, having been shown the change.
    ///
    /// Takes an [`Acknowledgement`] rather than the host and key directly. That
    /// is the whole point: the type cannot be constructed elsewhere, so this
    /// cannot be called for a change that was never presented, and it cannot be
    /// called at all for a key that merely looked suspicious.
    pub fn replace(&mut self, acknowledgement: &Acknowledgement) {
        self.remove_matching(
            &acknowledgement.host,
            acknowledgement.port,
            &acknowledgement.key_type,
        );

        self.add(KnownHosts::entry_for(
            &acknowledgement.host,
            acknowledgement.port,
            &acknowledgement.key_type,
            acknowledgement.key.clone(),
        ));
    }
}

#[cfg(test)]
mod tests {
    use base64ct::{Base64, Encoding};

    use super::*;

    const KEY_A: &[u8] = b"the key this host used yesterday";
    const KEY_B: &[u8] = b"a different key entirely";

    fn file(lines: &str) -> KnownHosts {
        KnownHosts::parse(lines)
    }

    fn stored(host: &str, key_type: &str, key: &[u8]) -> String {
        let mut hosts = KnownHosts::default();
        hosts.add(KnownHosts::entry_for(host, 22, key_type, key.to_vec()));
        hosts.to_file()
    }

    #[test]
    fn a_key_we_stored_matches() {
        let known = file(&stored("web-01", "ssh-ed25519", KEY_A));
        assert_eq!(
            decide(&known, "web-01", 22, "ssh-ed25519", KEY_A),
            Trust::Matched
        );
    }

    #[test]
    fn a_host_we_have_never_met_is_unknown() {
        let known = file(&stored("web-01", "ssh-ed25519", KEY_A));

        match decide(&known, "web-02", 22, "ssh-ed25519", KEY_A) {
            Trust::Unknown { other_types, .. } => assert!(other_types.is_empty()),
            other => panic!("expected Unknown, got {other:?}"),
        }
    }

    #[test]
    fn a_known_host_offering_a_new_type_says_so() {
        /* Weaker signal than a stranger: the prompt should be able to tell the
        user this host is already trusted, just not with this algorithm. */
        let known = file(&stored("web-01", "ssh-rsa", KEY_A));

        match decide(&known, "web-01", 22, "ssh-ed25519", KEY_B) {
            Trust::Unknown { other_types, .. } => assert_eq!(other_types, ["ssh-rsa"]),
            other => panic!("expected Unknown, got {other:?}"),
        }
    }

    #[test]
    fn a_different_key_of_the_same_type_is_a_change() {
        let known = file(&stored("web-01", "ssh-ed25519", KEY_A));

        match decide(&known, "web-01", 22, "ssh-ed25519", KEY_B) {
            Trust::Changed {
                offered, stored, ..
            } => {
                assert_eq!(offered, fingerprint(KEY_B));
                assert_eq!(stored, [fingerprint(KEY_A)]);
            }
            other => panic!("expected Changed, got {other:?}"),
        }
    }

    #[test]
    fn a_revoked_key_is_refused_even_when_another_line_would_accept_it() {
        /* The marker exists to override acceptance. If an ordinary line could
        outvote it, it would mean nothing. */
        let mut text = stored("web-01", "ssh-ed25519", KEY_A);
        text.push_str(&format!(
            "@revoked web-01 ssh-ed25519 {}\n",
            Base64::encode_string(KEY_A)
        ));

        assert!(matches!(
            decide(&file(&text), "web-01", 22, "ssh-ed25519", KEY_A),
            Trust::Revoked { .. }
        ));
    }

    #[test]
    fn a_revoked_line_for_another_key_does_not_condemn_this_one() {
        let mut text = stored("web-01", "ssh-ed25519", KEY_A);
        text.push_str(&format!(
            "@revoked web-01 ssh-ed25519 {}\n",
            Base64::encode_string(KEY_B)
        ));

        assert_eq!(
            decide(&file(&text), "web-01", 22, "ssh-ed25519", KEY_A),
            Trust::Matched
        );
    }

    #[test]
    fn a_certificate_host_is_not_quietly_downgraded_to_unknown() {
        /* The failure ADR-0009 named: the file says this host authenticates
        with a certificate, and answering "unknown" would invite the user to
        trust a bare key instead. */
        let text = format!(
            "@cert-authority web-01 ssh-ed25519 {}\n",
            Base64::encode_string(KEY_A)
        );

        assert!(matches!(
            decide(&file(&text), "web-01", 22, "ssh-ed25519", KEY_B),
            Trust::CertificateRequired { .. }
        ));
    }

    #[test]
    fn a_change_can_only_be_resolved_with_its_own_acknowledgement() {
        let mut known = file(&stored("web-01", "ssh-ed25519", KEY_A));

        let Trust::Changed {
            acknowledgement, ..
        } = decide(&known, "web-01", 22, "ssh-ed25519", KEY_B)
        else {
            panic!("expected Changed");
        };

        assert_eq!(acknowledgement.host(), "web-01");
        assert_eq!(acknowledgement.fingerprint(), fingerprint(KEY_B));

        known.replace(&acknowledgement);

        assert_eq!(
            decide(&known, "web-01", 22, "ssh-ed25519", KEY_B),
            Trust::Matched
        );
        /* And the key it replaced is genuinely gone, not shadowed. */
        assert!(matches!(
            decide(&known, "web-01", 22, "ssh-ed25519", KEY_A),
            Trust::Changed { .. }
        ));
    }

    #[test]
    fn replacing_leaves_other_hosts_alone() {
        let mut text = stored("web-01", "ssh-ed25519", KEY_A);
        text.push_str("# a note someone wrote\n");
        text.push_str(&stored("db-01", "ssh-ed25519", KEY_A));

        let mut known = file(&text);
        let Trust::Changed {
            acknowledgement, ..
        } = decide(&known, "web-01", 22, "ssh-ed25519", KEY_B)
        else {
            panic!("expected Changed");
        };

        known.replace(&acknowledgement);

        assert_eq!(
            decide(&known, "db-01", 22, "ssh-ed25519", KEY_A),
            Trust::Matched
        );
        assert!(known.to_file().contains("# a note someone wrote"));
    }

    #[test]
    fn a_port_that_was_never_trusted_is_unknown_not_matched() {
        let known = file(&stored("web-01", "ssh-ed25519", KEY_A));

        assert!(matches!(
            decide(&known, "web-01", 2222, "ssh-ed25519", KEY_A),
            Trust::Unknown { .. }
        ));
    }
}
