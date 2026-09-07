//! A host's own running processes, read over the connection already open.
//!
//! Read-only, matching `ssh::systemd`'s own scope: nothing here kills,
//! renices or otherwise touches a process. It only lists the busiest ones.
//!
//! `ps`'s own column set is not portable. BusyBox's `ps` (the target the
//! project's other SSH fixture already runs) has no `--sort` flag and no
//! `pcpu`/`pmem` columns at all; it answers with a usage message on
//! `stderr`, which [`Connection::run_command`](crate::ssh::connection::Connection::run_command)
//! never sees, so a host like that yields an empty list the same way a host
//! with no `systemd` does. `LC_ALL=C` keeps `%CPU`/`%MEM` printed with a
//! period, since a host's own locale can otherwise format that decimal with
//! a comma.

/// How many of the busiest processes the command asks for. Bounds one
/// poll's own reply the same way `df`'s output is bounded by however many
/// filesystems a host actually has, except a host can have thousands of
/// processes where it rarely has thousands of mounts.
const PROCESS_LIMIT: u32 = 30;

/// The command sent over [`Connection::run_command`](crate::ssh::connection::Connection::run_command).
///
/// Sorted by CPU on the host, not the client: asking for the busiest thirty
/// keeps the reply small regardless of how many processes the host is
/// actually running. `args` rather than `comm` for the last column: a short
/// process name alone (`sshd`) is less useful than the command line
/// (`/usr/sbin/sshd -D`), and the same "whatever is left, rejoined" parsing
/// `ssh::systemd::parse_line` already uses for a unit's description handles
/// a command line's own embedded spaces just as well.
#[must_use]
pub fn command() -> String {
    format!("LC_ALL=C ps -eo pid,user,pcpu,pmem,args --sort=-pcpu --no-headers | head -n {PROCESS_LIMIT}")
}

/// One line of the command's own output, named the way `ps` names its
/// columns.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Process {
    pub pid: u32,
    pub user: String,
    pub cpu_percent: f64,
    pub mem_percent: f64,
    pub command: String,
}

/// Parses [`command`]'s own output. Never fails: a line this does not
/// recognize is skipped rather than turned into a placeholder row, and a
/// host with nothing to report (an unsupported `ps`, or genuinely no
/// output) yields an empty list.
#[must_use]
pub fn parse_processes(stdout: &[u8]) -> Vec<Process> {
    String::from_utf8_lossy(stdout)
        .lines()
        .filter_map(parse_line)
        .collect()
}

fn parse_line(line: &str) -> Option<Process> {
    let mut fields = line.split_whitespace();
    let pid = fields.next()?.parse().ok()?;
    let user = fields.next()?.to_owned();
    let cpu_percent = fields.next()?.parse().ok()?;
    let mem_percent = fields.next()?.parse().ok()?;
    let command = fields.collect::<Vec<_>>().join(" ");
    if command.is_empty() {
        return None;
    }

    Some(Process {
        pid,
        user,
        cpu_percent,
        mem_percent,
        command,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const PS: &str = "\
   2430 deploy      0.3  0.4 sshd-session: deploy@pts/0
      1 root        0.1  0.2 /lib/systemd/systemd
   1975 deploy      0.0  0.1 /usr/lib/systemd/systemd --user
";

    #[test]
    fn well_formed_lines_parse_into_processes_sorted_the_way_the_host_sent_them() {
        let processes = parse_processes(PS.as_bytes());

        assert_eq!(
            processes,
            vec![
                Process {
                    pid: 2430,
                    user: "deploy".to_owned(),
                    cpu_percent: 0.3,
                    mem_percent: 0.4,
                    command: "sshd-session: deploy@pts/0".to_owned(),
                },
                Process {
                    pid: 1,
                    user: "root".to_owned(),
                    cpu_percent: 0.1,
                    mem_percent: 0.2,
                    command: "/lib/systemd/systemd".to_owned(),
                },
                Process {
                    pid: 1975,
                    user: "deploy".to_owned(),
                    cpu_percent: 0.0,
                    mem_percent: 0.1,
                    command: "/usr/lib/systemd/systemd --user".to_owned(),
                },
            ]
        );
    }

    #[test]
    fn a_line_with_no_command_left_over_is_skipped() {
        assert_eq!(parse_processes(b"   123 root 0.0 0.0\n"), Vec::new());
    }

    #[test]
    fn a_line_whose_percentages_do_not_parse_is_skipped() {
        assert_eq!(
            parse_processes(b"   123 root n/a n/a some-command\n"),
            Vec::new()
        );
    }

    #[test]
    fn an_unsupported_ps_that_prints_nothing_to_stdout_yields_an_empty_list() {
        assert_eq!(parse_processes(b""), Vec::new());
    }
}
