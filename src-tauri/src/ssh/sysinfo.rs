//! A host's own identity, read once over the connection already open.
//!
//! Unlike `ssh::monitor`, this never changes for the life of a connection,
//! so it is its own command and its own poll, fetched once when a host is
//! selected rather than on the recurring interval: asking a host what
//! kernel it runs every fifteen seconds would be traffic spent on an
//! answer that was never going to change.

/// Separates each command's own output from the next, the same convention
/// `ssh::monitor::command` uses and for the same reason: nothing here
/// prints this on its own.
const SECTION_MARKER: &str = "@@RUNIC-SYSINFO@@";

/// The command sent over [`Connection::run_command`](crate::ssh::connection::Connection::run_command).
///
/// `/etc/os-release` may not exist on a host old or minimal enough to lack
/// it; `2>/dev/null` keeps that shell error off the stdout this parses,
/// the same reasoning `ssh::monitor::command`'s own `df` call already
/// uses. `grep -m1` stops at the first match: some kernels list one `model
/// name` line per logical CPU, and every one of them names the same part.
pub fn command() -> String {
    format!(
        "cat /etc/os-release 2>/dev/null; echo {marker}; uname -srm; echo {marker}; \
         cat /proc/sys/kernel/hostname 2>/dev/null; echo {marker}; \
         grep -m1 'model name' /proc/cpuinfo 2>/dev/null",
        marker = SECTION_MARKER,
    )
}

/// A host's own identity. Every field is independent, the same rule
/// `ssh::monitor::SystemStats` follows: a host that answers three of these
/// and not the fourth still gets the three.
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    /// `PRETTY_NAME` from `/etc/os-release`, e.g. "Debian GNU/Linux 13 (trixie)".
    pub os_name: Option<String>,
    /// `uname -srm`, e.g. "Linux 6.6.87.2 x86_64".
    pub kernel: Option<String>,
    pub hostname: Option<String>,
    /// `/proc/cpuinfo`'s own `model name`. Absent on some ARM kernels,
    /// which print different fields there; not read here, since a wrong
    /// guess reads worse than no reading at all.
    pub cpu_model: Option<String>,
}

/// Parses [`command`]'s combined output into [`SystemInfo`]. Never fails,
/// the same reasoning `ssh::monitor::parse` gives.
#[must_use]
pub fn parse(stdout: &[u8]) -> SystemInfo {
    let text = String::from_utf8_lossy(stdout);
    let mut sections = text.split(SECTION_MARKER);

    let os_release = sections.next().unwrap_or_default();
    let uname = sections.next().unwrap_or_default();
    let hostname = sections.next().unwrap_or_default();
    let cpuinfo = sections.next().unwrap_or_default();

    SystemInfo {
        os_name: os_pretty_name(os_release),
        kernel: non_empty_line(uname),
        hostname: non_empty_line(hostname),
        cpu_model: cpu_model(cpuinfo),
    }
}

/// The first line with visible content, trimmed. `[`command`]'s own
/// `echo`s leave a blank line at the top of the section after them, the
/// same artifact `ssh::monitor`'s own parser already works around.
fn non_empty_line(section: &str) -> Option<String> {
    section
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_owned)
}

fn os_pretty_name(os_release: &str) -> Option<String> {
    let line = os_release
        .lines()
        .find_map(|line| line.strip_prefix("PRETTY_NAME="))?;
    Some(line.trim().trim_matches('"').to_owned())
}

fn cpu_model(cpuinfo: &str) -> Option<String> {
    let line = cpuinfo.lines().find(|line| line.contains("model name"))?;
    let (_, value) = line.split_once(':')?;
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    const OS_RELEASE: &str =
        "PRETTY_NAME=\"Debian GNU/Linux 13 (trixie)\"\nNAME=\"Debian GNU/Linux\"\nID=debian\n";
    const UNAME: &str = "Linux 6.6.87.2-microsoft-standard-WSL2 x86_64\n";
    const HOSTNAME: &str = "web-01\n";
    const CPUINFO: &str = "model name\t: Intel(R) Core(TM) Ultra 9 285K\ncpu MHz\t\t: 3200.000\n";

    fn combined() -> Vec<u8> {
        format!("{OS_RELEASE}{SECTION_MARKER}\n{UNAME}{SECTION_MARKER}\n{HOSTNAME}{SECTION_MARKER}\n{CPUINFO}")
            .into_bytes()
    }

    #[test]
    fn every_field_reads_from_one_combined_command() {
        let info = parse(&combined());

        assert_eq!(
            info.os_name.as_deref(),
            Some("Debian GNU/Linux 13 (trixie)")
        );
        assert_eq!(
            info.kernel.as_deref(),
            Some("Linux 6.6.87.2-microsoft-standard-WSL2 x86_64")
        );
        assert_eq!(info.hostname.as_deref(), Some("web-01"));
        assert_eq!(
            info.cpu_model.as_deref(),
            Some("Intel(R) Core(TM) Ultra 9 285K")
        );
    }

    #[test]
    fn a_host_with_no_os_release_reports_no_name_rather_than_failing() {
        let partial = format!("sh: cannot open{SECTION_MARKER}\n{UNAME}{SECTION_MARKER}\n{HOSTNAME}{SECTION_MARKER}\n");
        let info = parse(partial.as_bytes());

        assert_eq!(info.os_name, None);
        assert_eq!(
            info.kernel.as_deref(),
            Some("Linux 6.6.87.2-microsoft-standard-WSL2 x86_64")
        );
        assert_eq!(info.cpu_model, None);
    }

    #[test]
    fn an_arm_kernel_with_no_model_name_field_reports_no_cpu_model() {
        assert_eq!(cpu_model("Processor\t: ARMv7 Processor rev 4\n"), None);
    }

    #[test]
    fn the_wire_form_is_the_one_the_frontend_declares() {
        assert_eq!(
            serde_json::to_string(&SystemInfo {
                os_name: Some("Debian GNU/Linux 13 (trixie)".to_owned()),
                kernel: Some("Linux 6.6.87.2 x86_64".to_owned()),
                hostname: Some("web-01".to_owned()),
                cpu_model: None,
            })
            .expect("serializes"),
            r#"{"osName":"Debian GNU/Linux 13 (trixie)","kernel":"Linux 6.6.87.2 x86_64","hostname":"web-01","cpuModel":null}"#
        );
    }
}
