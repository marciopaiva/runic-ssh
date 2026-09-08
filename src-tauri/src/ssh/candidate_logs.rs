//! Real files under `/var/log`, read over the connection already open, as
//! suggestions for the Logs tab's own path field.
//!
//! Deliberately not a "which service logs where" table. That table would
//! need one entry per service per distribution, tested only against
//! whichever the project's own fixtures happen to run, and a service's own
//! log path is frequently reconfigured anyway (nginx's `access_log`
//! directive can point anywhere). `/var/log` itself is the one thing that
//! stays constant across distributions, so this reports what actually
//! exists there instead of guessing what should.

/// How many candidates the command asks for at most. Cut on the host with
/// `head`, not after the fact here: a pathological `/var/log` should not
/// cost a larger transfer only to be truncated on this side.
const MAX_CANDIDATES: u32 = 200;

/// The command sent over [`Connection::run_command`](crate::ssh::connection::Connection::run_command).
///
/// `-maxdepth 3` keeps a deeply nested bind-mount from being walked in
/// full. Everything past `find` is a `grep -vE` exclusion rather than
/// `find`'s own exclusion flags: `grep` behaves the same everywhere a
/// shell exists, which is not equally true of every `find`'s own dialect,
/// including the BusyBox one this project's own lightest fixture ships.
/// Four things are excluded, none of them a guess about a particular
/// service:
///
/// * a rotated log's own suffix (a compression extension, or a numbered
///   `access.log.1`), since a compressed or already-rotated file is not
///   what "tail this" means;
/// * everything under `/var/log/journal/`, systemd's own binary storage,
///   already reachable through the Systemd tab's own journal pane and not
///   text `tail` can show meaningfully as one;
/// * `btmp`, `wtmp`, `lastlog` and `faillog`, the standard Linux accounting
///   files, binary on every distribution that has them, not a
///   distribution-specific choice the way a service's own log path is.
///
/// `2>/dev/null` keeps a permission error off the stdout this parses, the
/// same reasoning `ssh::monitor::command`'s own `df` call already uses.
#[must_use]
pub fn command() -> String {
    format!(
        "find /var/log -maxdepth 3 -type f 2>/dev/null | \
         grep -vE '\\.(gz|xz|bz2|zst)$|\\.[0-9]+$|^/var/log/journal/|/(btmp|wtmp|lastlog|faillog)$' | \
         sort | head -n {MAX_CANDIDATES}"
    )
}

/// Parses [`command`]'s own output: every path it printed, one per line.
/// Never fails; a host with nothing under `/var/log`, or no `find` at all,
/// yields an empty list, the same as an unreadable directory would.
#[must_use]
pub fn parse(stdout: &[u8]) -> Vec<String> {
    super::text::non_empty_lines(stdout)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_command_scopes_to_var_log_and_bounds_both_depth_and_count() {
        let command = command();
        assert!(command.starts_with("find /var/log -maxdepth 3 -type f"));
        assert!(command.contains("head -n 200"));
    }

    #[test]
    fn the_command_excludes_the_binary_journal_directory_and_accounting_files() {
        let command = command();
        assert!(command.contains("/var/log/journal/"));
        assert!(command.contains("btmp|wtmp|lastlog|faillog"));
    }

    #[test]
    fn well_formed_output_becomes_one_path_per_line() {
        let stdout = b"/var/log/syslog\n/var/log/nginx/access.log\n";
        assert_eq!(
            parse(stdout),
            vec![
                "/var/log/syslog".to_owned(),
                "/var/log/nginx/access.log".to_owned()
            ]
        );
    }

    #[test]
    fn empty_output_yields_an_empty_list() {
        assert_eq!(parse(b""), Vec::<String>::new());
    }
}
