//! A host's own listening sockets, read over the connection already open.
//!
//! Read-only: this only lists what is bound and listening. Nothing here
//! opens, closes or otherwise touches a socket.
//!
//! `ss -p` needs privilege to resolve which process owns a socket that
//! belongs to another user, the same reason `ps` only shows every user's
//! own processes without it. A session connected as a non-root user still
//! gets every listening address and port, just with an empty `process` for
//! whichever sockets belong to someone else.

/// The command sent over [`Connection::run_command`](crate::ssh::connection::Connection::run_command).
///
/// `-t`/`-u` restrict the list to TCP and UDP, the two a person means by
/// "open ports"; `-l` to listening sockets rather than every open
/// connection; `-n` skips a DNS/service-name lookup for each port; `-p` asks
/// for the owning process; `-H` drops the header row, since `ss` has no flag
/// to number a column instead. `2>/dev/null` keeps a permission error off
/// the stdout this parses, the same reasoning `ssh::monitor::command`'s own
/// `df` call already uses.
pub fn command() -> &'static str {
    "ss -tulnpH 2>/dev/null"
}

/// One listening socket, named the way `ss` names its own columns.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListeningSocket {
    pub protocol: String,
    pub state: String,
    pub address: String,
    pub port: u16,
    /// `ss`'s own raw trailing text for the owning process, not further
    /// parsed: see the module doc comment for why it can be empty.
    pub process: String,
}

/// Parses [`command`]'s own output. Never fails: a line this does not
/// recognize is skipped rather than turned into a placeholder row, and a
/// host with nothing to report (no `ss`, or genuinely nothing listening)
/// yields an empty list.
#[must_use]
pub fn parse(stdout: &[u8]) -> Vec<ListeningSocket> {
    String::from_utf8_lossy(stdout)
        .lines()
        .filter_map(parse_line)
        .collect()
}

fn parse_line(line: &str) -> Option<ListeningSocket> {
    let mut fields = line.split_whitespace();
    let protocol = fields.next()?.to_owned();
    let state = fields.next()?.to_owned();
    let _recv_q = fields.next()?;
    let _send_q = fields.next()?;
    let local = fields.next()?;
    let _peer = fields.next()?;
    /* Whatever is left, rejoined with single spaces: present when the
    session can see who owns the socket, empty otherwise, the same
    "whatever is left" parsing `ssh::processes::parse_line` already uses
    for a command line. */
    let process = fields.collect::<Vec<_>>().join(" ");

    /* The address itself can contain colons (`[::]` for IPv6), so the port
    is whatever follows the *last* one rather than the first. */
    let (address, port) = local.rsplit_once(':')?;
    let port = port.parse().ok()?;

    Some(ListeningSocket {
        protocol,
        state,
        address: address.to_owned(),
        port,
        process,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_line_with_a_visible_owner_parses() {
        let stdout = b"tcp   LISTEN 0      128          0.0.0.0:22        0.0.0.0:*    users:((\"sshd\",pid=837,fd=6))\n";

        assert_eq!(
            parse(stdout),
            vec![ListeningSocket {
                protocol: "tcp".to_owned(),
                state: "LISTEN".to_owned(),
                address: "0.0.0.0".to_owned(),
                port: 22,
                process: "users:((\"sshd\",pid=837,fd=6))".to_owned(),
            }]
        );
    }

    #[test]
    fn an_ipv6_address_splits_on_its_last_colon_not_its_first() {
        let stdout = b"tcp   LISTEN 0      128             [::]:22           [::]:*    users:((\"sshd\",pid=837,fd=7))\n";

        let sockets = parse(stdout);
        assert_eq!(sockets.len(), 1);
        assert_eq!(sockets[0].address, "[::]");
        assert_eq!(sockets[0].port, 22);
    }

    #[test]
    fn a_socket_owned_by_someone_else_parses_with_no_process() {
        /* No privilege to see it, the same shape ps degrades to for a
        process owned by another user without sudo. */
        let stdout = b"tcp   LISTEN 0      128          0.0.0.0:22        0.0.0.0:*          \n";

        assert_eq!(
            parse(stdout),
            vec![ListeningSocket {
                protocol: "tcp".to_owned(),
                state: "LISTEN".to_owned(),
                address: "0.0.0.0".to_owned(),
                port: 22,
                process: String::new(),
            }]
        );
    }

    #[test]
    fn a_line_missing_a_port_is_skipped() {
        assert_eq!(parse(b"tcp LISTEN 0 128 0.0.0.0 0.0.0.0:*\n"), Vec::new());
    }

    #[test]
    fn an_unsupported_ss_that_prints_nothing_to_stdout_yields_an_empty_list() {
        assert_eq!(parse(b""), Vec::new());
    }
}
