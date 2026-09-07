//! A host's own vital signs, read over the connection already open.
//!
//! No agent, no new dependency: everything here comes from text a Linux
//! server already prints for `top`, `free`, `df` and `uptime`, gathered in
//! one [`Connection::run_command`](crate::ssh::connection::Connection::run_command)
//! call so a poll costs one channel rather than four. CPU percent needs two
//! samples of `/proc/stat` a moment apart, so the command takes both itself
//! rather than this module holding a sample between polls. The parser stays
//! a pure function of one command's output, testable with no session, no
//! registry, and no fixture container.
//!
//! Each field degrades on its own. A host that is not Linux, or a command
//! whose output does not parse, yields `None` for the fields that failed to
//! read rather than failing the whole struct. That is the same reasoning
//! `commands::terminal::session_stats` already applies to a lost latency
//! probe.

/// The interval between the two `/proc/stat` samples the command takes.
/// Long enough that jiffy rounding does not dominate the delta, short enough
/// that a caller polling this every few seconds is not mostly waiting on it.
pub const CPU_SAMPLE_INTERVAL_SECONDS: u32 = 1;

/// Separates each command's own output from the next inside one combined
/// `stdout`. Chosen for being nothing a shell, `/proc/stat`, `/proc/meminfo`,
/// `df` or `uptime` would ever print on their own.
const SECTION_MARKER: &str = "@@RUNIC-MONITOR@@";

/// The command sent over [`Connection::run_command`](crate::ssh::connection::Connection::run_command).
///
/// `df`'s `-P` flag is load-bearing: without it, a filesystem whose name is
/// long enough wraps its line, and a parser reading "the next line" reads
/// half a filesystem name instead of the numbers. `2>/dev/null` on the `df`
/// call keeps a permission error off the stdout this parses, since only exit
/// status and stdout cross [`Connection::run_command`] at all.
pub fn command() -> String {
    format!(
        "cat /proc/stat; echo {marker}; sleep {interval}; cat /proc/stat; echo {marker}; \
         cat /proc/meminfo; echo {marker}; df -k -P / 2>/dev/null; echo {marker}; \
         cat /proc/uptime",
        marker = SECTION_MARKER,
        interval = CPU_SAMPLE_INTERVAL_SECONDS,
    )
}

/// How much of a host's own memory or disk is in use.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub used_kb: u64,
    pub total_kb: u64,
}

/// A host's vital signs at the moment it was asked. Every field is
/// independent: one failing to parse says nothing about the others.
#[derive(Debug, Clone, Copy, Default, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStats {
    pub cpu_percent: Option<f64>,
    pub memory: Option<Usage>,
    pub disk: Option<Usage>,
    pub uptime_seconds: Option<u64>,
}

/// Parses [`command`]'s combined output into [`SystemStats`].
///
/// Never fails: a section that is missing, out of order, or not in the shape
/// this expects leaves its own field `None` rather than discarding the
/// sections that did parse.
#[must_use]
pub fn parse(stdout: &[u8]) -> SystemStats {
    let text = String::from_utf8_lossy(stdout);
    let mut sections = text.split(SECTION_MARKER);

    let before = sections.next().unwrap_or_default();
    let after = sections.next().unwrap_or_default();
    let meminfo = sections.next().unwrap_or_default();
    let disk = sections.next().unwrap_or_default();
    let uptime = sections.next().unwrap_or_default();

    SystemStats {
        cpu_percent: cpu_percent(before, after),
        memory: memory(meminfo),
        disk: disk_usage(disk),
        uptime_seconds: uptime_seconds(uptime),
    }
}

/// The aggregate `cpu` line's fields, in `/proc/stat`'s own order, summed
/// only over however many this kernel printed: a field missing on an older
/// kernel is a field that contributed nothing to either sample, not a
/// reason to refuse the rest.
fn cpu_fields(stat: &str) -> Option<Vec<u64>> {
    let line = stat.lines().find(|line| line.starts_with("cpu "))?;
    let fields: Vec<u64> = line
        .split_whitespace()
        .skip(1)
        .filter_map(|field| field.parse().ok())
        .collect();

    /* user, nice, system, idle: anything shorter is not this file. */
    (fields.len() >= 4).then_some(fields)
}

