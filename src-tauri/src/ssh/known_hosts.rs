//! The OpenSSH `known_hosts` file.
//!
//! This is the file rule 3 of `docs/security-model.md` rests on: a changed host
//! key is only detectable because the previous one was written down. It is also
//! a file the user may already have, written by tools that are not us, so two
//! rules shape this module.
//!
//! **A line we cannot parse is preserved, not dropped.** Refusing the file, or
//! silently rewriting it without lines we did not understand, would mean
//! forgetting a host — and forgetting a host turns a changed key into an
//! unknown one, which prompts instead of blocking.
//!
//! **A key is opaque bytes.** Trust here is not a claim about a key's internal
//! structure; it is a claim that these are the same bytes as last time. See
//! ADR-0009.

use base64ct::{Base64, Base64Unpadded, Encoding};
use hmac::{Hmac, KeyInit, Mac};
use sha1::Sha1;
use sha2::{Digest, Sha256};

/// A marker in front of the host list.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Marker {
    /// `@cert-authority`: the key signs host certificates rather than being a
    /// host key. Recognised and preserved; not yet honoured. See ADR-0009.
    CertAuthority,
    /// `@revoked`: this key must never be accepted.
    Revoked,
}

impl Marker {
    fn parse(token: &str) -> Option<Self> {
        match token {
            "@cert-authority" => Some(Self::CertAuthority),
            "@revoked" => Some(Self::Revoked),
            _ => None,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::CertAuthority => "@cert-authority",
            Self::Revoked => "@revoked",
        }
    }
}

/// How an entry names the hosts it applies to.
#[derive(Debug, Clone, PartialEq, Eq)]
enum HostSpec {
    /// A comma-separated list of patterns, possibly negated or wildcarded.
    Patterns(Vec<String>),
    /// `|1|salt|hash`, where hash is `HMAC-SHA1(key = salt, message = host)`.
    Hashed { salt: Vec<u8>, hash: Vec<u8> },
}

/// One usable line of the file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    pub marker: Option<Marker>,
    hosts: HostSpec,
    /// The raw host field, kept so a rewrite reproduces the file exactly.
    hosts_raw: String,
    pub key_type: String,
    /// The decoded key. Compared byte for byte; never interpreted.
    pub key: Vec<u8>,
    pub comment: Option<String>,
}

impl Entry {
    /// Whether this entry speaks for the given host and port.
    ///
    /// The port is part of the identity: OpenSSH writes `[host]:2222` for a
    /// non-standard port, and a key trusted on one port says nothing about
    /// another.
    pub fn matches(&self, host: &str, port: u16) -> bool {
        match &self.hosts {
            HostSpec::Hashed { salt, hash } => {
                let Ok(mut mac) = Hmac::<Sha1>::new_from_slice(salt) else {
                    return false;
                };
                mac.update(canonical_host(host, port).as_bytes());
                mac.finalize().into_bytes().as_slice() == hash.as_slice()
            }
            HostSpec::Patterns(patterns) => {
                let candidate = canonical_host(host, port);
                let mut matched = false;

                for pattern in patterns {
                    if let Some(negated) = pattern.strip_prefix('!') {
                        /* A negation wins outright: OpenSSH uses it to carve a
                        host out of a wildcard that would otherwise cover it. */
                        if glob_matches(negated, &candidate) {
                            return false;
                        }
                    } else if glob_matches(pattern, &candidate) {
                        matched = true;
                    }
                }

                matched
            }
        }
    }

    /// Whether the host field is stored hashed rather than in the clear.
    pub fn is_hashed(&self) -> bool {
        matches!(self.hosts, HostSpec::Hashed { .. })
    }

    /// The fingerprint OpenSSH shows, for a user to compare against another
    /// source: `SHA256:` followed by unpadded base64.
    pub fn fingerprint(&self) -> String {
        fingerprint(&self.key)
    }

    fn to_line(&self) -> String {
        let mut line = String::new();
        if let Some(marker) = self.marker {
            line.push_str(marker.as_str());
            line.push(' ');
        }
        line.push_str(&self.hosts_raw);
        line.push(' ');
        line.push_str(&self.key_type);
        line.push(' ');
        line.push_str(&Base64::encode_string(&self.key));
        if let Some(comment) = &self.comment {
            line.push(' ');
            line.push_str(comment);
        }
        line
    }
}

