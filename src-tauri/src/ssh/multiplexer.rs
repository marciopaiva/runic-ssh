//! The command that opens a host's shell inside a multiplexer (ADR-0079).
//!
//! Built here, from a saved choice and a saved session id, so the webview never
//! sends a command and nothing it can type reaches this string. The session
//! name is made of the id and nothing else, and the id is cleaned to
//! `[A-Za-z0-9_-]` before it is used, so it cannot add shell syntax.
//!
//! The same command is used on the first connect and on every reconnect, which
//! is what makes reconnecting reattach: `tmux new-session -A` attaches to the
//! session of that name when it exists and creates it when it does not.
//!
//! A host without the multiplexer still gets its login shell. The check and
//! the fallback live in the command, because the alternative is a session that
//! opens and closes at once on a host nobody installed tmux on.

use crate::config::sessions::Multiplexer;

fn clean(id: &str) -> String {
    id.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

/// The command run in place of the login shell, or `None` for a plain shell.
pub fn shell_command(multiplexer: Option<Multiplexer>, session_id: &str) -> Option<String> {
    let (program, attach) = match multiplexer? {
        Multiplexer::Tmux => ("tmux", "tmux new-session -A -s"),
        Multiplexer::Screen => ("screen", "screen -xRR -S"),
    };

    /* The body is single quoted for whatever shell the host gives us (bash,
    zsh, fish and sh all read it the same way) and the name travels as an
    argument, so it is never spliced into the quoted text. */
    Some(format!(
        "exec sh -c 'command -v {program} >/dev/null 2>&1 && exec {attach} \"$0\"; exec \"${{SHELL:-sh}}\" -l' runic-{name}",
        name = clean(session_id),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_multiplexer_means_a_plain_shell() {
        assert_eq!(shell_command(None, "abc"), None);
    }

    #[test]
    fn tmux_attaches_or_creates_by_name_and_falls_back_to_the_login_shell() {
        let command = shell_command(Some(Multiplexer::Tmux), "ab12").expect("a command");

        assert_eq!(
            command,
            "exec sh -c 'command -v tmux >/dev/null 2>&1 && exec tmux new-session -A -s \"$0\"; exec \"${SHELL:-sh}\" -l' runic-ab12"
        );
    }

    #[test]
    fn screen_reattaches_by_name() {
        let command = shell_command(Some(Multiplexer::Screen), "ab12").expect("a command");

        assert!(command.contains("exec screen -xRR -S \"$0\""));
        assert!(command.ends_with("runic-ab12"));
    }

    #[test]
    fn an_id_cannot_add_shell_syntax() {
        let command =
            shell_command(Some(Multiplexer::Tmux), "a'; reboot; 'b$(id)").expect("a command");

        assert!(command.ends_with("runic-a___reboot___b__id_"));
        assert!(!command.contains("reboot;"));
    }
}
