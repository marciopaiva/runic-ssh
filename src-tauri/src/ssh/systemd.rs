//! A host's own systemd units, read over the connection already open.
//!
//! Read-only, on purpose: this module lists what `systemctl` reports and
//! parses it, and nothing here starts, stops or reloads anything. That is
//! deliberately a later, separate decision, not a smaller version of this
//! one: a button that can take a production service down needs its own
//! confirmation and its own answer to who has permission to press it,
//! neither of which a unit list needs.
//!
//! A host with no `systemd` (most containers, some minimal servers) answers
//! with nothing to parse rather than an error: `systemctl: not found` on
//! `stdout` yields an empty list the same way an empty host does, and the
//! caller cannot tell the two apart, which is the right amount of detail for
//! a screen that is not going to explain init systems.

/// Sent over [`Connection::run_command`](crate::ssh::connection::Connection::run_command).
///
/// `--no-legend` drops the header row and the trailing unit count, `--plain`
/// drops the tree-drawing marks some `systemd` versions print for a failed
/// unit, and `--no-pager` matters even off a real terminal: some
/// distributions default `$PAGER` in a way that still tries to page a long
/// list over a non-interactive channel.
pub fn list_units_command() -> &'static str {
    "systemctl list-units --type=service --all --no-legend --plain --no-pager"
}

/// One line of `systemctl list-units`, named the way `systemctl` names its
/// own columns.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Unit {
    pub name: String,
    /// `loaded`, `not-found`, `masked`, ...
    pub load: String,
    /// `active`, `inactive`, `failed`, ...
    pub active: String,
    /// `running`, `exited`, `dead`, `failed`, ...
    pub sub: String,
    pub description: String,
}

/// Parses [`list_units_command`]'s output. Never fails: a line this does not
/// recognize is skipped rather than turned into a placeholder row, and a host
/// with nothing to report yields an empty list.
#[must_use]
pub fn parse_units(stdout: &[u8]) -> Vec<Unit> {
    String::from_utf8_lossy(stdout)
        .lines()
        .filter_map(parse_line)
        .collect()
}

fn parse_line(line: &str) -> Option<Unit> {
    /* A failed unit is marked with a leading bullet on some systemd
    versions when they believe they are writing to a terminal; `--plain`
    is meant to suppress it, and stripping it here as well costs nothing
    on a version that already agrees. */
    let trimmed = line.trim().trim_start_matches('●').trim();
    if trimmed.is_empty() {
        return None;
    }

    let mut fields = trimmed.split_whitespace();
    let name = fields.next()?.to_owned();
    /* `--type=service` guarantees every real line names a `.service` unit;
    a shell's own "command not found" also splits into four-plus
    whitespace-separated words and would otherwise parse as a unit whose
    name is a shell's own error message. */
    if !name.ends_with(".service") {
        return None;
    }
    let load = fields.next()?.to_owned();
    let active = fields.next()?.to_owned();
    let sub = fields.next()?.to_owned();
    /* Whatever is left, rejoined with single spaces: `systemctl` pads
    columns with more than one space for alignment, and a description is
    prose nobody is going to notice was re-flowed. */
    let description = fields.collect::<Vec<_>>().join(" ");

    Some(Unit {
        name,
        load,
        active,
        sub,
        description,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const REALISTIC: &str = "\
accounts-daemon.service      loaded active running Accounts Service
cron.service                 loaded active running Regular background program processing daemon
ssh.service                  loaded active running OpenBSD Secure Shell server
apache2.service              loaded failed failed  The Apache HTTP Server
bluetooth.service             loaded inactive dead   Bluetooth service
";

    #[test]
    fn every_column_lands_in_its_own_field() {
        let units = parse_units(REALISTIC.as_bytes());

        assert_eq!(
            units[0],
            Unit {
                name: "accounts-daemon.service".to_owned(),
                load: "loaded".to_owned(),
                active: "active".to_owned(),
                sub: "running".to_owned(),
                description: "Accounts Service".to_owned(),
            }
        );
    }

    #[test]
    fn a_multi_word_description_stays_one_field() {
        let units = parse_units(REALISTIC.as_bytes());

        let cron = units
            .iter()
            .find(|u| u.name == "cron.service")
            .expect("present");
        assert_eq!(
            cron.description,
            "Regular background program processing daemon"
        );
    }

    #[test]
    fn a_failed_unit_parses_the_same_as_any_other() {
        let units = parse_units(REALISTIC.as_bytes());

        let apache = units
            .iter()
            .find(|u| u.name == "apache2.service")
            .expect("present");
        assert_eq!(apache.active, "failed");
        assert_eq!(apache.sub, "failed");
    }

    #[test]
    fn a_leading_failure_bullet_does_not_shift_the_columns() {
        let bulleted = "● apache2.service loaded failed failed The Apache HTTP Server\n";
        let units = parse_units(bulleted.as_bytes());

        assert_eq!(units[0].name, "apache2.service");
        assert_eq!(units[0].description, "The Apache HTTP Server");
    }

    #[test]
    fn a_host_with_no_systemd_reports_no_units_rather_than_failing() {
        /* What `systemctl: not found` on stdout, from a shell that could not
        find the binary, actually looks like: nothing this parser
        recognizes as a unit line. */
        assert_eq!(parse_units(b"sh: systemctl: not found\n"), Vec::new());
    }

    #[test]
    fn blank_lines_are_skipped_rather_than_counted() {
        assert_eq!(parse_units(b"\n\n   \n"), Vec::new());
    }

    #[test]
    fn the_wire_form_is_the_one_the_frontend_declares() {
        assert_eq!(
            serde_json::to_string(&Unit {
                name: "ssh.service".to_owned(),
                load: "loaded".to_owned(),
                active: "active".to_owned(),
                sub: "running".to_owned(),
                description: "OpenBSD Secure Shell server".to_owned(),
            })
            .expect("serializes"),
            r#"{"name":"ssh.service","load":"loaded","active":"active","sub":"running","description":"OpenBSD Secure Shell server"}"#
        );
    }
}