/// `idle` and `iowait` are the two columns that count as the CPU doing
/// nothing; everything else counts as busy. Index 3 is `idle` and index 4
/// `iowait` in every kernel that has published this file, so the sum stays
/// correct whether or not a running kernel prints the columns after it.
fn idle_fields(fields: &[u64]) -> u64 {
    let idle = fields.first().copied().unwrap_or(0);
    let iowait = fields.get(1).copied().unwrap_or(0);
    idle + iowait
}

fn cpu_percent(before: &str, after: &str) -> Option<f64> {
    let before = cpu_fields(before)?;
    let after = cpu_fields(after)?;

    let total_before: u64 = before.iter().sum();
    let total_after: u64 = after.iter().sum();
    let total_delta = total_after.checked_sub(total_before)?;
    if total_delta == 0 {
        /* No time passed on this CPU between samples, which a parked or
        suspended host can genuinely produce. Reporting 0% would claim an
        idle host is exactly as busy as one measured for a full second and
        found to have done nothing; neither is knowable from this sample. */
        return None;
    }

    let idle_delta = idle_fields(&after[3..]).saturating_sub(idle_fields(&before[3..]));

    let busy = total_delta.saturating_sub(idle_delta);
    Some((busy as f64 / total_delta as f64) * 100.0)
}

fn meminfo_field(meminfo: &str, key: &str) -> Option<u64> {
    meminfo.lines().find_map(|line| {
        let rest = line.strip_prefix(key)?;
        rest.trim().strip_suffix(" kB")?.trim().parse().ok()
    })
}

fn memory(meminfo: &str) -> Option<Usage> {
    let total_kb = meminfo_field(meminfo, "MemTotal:")?;
    /* `MemAvailable` accounts for reclaimable cache the way a human means
    "how much can I still use", not raw `MemFree`, which counts page cache
    as unavailable and reports a host as nearly full when it is not. Absent
    on a kernel old enough not to publish it (pre-3.14), in which case this
    reading is simply not offered rather than approximated. */
    let available_kb = meminfo_field(meminfo, "MemAvailable:")?;
    let used_kb = total_kb.saturating_sub(available_kb);

    Some(Usage { used_kb, total_kb })
}

fn disk_usage(df: &str) -> Option<Usage> {
    /* `df -k -P`'s header, then one data line: filesystem, 1K-blocks, used,
    available, capacity, mounted-on. `-P` is what guarantees the data is one
    line rather than two: without it, a data line wraps once the filesystem
    name is long enough to push the numbers to a line of their own.
    Blank lines are skipped rather than counted: [`command`]'s own `echo`
    between sections leaves the section after it starting with one, from
    `echo`'s own trailing newline landing on the wrong side of the split. */
    let mut lines = df.lines().map(str::trim).filter(|line| !line.is_empty());
    let _header = lines.next()?;
    let data = lines.next()?;
    let fields: Vec<&str> = data.split_whitespace().collect();
    let total_kb = fields.get(1)?.parse().ok()?;
    let used_kb = fields.get(2)?.parse().ok()?;

    Some(Usage { used_kb, total_kb })
}

