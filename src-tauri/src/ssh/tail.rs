//! The tail of an arbitrary log file, read over the connection already
//! open.
//!
//! Read-only, matching `ssh::journal`'s own scope, for the case that module
//! does not cover: a service that logs to a plain file instead of, or as
//! well as, the systemd journal. Apache, nginx and Postgres are the usual
//! examples.
//!
//! The trust story here is the mirror image of `ssh::journal`'s. A unit
//! name there comes from the host's own `systemctl` output, which a
//! compromised host could have forged, so [`crate::ssh::journal`] refuses
//! anything that does not look like a real unit name before it is ever
//! interpolated into a command. A path here is typed by the person sitting
//! at this application, not reported by the host, so refusing unusual
//! characters would refuse a legitimate log path for no reason (spaces and
//! non-ASCII bytes are ordinary in a filename). What still has to hold is
//! that the path reaches the remote shell as one argument regardless of
//! what it contains, which [`shell_quote`] gives by construction rather
//! than by an allow-list.

/// How many of the most recent lines the command asks for. Matches
/// `ssh::journal::TAIL_LINES`'s own value, coincidentally rather than by
/// a shared constant: the two commands ask a different program for a
/// different kind of file, and nothing requires them to agree.
const TAIL_LINES: u32 = 50;

/// Wraps `value` in single quotes for a POSIX shell, escaping any single
/// quote already inside it.
///
/// Single quotes suppress every other kind of expansion a shell would
/// otherwise perform (variables, command substitution, globbing), which is
/// what makes this sufficient on its own: the content between the quotes
/// never needs its own character allow-list. The one character a single
/// quote cannot itself contain is another single quote, so each one in
/// `value` closes the quote, contributes an escaped quote, and reopens it:
/// `it's` becomes `'it'\''s'`.
fn shell_quote(value: &str) -> String {
    let mut quoted = String::with_capacity(value.len() + 2);
    quoted.push('\'');
    for c in value.chars() {
        if c == '\'' {
            quoted.push_str("'\\''");
        } else {
            quoted.push(c);
        }
    }
    quoted.push('\'');
    quoted
}

/// The command sent over [`Connection::run_command`](crate::ssh::connection::Connection::run_command),
/// or `None` when `path` is empty or not absolute.
///
/// An absolute path is required rather than merely preferred, for two
/// reasons. A relative one would resolve against whatever directory this
/// connection's login shell happens to start in, which differs from host to
/// host and is not something this application ever shows, so it would tail
/// an unpredictable file rather than refusing cleanly. It also guarantees
/// the argument `tail` receives always starts with `/`, never with `-`, so
/// nothing here can be misread as one of `tail`'s own flags in the first
/// place. `2>/dev/null` keeps a permission error or a missing file off the
/// stdout this parses, the same reasoning `ssh::monitor::command`'s own
/// `df` call already uses.
#[must_use]
pub fn command(path: &str) -> Option<String> {
    let path = path.trim();
    (!path.is_empty() && path.starts_with('/'))
        .then(|| format!("tail -n {TAIL_LINES} {} 2>/dev/null", shell_quote(path)))
}

/// Parses [`command`]'s own output: every non-empty line, in the order the
/// host printed them. Shares `ssh::journal::parse`'s own logic exactly (a
/// log file's blank lines are as uninteresting as a journal's), so this
/// calls it directly rather than repeating it.
#[must_use]
pub fn parse(stdout: &[u8]) -> Vec<String> {
    super::journal::parse(stdout)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_absolute_path_builds_a_tail_command_for_it() {
        let command =
            command("/var/log/nginx/access.log").expect("an absolute path builds a command");
        assert!(command.contains("tail -n 50"));
        assert!(command.contains("'/var/log/nginx/access.log'"));
    }

    #[test]
    fn a_relative_path_is_refused() {
        assert_eq!(command("var/log/nginx/access.log"), None);
    }

    #[test]
    fn an_empty_or_blank_path_is_refused() {
        assert_eq!(command(""), None);
        assert_eq!(command("   "), None);
    }

    #[test]
    fn surrounding_whitespace_is_trimmed_before_the_path_is_judged() {
        let command = command("  /var/log/app.log  ").expect("trims before judging");
        assert!(command.contains("'/var/log/app.log'"));
    }

    #[test]
    fn a_single_quote_in_the_path_is_escaped_rather_than_closing_the_quote_early() {
        assert_eq!(
            shell_quote("/var/log/it's a log.log"),
            "'/var/log/it'\\''s a log.log'"
        );
    }

    #[test]
    fn shell_metacharacters_never_escape_the_quoted_argument() {
        let command = command("/tmp/$(reboot); rm -rf ~.log")
            .expect("a path is a path, whatever it contains");
        /* The whole hostile string must appear intact, inside one quoted
        argument, rather than any of it landing outside the quotes where a
        shell would act on it. */
        assert!(command.contains("'/tmp/$(reboot); rm -rf ~.log'"));
    }

    #[test]
    fn requiring_an_absolute_path_also_guarantees_the_argument_never_starts_with_a_dash() {
        /* A relative value that looked like a flag (`-rf`, say) is already
        refused by `a_relative_path_is_refused`; this is the same guarantee
        seen from the other side, an absolute path that merely contains one
        further in. */
        let command = command("/-rf").expect("still an absolute path");
        assert!(command.starts_with("tail -n 50 '/-rf'"));
    }
}