/// The fingerprint of a key blob, in the form OpenSSH prints.
pub fn fingerprint(key: &[u8]) -> String {
    let digest = Sha256::digest(key);
    format!("SHA256:{}", Base64Unpadded::encode_string(&digest))
}

/// A parsed file, in the order its lines appeared.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct KnownHosts {
    lines: Vec<Line>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Line {
    Entry(Box<Entry>),
    /// A comment, a blank line, or something we could not parse. Kept verbatim
    /// so that writing the file back does not destroy what another tool wrote.
    Verbatim(String),
}

impl KnownHosts {
    /// Reads a file. Never fails: an unreadable line becomes a preserved one.
    pub fn parse(text: &str) -> Self {
        let lines = text
            .lines()
            .map(|line| match parse_entry(line) {
                Some(entry) => Line::Entry(Box::new(entry)),
                None => Line::Verbatim(line.to_owned()),
            })
            .collect();

        Self { lines }
    }

    pub fn entries(&self) -> impl Iterator<Item = &Entry> {
        self.lines.iter().filter_map(|line| match line {
            Line::Entry(entry) => Some(entry.as_ref()),
            Line::Verbatim(_) => None,
        })
    }

    /// Every entry that speaks for this host and port, in file order.
    pub fn matching<'a>(&'a self, host: &str, port: u16) -> impl Iterator<Item = &'a Entry> + 'a {
        /* Owned so the iterator does not borrow the caller's string: matching
        is lazy, and the caller should not have to keep the host alive. */
        let host = host.to_owned();
        self.entries()
            .filter(move |entry| entry.matches(&host, port))
    }

    /// Appends an entry. Existing lines, parsed or not, are left alone.
    pub fn add(&mut self, entry: Entry) {
        self.lines.push(Line::Entry(Box::new(entry)));
    }

    /// Drops every unmarked entry for this host, port and key type.
    ///
    /// Marked lines are left alone: a `@revoked` entry is a statement about a
    /// key that must outlive any replacement, and removing it while replacing
    /// a host key would quietly un-revoke it.
    pub fn remove_matching(&mut self, host: &str, port: u16, key_type: &str) {
        self.lines.retain(|line| match line {
            Line::Verbatim(_) => true,
            Line::Entry(entry) => {
                entry.marker.is_some() || entry.key_type != key_type || !entry.matches(host, port)
            }
        });
    }

    /// Builds an entry for a host, written in the clear.
    pub fn entry_for(host: &str, port: u16, key_type: &str, key: Vec<u8>) -> Entry {
        let hosts_raw = canonical_host(host, port);
        Entry {
            marker: None,
            hosts: HostSpec::Patterns(vec![hosts_raw.clone()]),
            hosts_raw,
            key_type: key_type.to_owned(),
            key,
            comment: None,
        }
    }

    /// Renders the file. Round-trips: parsing this yields the same value.
    pub fn to_file(&self) -> String {
        let mut out = String::new();
        for line in &self.lines {
            match line {
                Line::Entry(entry) => out.push_str(&entry.to_line()),
                Line::Verbatim(text) => out.push_str(text),
            }
            out.push('\n');
        }
        out
    }
}

/// How a host is written in the file: bare on port 22, bracketed otherwise.
fn canonical_host(host: &str, port: u16) -> String {
    let host = host.to_ascii_lowercase();
    if port == 22 {
        host
    } else {
        format!("[{host}]:{port}")
    }
}

/// OpenSSH's `*` and `?` wildcards. Case-insensitive, like host names.
fn glob_matches(pattern: &str, candidate: &str) -> bool {
    let pattern: Vec<char> = pattern.to_ascii_lowercase().chars().collect();
    let candidate: Vec<char> = candidate.to_ascii_lowercase().chars().collect();

    /* Iterative backtracking rather than recursion: a pattern comes from a
    file we did not write, and recursion on it is a stack to exhaust. */
    let (mut p, mut c) = (0_usize, 0_usize);
    let (mut star, mut resume) = (None, 0_usize);

    while c < candidate.len() {
        match pattern.get(p) {
            Some('*') => {
                star = Some(p);
                resume = c;
                p += 1;
            }
            Some('?') => {
                p += 1;
                c += 1;
            }
            Some(ch) if *ch == candidate[c] => {
                p += 1;
                c += 1;
            }
            _ => match star {
                Some(s) => {
                    p = s + 1;
                    resume += 1;
                    c = resume;
                }
                None => return false,
            },
        }
    }

    while pattern.get(p) == Some(&'*') {
        p += 1;
    }
    p == pattern.len()
}