fn uptime_seconds(uptime: &str) -> Option<u64> {
    let seconds: f64 = uptime.split_whitespace().next()?.parse().ok()?;
    if seconds.is_finite() && seconds >= 0.0 {
        Some(seconds as u64)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const STAT_BEFORE: &str =
        "cpu  1000 0 500 8500 0 0 0 0 0 0\ncpu0 1000 0 500 8500 0 0 0 0 0 0\n";
    const STAT_AFTER: &str = "cpu  1100 0 550 8850 0 0 0 0 0 0\ncpu0 1100 0 550 8850 0 0 0 0 0 0\n";

    const MEMINFO: &str = "MemTotal:       16000000 kB\nMemFree:         2000000 kB\n\
                            MemAvailable:    8000000 kB\nBuffers:          500000 kB\n";

    const DF: &str =
        "Filesystem                 1024-blocks     Used Available Capacity Mounted on\n\
                       /dev/mapper/vg0-root         103080160 42123456  56000000      43% /\n";

    const UPTIME: &str = "123456.78 987654.32\n";

    /// Builds the same shape [`command`]'s real stdout has, `echo`'s own
    /// newline included: a `\n` lands right after every marker, which is
    /// what makes the section *after* each one start with a blank line.
    /// Omitting that here is exactly what let `disk_usage`'s off-by-one bug
    /// (real `df` output read as its own header) pass this module's tests
    /// while failing against a real host.
    fn combined() -> Vec<u8> {
        format!(
            "{STAT_BEFORE}{SECTION_MARKER}\n{STAT_AFTER}{SECTION_MARKER}\n{MEMINFO}{SECTION_MARKER}\n{DF}{SECTION_MARKER}\n{UPTIME}"
        )
        .into_bytes()
    }

    #[test]
    fn every_field_reads_from_one_combined_command() {
        let stats = parse(&combined());

        /* Total ticks advance by 500 (10000 to 10500), idle+iowait by 350
        (8500 to 8850): 150 of the 500 were busy, 30%. */
        assert_eq!(stats.cpu_percent, Some(30.0));
        assert_eq!(
            stats.memory,
            Some(Usage {
                used_kb: 8_000_000,
                total_kb: 16_000_000
            })
        );
        assert_eq!(
            stats.disk,
            Some(Usage {
                used_kb: 42_123_456,
                total_kb: 103_080_160
            })
        );
        assert_eq!(stats.uptime_seconds, Some(123_456));
    }

    #[test]
    fn cpu_percent_is_the_share_of_the_delta_that_was_not_idle() {
        /* user advances by 50, idle by 50: 100 ticks total, half of them
        idle, so half the CPU's time in this window was spent doing
        something. A second, differently-shaped pair from the fixture at the
        top of this module already covers the non-trivial arithmetic. */
        let before = "cpu  0 0 0 0 0 0 0 0 0 0\n";
        let after = "cpu  50 0 0 50 0 0 0 0 0 0\n";

        assert_eq!(cpu_percent(before, after), Some(50.0));
    }

    #[test]
    fn a_missing_cpu_line_leaves_the_percent_unknown() {
        assert_eq!(cpu_percent("not /proc/stat", STAT_AFTER), None);
    }

    #[test]
    fn two_identical_samples_report_unknown_rather_than_zero() {
        /* A host that did not advance any counter between the two reads was
        not observed for long enough to say anything, which is different
        from being observed and found idle. */
        assert_eq!(cpu_percent(STAT_BEFORE, STAT_BEFORE), None);
    }

    #[test]
    fn an_older_kernel_with_no_mem_available_reports_no_memory_reading() {
        let meminfo = "MemTotal:       16000000 kB\nMemFree:         2000000 kB\n";
        assert_eq!(memory(meminfo), None);
    }

    #[test]
    fn a_missing_section_leaves_only_its_own_field_unknown() {
        let partial = format!("{STAT_BEFORE}{SECTION_MARKER}{STAT_AFTER}{SECTION_MARKER}garbage");
        let stats = parse(partial.as_bytes());

        assert_eq!(stats.cpu_percent, Some(30.0));
        assert_eq!(stats.memory, None);
        assert_eq!(stats.disk, None);
        assert_eq!(stats.uptime_seconds, None);
    }

    #[test]
    fn the_wire_form_is_the_one_the_frontend_declares() {
        assert_eq!(
            serde_json::to_string(&SystemStats {
                cpu_percent: Some(12.5),
                memory: Some(Usage {
                    used_kb: 100,
                    total_kb: 200
                }),
                disk: None,
                uptime_seconds: Some(60),
            })
            .expect("serializes"),
            r#"{"cpuPercent":12.5,"memory":{"usedKb":100,"totalKb":200},"disk":null,"uptimeSeconds":60}"#
        );
    }
}
