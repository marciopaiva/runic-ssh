//! Running one saved script macro on several connected hosts (ADR-0078).
//!
//! The pure half: what command a script macro becomes on one host, and the
//! limits a run is held to. Nothing here touches a connection, which is what
//! lets the quoting be tested exhaustively without a server.
//!
//! The same wrapping `features/macros/script.ts` does for a pty, with the same
//! semantics (ADR-0070), so a macro means the same thing typed and run. The
//! two are kept in step by the vectors in this module's tests.

use std::time::Duration;

/// How much of each stream a host may answer with before the rest is dropped.
///
/// A host is adversary 1 (`docs/security-model.md`): it must not be able to
/// exhaust memory by what it sends. A figure rather than a probe, to be revisited
/// once real runs have been measured (ADR-0078, Consequences).
pub const MAX_STREAM_BYTES: usize = 64 * 1024;

/// How long one host may take before its channel is closed on it.
///
/// Per host, not per run, so one hung host does not hold the others' answers
/// back.
pub const HOST_DEADLINE: Duration = Duration::from_secs(30);

/// What a script macro's saved text and one host's identity become.
pub struct HostVariables<'a> {
    pub host: &'a str,
    pub port: u16,
    pub user: &'a str,
}

/// Single-quotes a shell value: closes the quote, escapes the one apostrophe
/// single quoting cannot hold, reopens it.
fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

/// The interpreter a script macro runs under, named by a leading `#!` line.
///
/// `#!/usr/bin/env bash` names `bash`, the same as `#!/bin/bash` does. A name
/// outside `[A-Za-z0-9_.-]+`, or no `#!` line at all, falls back to `sh`: the
/// name is spliced into a command line unquoted, so what it may contain is the
/// whole defence against a `#!` line adding shell syntax.
fn interpreter(text: &str) -> String {
    let first = text.lines().next().unwrap_or("").trim();
    let Some(rest) = first.strip_prefix("#!") else {
        return "sh".to_owned();
    };

    let mut words = rest.split_whitespace();
    let named = |word: Option<&str>| -> Option<String> {
        word.and_then(|w| w.rsplit('/').next())
            .filter(|w| !w.is_empty())
            .map(str::to_owned)
    };

    let Some(command) = named(words.next()) else {
        return "sh".to_owned();
    };
    let chosen = if command == "env" {
        named(words.next()).unwrap_or_else(|| "sh".to_owned())
    } else {
        command
    };

    let allowed = chosen
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'.' | b'-'));
    if allowed {
        chosen
    } else {
        "sh".to_owned()
    }
}

/// A heredoc delimiter that does not appear on a line of its own in `text`.
///
/// Chosen by looking rather than by luck: a counter is appended until no line
/// of the script equals it, so the script cannot close its own heredoc early.
fn marker_for(text: &str) -> String {
    let mut attempt = 0_u32;
    loop {
        let marker = format!("RUNIC_FLEET_{attempt}_EOF");
        if !text.lines().any(|line| line == marker) {
            return marker;
        }
        attempt += 1;
    }
}

/// The exact string sent over an exec channel for `text` on one host.
///
/// The exports live inside the heredoc, so what the script does to its
/// environment or working directory ends with the interpreter. The marker is
/// single-quoted, which stops the outer shell expanding `$host` itself.
pub fn build_command(text: &str, vars: &HostVariables<'_>) -> String {
    let marker = marker_for(text);
    let body = if text.ends_with('\n') {
        text.to_owned()
    } else {
        format!("{text}\n")
    };

    format!(
        "{interpreter} <<'{marker}'\nexport host={host}\nexport port={port}\nexport username={user}\n{body}{marker}\n",
        interpreter = interpreter(text),
        host = shell_quote(vars.host),
        port = shell_quote(&vars.port.to_string()),
        user = shell_quote(vars.user),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vars() -> HostVariables<'static> {
        HostVariables {
            host: "web-01",
            port: 22,
            user: "deploy",
        }
    }

    #[test]
    fn a_script_without_a_shebang_runs_under_sh_with_the_three_variables() {
        let command = build_command("echo $host", &vars());

        assert_eq!(
            command,
            "sh <<'RUNIC_FLEET_0_EOF'\nexport host='web-01'\nexport port='22'\nexport username='deploy'\necho $host\nRUNIC_FLEET_0_EOF\n"
        );
    }

    #[test]
    fn env_and_a_direct_path_name_the_same_interpreter() {
        assert!(build_command("#!/usr/bin/env bash\ntrue", &vars()).starts_with("bash <<"));
        assert!(build_command("#!/bin/bash\ntrue", &vars()).starts_with("bash <<"));
    }

    #[test]
    fn an_interpreter_name_that_could_add_shell_syntax_falls_back_to_sh() {
        for hostile in [
            "#!/bin/sh;reboot\ntrue",
            "#!/bin/$(id)\ntrue",
            "#!/bin/a`b`\ntrue",
            "#!/bin/a|b\ntrue",
            "#!\ntrue",
            "#!/usr/bin/env\ntrue",
        ] {
            assert!(
                build_command(hostile, &vars()).starts_with("sh <<"),
                "{hostile:?} must not choose an interpreter"
            );
        }
    }

    #[test]
    fn a_value_with_an_apostrophe_cannot_leave_its_quotes() {
        let hostile = HostVariables {
            host: "a'; reboot; echo '",
            port: 22,
            user: "u",
        };

        let command = build_command("true", &hostile);

        assert!(command.contains("export host='a'\\''; reboot; echo '\\'''\n"));
    }

    #[test]
    fn a_script_that_contains_the_marker_cannot_close_its_own_heredoc() {
        let text = "echo hi\nRUNIC_FLEET_0_EOF\nreboot";

        let command = build_command(text, &vars());

        assert!(command.starts_with("sh <<'RUNIC_FLEET_1_EOF'\n"));
        assert!(command.ends_with("RUNIC_FLEET_1_EOF\n"));
    }

    #[test]
    fn a_missing_trailing_newline_is_added_so_the_marker_stays_on_its_own_line() {
        let command = build_command("true", &vars());

        assert!(command.contains("\ntrue\nRUNIC_FLEET_0_EOF\n"));
    }
}