fn parse_entry(line: &str) -> Option<Entry> {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.starts_with('#') {
        return None;
    }

    let mut fields = trimmed.split_whitespace();
    let mut first = fields.next()?;

    let marker = Marker::parse(first);
    if marker.is_some() {
        first = fields.next()?;
    }

    let hosts_raw = first.to_owned();
    let hosts = parse_hosts(&hosts_raw)?;
    let key_type = fields.next()?.to_owned();
    let key = Base64::decode_vec(fields.next()?).ok()?;

    /* A key type that is not a key type, or an empty blob, is a malformed line
    rather than a host we know nothing about. */
    if key.is_empty() || !key_type.contains('-') {
        return None;
    }

    let rest: Vec<&str> = fields.collect();
    let comment = if rest.is_empty() {
        None
    } else {
        Some(rest.join(" "))
    };

    Some(Entry {
        marker,
        hosts,
        hosts_raw,
        key_type,
        key,
        comment,
    })
}

fn parse_hosts(field: &str) -> Option<HostSpec> {
    if let Some(rest) = field.strip_prefix("|1|") {
        let (salt, hash) = rest.split_once('|')?;
        return Some(HostSpec::Hashed {
            salt: Base64::decode_vec(salt).ok()?,
            hash: Base64::decode_vec(hash).ok()?,
        });
    }

    /* Any other `|` prefix is a hash revision we do not implement. Treating it
    as a pattern would silently fail to match a host we do know. */
    if field.starts_with('|') {
        return None;
    }

    let patterns: Vec<String> = field
        .split(',')
        .filter(|p| !p.is_empty())
        .map(str::to_owned)
        .collect();

    if patterns.is_empty() {
        None
    } else {
        Some(HostSpec::Patterns(patterns))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A real ed25519 host key line, as `ssh-keyscan` writes it.
    const ED25519: &str =
        "web-01 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIB1Nq2r0kZ8vJk3mQ9Xw7Yc2Lp5Tf8Rd6Ge4Hs1Uv0Aa";
    const RSA_KEY: &str = "AAAAB3NzaC1yc2EAAAADAQABAAABgQC7vbqajDhA9K5tGm2xUcQ9Tf1RwNq4Yz8Lm3Kp";

    fn hosts(text: &str) -> KnownHosts {
        KnownHosts::parse(text)
    }

    #[test]
    fn reads_a_plain_entry() {
        let file = hosts(ED25519);
        let entry = file.entries().next().expect("one entry");

        assert_eq!(entry.key_type, "ssh-ed25519");
        assert!(entry.matches("web-01", 22));
        assert!(!entry.matches("web-02", 22));
    }

    #[test]
    fn a_host_name_matches_whatever_its_case() {
        let file = hosts(ED25519);
        assert!(file.matching("WEB-01", 22).next().is_some());
    }

    #[test]
    fn a_port_is_part_of_the_identity() {
        /* A key trusted on 22 says nothing about 2222, and OpenSSH writes the
        bracketed form for exactly that reason. */
        let file = hosts(&format!("[web-01]:2222 ssh-ed25519 {RSA_KEY}"));

        assert!(file.matching("web-01", 2222).next().is_some());
        assert!(file.matching("web-01", 22).next().is_none());
    }

    #[test]
    fn reads_a_comma_separated_host_list() {
        let file = hosts(&format!(
            "web-01,10.0.4.12,web-01.internal ssh-ed25519 {RSA_KEY}"
        ));

        for host in ["web-01", "10.0.4.12", "web-01.internal"] {
            assert!(
                file.matching(host, 22).next().is_some(),
                "{host} should match"
            );
        }
        assert!(file.matching("web-02", 22).next().is_none());
    }

    #[test]
    fn honours_wildcards_and_negations() {
        let file = hosts(&format!(
            "*.internal,!secret.internal ssh-ed25519 {RSA_KEY}"
        ));

        assert!(file.matching("web-01.internal", 22).next().is_some());
        /* The negation has to win, or a host deliberately carved out of a
        wildcard would be trusted by it. */
        assert!(file.matching("secret.internal", 22).next().is_none());
    }

    #[test]
    fn matches_a_hashed_host() {
        /* Hashed entries are the default in many distributions, so a client
        that cannot read them cannot detect a changed key on most machines
        it meets. Salt and hash below are computed by the same HMAC the
        format specifies. */
        let salt = b"0123456789abcdefghij";
        let mut mac = Hmac::<Sha1>::new_from_slice(salt).expect("a valid key");
        mac.update(b"web-01");
        let digest = mac.finalize().into_bytes();

        let line = format!(
            "|1|{}|{} ssh-ed25519 {RSA_KEY}",
            Base64::encode_string(salt),
            Base64::encode_string(&digest),
        );

        let file = hosts(&line);
        let entry = file.entries().next().expect("one entry");

        assert!(entry.is_hashed());
        assert!(entry.matches("web-01", 22));
        assert!(!entry.matches("web-02", 22));
    }

    #[test]
    fn reads_several_key_types_for_one_host() {
        let file = hosts(&format!(
            "web-01 ssh-ed25519 {RSA_KEY}\nweb-01 ssh-rsa {RSA_KEY}\nweb-01 ecdsa-sha2-nistp256 {RSA_KEY}"
        ));

        let types: Vec<&str> = file
            .matching("web-01", 22)
            .map(|entry| entry.key_type.as_str())
            .collect();

        assert_eq!(types, ["ssh-ed25519", "ssh-rsa", "ecdsa-sha2-nistp256"]);
    }

    #[test]
    fn keeps_markers() {
        let file = hosts(&format!(
            "@revoked web-01 ssh-ed25519 {RSA_KEY}\n@cert-authority *.internal ssh-rsa {RSA_KEY}"
        ));

        let markers: Vec<Option<Marker>> = file.entries().map(|entry| entry.marker).collect();
        assert_eq!(
            markers,
            [Some(Marker::Revoked), Some(Marker::CertAuthority)]
        );
    }

    #[test]
    fn ignores_comments_and_blank_lines() {
        let file = hosts(&format!(
            "# written by hand\n\n{ED25519}\n\n# trailing note"
        ));
        assert_eq!(file.entries().count(), 1);
    }

    #[test]
    fn a_malformed_line_does_not_lose_the_rest_of_the_file() {
        /* This is the property that matters most. Refusing the file, or
        dropping what we did not understand, would forget a host — and a
        forgotten host turns a changed key into an unknown one, which
        prompts instead of blocking. */
        let file = hosts(&format!(
            "this is not a known_hosts line\n{ED25519}\nweb-02 ssh-ed25519 !!!not-base64!!!"
        ));

        assert_eq!(file.entries().count(), 1);
        assert!(file.matching("web-01", 22).next().is_some());
    }

    #[test]
    fn an_unknown_hash_revision_is_not_treated_as_a_pattern() {
        /* `|2|` would be a hashing scheme we do not implement. Reading it as a
        literal host name would silently fail to match a host we do know. */
        let file = hosts(&format!("|2|abc|def ssh-ed25519 {RSA_KEY}"));
        assert_eq!(file.entries().count(), 0);
    }

    #[test]
    fn writing_preserves_everything_it_did_not_understand() {
        let original =
            format!("# a comment someone wrote\n{ED25519} deploy@laptop\nnot a valid line\n");

        let written = hosts(&original).to_file();

        assert!(written.contains("# a comment someone wrote"));
        assert!(written.contains("not a valid line"));
        assert!(written.contains("deploy@laptop"));
    }

    #[test]
    fn a_file_round_trips() {
        let original = format!("# note\n{ED25519} deploy@laptop\n\nweb-02 ssh-rsa {RSA_KEY}\n");
        let once = hosts(&original).to_file();

        assert_eq!(
            hosts(&once).to_file(),
            once,
            "parsing what we wrote must be stable"
        );
    }

    #[test]
    fn appending_leaves_existing_lines_alone() {
        let mut file = hosts(&format!("# keep me\n{ED25519}"));
        file.add(KnownHosts::entry_for(
            "db-01",
            2222,
            "ssh-ed25519",
            vec![1, 2, 3, 4],
        ));

        let written = file.to_file();
        assert!(written.contains("# keep me"));
        assert!(written.contains("[db-01]:2222 ssh-ed25519"));
        assert_eq!(hosts(&written).matching("db-01", 2222).count(), 1);
    }

    #[test]
    fn fingerprints_match_what_openssh_prints() {
        /* SHA256 of the empty input, base64 without padding — the form
        `ssh-keygen -l` shows, and the string a user compares by eye. */
        assert_eq!(
            fingerprint(b""),
            "SHA256:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU"
        );
    }

    #[test]
    fn the_key_is_compared_as_bytes_not_interpreted() {
        let file = hosts(&format!("web-01 ssh-ed25519 {RSA_KEY}"));
        let entry = file.entries().next().expect("one entry");

        assert_eq!(entry.key, Base64::decode_vec(RSA_KEY).expect("decodes"));
    }

    /* The three tests below pin known, confirmed disagreements with
    `ssh-keygen -F` (#129, `tests/known_hosts_against_openssh.rs`). None of
    them is a security regression on its own terms; each is written down so a
    future change to this parser has to decide about it on purpose rather than
    drift into agreement or further disagreement by accident. */

    #[test]
    fn a_key_type_ssh_keygen_would_not_recognise_still_parses() {
        /* `ssh-keygen -F` only matches a line whose key type is one it
        recognises as a real algorithm; a line with `ssh-made-up-2027` is
        invisible to it, confirmed against the real binary. This module
        treats `key_type` as an opaque label compared against whatever the
        real server negotiates (see the module doc and
        `the_key_is_compared_as_bytes_not_interpreted` above), and no real
        server can ever negotiate a name nobody defined, so accepting the
        line here cannot make a live connection trust a key it should not.
        Rejecting it would need a hard-coded list of algorithm names to keep
        in step with `russh`'s own, which is a cost for a case that cannot
        be reached. */
        let file = hosts(&format!("web-01 ssh-made-up-2027 {RSA_KEY}"));
        assert!(file.matching("web-01", 22).next().is_some());
    }

    #[test]
    fn a_line_whose_key_will_not_decode_is_never_matched() {
        /* The opposite direction: `ssh-keygen -F` still reports a line as
        found even when its key field is not valid base64, since a lookup
        does not need to decode the key. This module cannot compare a key it
        could not decode against a real one, so it drops the line from
        matching rather than claim a host is known when nothing here could
        ever confirm which key it actually has. The line survives a rewrite
        regardless: see `a_malformed_line_does_not_lose_the_rest_of_the_file`.
        This is the direction that trades a possible "unknown host" prompt for
        never claiming a false "known" one, which is the safer of the two
        ways to disagree with the reference tool. */
        let file = hosts("web-01 ssh-ed25519 not-valid-base64!!!");
        assert_eq!(file.entries().count(), 0);
        assert!(file.matching("web-01", 22).next().is_none());
    }

    #[test]
    fn a_hashed_entry_matches_regardless_of_the_querys_case() {
        /* `ssh-keygen -H` lowercases a hostname before hashing it, but
        `ssh-keygen -F` hashes a query exactly as given, so querying a hashed
        entry with anything but the original lowercase form finds nothing
        under the reference tool, confirmed against the real binary. This
        module lowercases both sides through `canonical_host` before hashing
        either one, so it is case-insensitive here the same way plain-pattern
        matching already is elsewhere in this file. That can only make this
        module recognise a host `ssh-keygen -F` would call unknown; it cannot
        make it accept a key that does not match, so the disagreement is
        strictly more forgiving, never less. */
        let salt = b"0123456789abcdefghij";
        let mut mac = Hmac::<Sha1>::new_from_slice(salt).expect("a valid key");
        mac.update(b"web-01");
        let digest = mac.finalize().into_bytes();

        let line = format!(
            "|1|{}|{} ssh-ed25519 {RSA_KEY}",
            Base64::encode_string(salt),
            Base64::encode_string(&digest),
        );

        let file = hosts(&line);
        assert!(file.matching("WEB-01", 22).next().is_some());
    }
}
