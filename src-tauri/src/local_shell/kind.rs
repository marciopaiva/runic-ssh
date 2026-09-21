//! What "a local shell" means on this platform.
//!
//! The choice differs by platform: Windows offers PowerShell, Command Prompt
//! and whichever WSL distributions are installed; everywhere else there is
//! exactly one shell worth naming, the user's own `$SHELL`. Detection runs
//! once per process and is cached, since the answer does not change while
//! the app is running.
//!
//! No display label lives here. CLAUDE.md section 1 keeps user-facing text
//! out of every file but `src/locales/`, so the frontend maps each variant
//! to its own locale key; this module hands back structured data only.

use std::sync::OnceLock;

use portable_pty::CommandBuilder;
use serde::{Deserialize, Serialize};

/// A kind of local shell this platform can open.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LocalShellKind {
    #[cfg(windows)]
    PowerShell,
    #[cfg(windows)]
    Cmd,
    /// One installed WSL distribution, named the way `wsl.exe -l -q` names
    /// it.
    #[cfg(windows)]
    Wsl { distro: String },
    /// The one shell worth naming outside Windows: whatever `$SHELL` says,
    /// or `/bin/sh` when even that is unset.
    #[cfg(not(windows))]
    DefaultShell,
}

impl LocalShellKind {
    /// The program and arguments that open this shell.
    pub fn command(&self) -> CommandBuilder {
        match self {
            #[cfg(windows)]
            Self::PowerShell => CommandBuilder::new("powershell.exe"),
            #[cfg(windows)]
            Self::Cmd => CommandBuilder::new("cmd.exe"),
            #[cfg(windows)]
            Self::Wsl { distro } => {
                let mut command = CommandBuilder::new("wsl.exe");
                command.arg("-d");
                command.arg(distro);
                command
            }
            #[cfg(not(windows))]
            Self::DefaultShell => {
                let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_owned());
                CommandBuilder::new(shell)
            }
        }
    }
}

fn detect() -> Vec<LocalShellKind> {
    #[cfg(windows)]
    {
        let mut kinds = vec![LocalShellKind::PowerShell, LocalShellKind::Cmd];
        kinds.extend(
            detect_wsl_distros()
                .into_iter()
                .map(|distro| LocalShellKind::Wsl { distro }),
        );
        kinds
    }

    #[cfg(not(windows))]
    {
        vec![LocalShellKind::DefaultShell]
    }
}

/// Lists installed WSL distributions. Empty on any failure: a machine with
/// no WSL, or `wsl.exe` refusing to run, offers PowerShell and Command
/// Prompt and nothing more, rather than failing detection outright.
#[cfg(windows)]
fn detect_wsl_distros() -> Vec<String> {
    let Ok(output) = std::process::Command::new("wsl.exe")
        .args(["-l", "-q"])
        .output()
    else {
        return Vec::new();
    };

    if !output.status.success() {
        return Vec::new();
    }

    decode_wsl_list(&output.stdout)
}

/// `wsl.exe`'s stdout is UTF-16LE, like every other console tool on Windows
/// that predates UTF-8 becoming the console's own default.
#[cfg(windows)]
fn decode_wsl_list(raw: &[u8]) -> Vec<String> {
    let units: Vec<u16> = raw
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .collect();

    String::from_utf16_lossy(&units)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_owned)
        .collect()
}

static DETECTED: OnceLock<Vec<LocalShellKind>> = OnceLock::new();

/// The shells this platform offers, detected once and cached for the life of
/// the process.
pub fn detected() -> Vec<LocalShellKind> {
    DETECTED.get_or_init(detect).clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(not(windows))]
    #[test]
    fn the_default_shell_is_the_only_one_offered() {
        assert_eq!(detect(), vec![LocalShellKind::DefaultShell]);
    }

    #[cfg(not(windows))]
    #[test]
    fn the_default_shell_names_a_real_program() {
        // Whatever $SHELL says in this environment, or the /bin/sh fallback:
        // either way `command()` names something to run, not an empty argv0.
        let command = LocalShellKind::DefaultShell.command();
        assert!(!command.get_argv()[0].is_empty());
    }

    #[cfg(windows)]
    #[test]
    fn a_wsl_listing_decodes_from_utf16_and_drops_blank_lines() {
        let raw: Vec<u8> = "Ubuntu-24.04\r\ndocker-desktop\r\n\r\n"
            .encode_utf16()
            .flat_map(u16::to_le_bytes)
            .collect();

        assert_eq!(
            decode_wsl_list(&raw),
            vec!["Ubuntu-24.04".to_owned(), "docker-desktop".to_owned()]
        );
    }

    #[cfg(windows)]
    #[test]
    fn windows_always_offers_powershell_and_cmd() {
        let kinds = detect();
        assert!(kinds.contains(&LocalShellKind::PowerShell));
        assert!(kinds.contains(&LocalShellKind::Cmd));
    }
}
