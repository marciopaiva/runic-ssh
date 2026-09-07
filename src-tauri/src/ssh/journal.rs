//! A systemd unit's own recent journal lines, read over the connection
//! already open.
//!
//! Read-only, matching `ssh::systemd`'s own scope: nothing here rotates,
//! vacuums or otherwise touches the journal, only reads its tail.
//!
//! The unit name crosses two boundaries before it reaches a shell here:
//! `ssh::systemd` parsed it from the host's own `systemctl` output, and the
//! frontend echoes it straight back as this command's own argument.
//! [`command`] refuses to build a shell command from anything that does not
//! look like a real systemd unit name, rather than trusting what arrives:
//! see [`looks_like_a_unit_name`].

/// How many of the most recent lines the command asks for.
const TAIL_LINES: u32 = 50;

/// Whether `unit` could be a real systemd unit name.
///
/// Systemd itself restricts a unit name's own character set
/// (`systemd.unit(5)`); this only checks the part of that restriction which
/// also happens to keep the name safe to interpolate into a shell command
/// unquoted: nothing here is a shell metacharacter, and a leading `-` is
/// refused so the name can never read as a flag `journalctl` itself would
/// parse instead of a unit to look up.
fn looks_like_a_unit_name(unit: &str) -> bool {
    unit.ends_with(".service")
        && !unit.starts_with('-')
        && unit
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, ':' | '_' | '.' | '\\' | '-' | '@'))
}

/// The command sent over [`Connection::run_command`](crate::ssh::connection::Connection::run_command),
/// or `None` when `unit` does not look like a real unit name.
///
/// `2>/dev/null` keeps a permission error (reading the system journal
/// commonly needs `systemd-journal` group membership or root) off the
/// stdout this parses, the same reasoning `ssh::monitor::command`'s own
/// `df` call already uses.
#[must_use]
pub fn command(unit: &str) -> Option<String> {
    looks_like_a_unit_name(unit).then(|| {
        format!("journalctl -u {unit} -n {TAIL_LINES} --no-pager --output=short-iso 2>/dev/null")
    })
}

/// Parses [`command`]'s own output: every non-empty line, in the order the
/// host printed them. Never fails; a host with nothing to report (no
/// journal for this unit, or no `journalctl` at all) yields an empty list.
#[must_use]
pub fn parse(stdout: &[u8]) -> Vec<String> {
    String::from_utf8_lossy(stdout)
        .lines()
        .map(str::trim_end)
        .filter(|line| !line.is_empty())
        .map(str::to_owned)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_well_formed_unit_name_builds_a_command_that_asks_for_it_by_name() {
        let command = command("ssh.service").expect("a real unit name builds a command");
        assert!(command.contains("journalctl"));
        assert!(command.contains("-u ssh.service"));
        assert!(command.contains("-n 50"));
    }

    #[test]
    fn a_name_with_shell_metacharacters_never_reaches_a_shell() {
        assert_eq!(command("ssh.service; rm -rf /"), None);
        assert_eq!(command("$(reboot).service"), None);
        assert_eq!(command("`reboot`.service"), None);
        assert_eq!(command("a b.service"), None);
    }

    #[test]
    fn a_name_that_could_read_as_journalctls_own_flag_is_refused() {
        assert_eq!(command("--force.service"), None);
    }

    #[test]
    fn a_name_not_ending_in_service_is_refused() {
        assert_eq!(command("ssh"), None);
        assert_eq!(command("ssh.socket"), None);
    }

    #[test]
    fn well_formed_output_becomes_trimmed_non_empty_lines_in_order() {
        let stdout =
            b"-- Journal begins --\n2026-09-07 sshd started  \n\n2026-09-07 accepted deploy\n";
        assert_eq!(
            parse(stdout),
            vec![
                "-- Journal begins --".to_owned(),
                "2026-09-07 sshd started".to_owned(),
                "2026-09-07 accepted deploy".to_owned(),
            ]
        );
    }

    #[test]
    fn empty_output_yields_an_empty_list() {
        assert_eq!(parse(b""), Vec::<String>::new());
    }
}
