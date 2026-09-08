//! A host's own vital signs, read over the connection already open.
//!
//! No agent, no new dependency: everything here comes from text a Linux
//! server already prints for `top`, `free`, `df` and `uptime`, gathered in
//! one [`Connection::run_command`](crate::ssh::connection::Connection::run_command)
//! call so a poll costs one channel rather than four. CPU percent and disk
//! I/O both need two samples a moment apart, so the command takes both
//! itself rather than this module holding a sample between polls. The parser
//! stays a pure function of one command's output, testable with no session,
//! no registry, and no fixture container.
//!
//! Each field degrades on its own. A host that is not Linux, or a command
//! whose output does not parse, yields `None` for the fields that failed to
//! read rather than failing the whole struct. That is the same reasoning
//! `commands::terminal::session_stats` already applies to a lost latency
//! probe.

use std::collections::{HashMap, HashSet};

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
/// half a filesystem name instead of the numbers. `-T` adds the filesystem
/// type column [`filesystems`] filters pseudo-filesystems on. `2>/dev/null`
/// on the `df` call keeps a permission error off the stdout this parses,
/// since only exit status and stdout cross [`Connection::run_command`] at
/// all.
///
/// `/proc/net/dev` and `/proc/diskstats` both ride in the same before/after
/// samples `/proc/stat` uses for the CPU delta. Neither file's own lines
/// collide with the other two's: a network interface's line always has a
/// colon (`eth0: 123 456 ...`) and nothing else in the blob does, and a
/// diskstats line always opens with two plain integers (major, minor) where
/// `/proc/stat`'s own lines open with a word and a colon-bearing interface
/// line's first token fails that parse. All three read out of one combined
/// blob with no marker of their own needed between them, so a disk I/O rate
/// costs no extra channel round trip over the CPU delta it already paid for.
///
/// The trailing `for` loop lists which device names are partitions, by the
/// same file the kernel itself uses to tell a partition from a disk
/// (`/sys/class/block/<dev>/partition` exists only for a partition). That is
/// the signal [`disk_io_rate`] excludes from its sum, so a partitioned
/// disk's own I/O is not counted twice, once under its own name and once
/// again folded into its parent disk's line.
pub fn command() -> String {
    format!(
        "cat /proc/stat; cat /proc/net/dev; cat /proc/diskstats; echo {marker}; sleep {interval}; \
         cat /proc/stat; cat /proc/net/dev; cat /proc/diskstats; echo {marker}; \
         cat /proc/meminfo; echo {marker}; df -k -P -T 2>/dev/null; echo {marker}; \
         cat /proc/uptime; echo {marker}; cat /proc/loadavg; echo {marker}; \
         for d in /sys/class/block/*; do [ -f \"$d/partition\" ] && basename \"$d\"; done",
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

/// The three scheduler load averages Linux keeps, over one, five and fifteen
/// minutes. Unbounded, unlike every other reading here: a host with sixteen
/// cores comfortably runs at a load of 12, so this is read as a trend against
/// itself rather than against a fixed ceiling.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadAverage {
    pub one: f64,
    pub five: f64,
    pub fifteen: f64,
}

/// One mounted filesystem. `mount` rather than the device name: a device
/// can be a UUID or an overlay id nobody recognizes, and the mount point is
/// what a person actually typed or read to find the thing that filled up.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Filesystem {
    pub mount: String,
    pub usage: Usage,
}

/// How fast bytes are moving over every network interface but loopback,
/// summed rather than kept per-interface: a v1 reading is "is this host
/// pushing more traffic than usual," not "which of its four interfaces."
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkRate {
    pub receive_bytes_per_sec: f64,
    pub transmit_bytes_per_sec: f64,
}

/// How fast bytes are moving across every real disk, one number each way
/// rather than a reading per device: the same "is this host busier than
/// usual" question [`NetworkRate`] already answers for the network, not
/// "which of its disks." A partition never contributes its own line; its
/// I/O is already inside its parent disk's counters, and [`disk_io_rate`]
/// excludes it by name so neither is counted twice.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskIoRate {
    pub read_bytes_per_sec: f64,
    pub write_bytes_per_sec: f64,
}

/// A host's vital signs at the moment it was asked. Every field is
/// independent: one failing to parse says nothing about the others.
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStats {
    pub cpu_percent: Option<f64>,
    pub memory: Option<Usage>,
    pub swap: Option<Usage>,
    /// The root filesystem's own usage, kept as its own field for the
    /// status bar and the Home tab's own card: both want one number, not a
    /// list to search for `/` in. Derived from `filesystems` below, the
    /// same `df` output parsed once.
    pub disk: Option<Usage>,
    /// Every mounted filesystem `filesystems` (the function) did not filter
    /// out as a pseudo-filesystem. Empty rather than absent when `df`
    /// itself failed or printed nothing recognizable: a host with no
    /// disks to report and a host that refused to answer read the same
    /// from here, the same reasoning `ssh::systemd::parse_units` already
    /// applies to a host with no `systemd`.
    pub filesystems: Vec<Filesystem>,
    pub network: Option<NetworkRate>,
    pub disk_io: Option<DiskIoRate>,
    pub uptime_seconds: Option<u64>,
    pub load_average: Option<LoadAverage>,
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
    let df = sections.next().unwrap_or_default();
    let uptime = sections.next().unwrap_or_default();
    let loadavg = sections.next().unwrap_or_default();
    let partitions = sections.next().unwrap_or_default();

    let filesystems = filesystems(df);
    let disk = filesystems
        .iter()
        .find(|filesystem| filesystem.mount == "/")
        .map(|filesystem| filesystem.usage);

    SystemStats {
        cpu_percent: cpu_percent(before, after),
        memory: memory(meminfo),
        swap: swap(meminfo),
        disk,
        filesystems,
        network: network_rate(before, after, f64::from(CPU_SAMPLE_INTERVAL_SECONDS)),
        disk_io: disk_io_rate(
            before,
            after,
            partitions,
            f64::from(CPU_SAMPLE_INTERVAL_SECONDS),
        ),
        uptime_seconds: uptime_seconds(uptime),
        load_average: load_average(loadavg),
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

/// A host with no swap configured (common on a cloud instance or a
/// container) reports `SwapTotal: 0`, which parses fine and is worth
/// keeping: `Usage { used_kb: 0, total_kb: 0 }` is a real answer, "this
/// host has no swap," not a parse failure to hide behind `None`.
fn swap(meminfo: &str) -> Option<Usage> {
    let total_kb = meminfo_field(meminfo, "SwapTotal:")?;
    let free_kb = meminfo_field(meminfo, "SwapFree:")?;
    let used_kb = total_kb.saturating_sub(free_kb);

    Some(Usage { used_kb, total_kb })
}

/// Filesystem types that never carry storage information worth a card:
/// kernel pseudo-filesystems, control groups, device and pipe nodes. Not
/// excluded: `tmpfs` (a `/tmp` or `/dev/shm` genuinely filling up is
/// exactly what this screen exists to catch) and `overlay`/the various
/// `fuse.*overlayfs` types (a container's own root is commonly one of
/// these, and it is real, sized storage, not a kernel bookkeeping mount).
const PSEUDO_FILESYSTEM_TYPES: &[&str] = &[
    "proc",
    "sysfs",
    "cgroup",
    "cgroup2",
    "devpts",
    "devtmpfs",
    "mqueue",
    "securityfs",
    "pstore",
    "debugfs",
    "tracefs",
    "configfs",
    "fusectl",
    "binfmt_misc",
    "autofs",
    "rpc_pipefs",
    "nsfs",
    "squashfs",
];

/// `df -k -P -T`'s header, then one data line per mount: filesystem, type,
/// 1K-blocks, used, available, capacity, mounted-on. `-P` is what
/// guarantees each mount is one line rather than two: without it, a data
/// line wraps once the filesystem name is long enough to push the numbers
/// to a line of their own. Blank lines are skipped rather than counted:
/// [`command`]'s own `echo` between sections leaves the section after it
/// starting with one, from `echo`'s own trailing newline landing on the
/// wrong side of the split.
fn filesystems(df: &str) -> Vec<Filesystem> {
    let mut lines = df.lines().map(str::trim).filter(|line| !line.is_empty());
    let Some(_header) = lines.next() else {
        return Vec::new();
    };

    lines.filter_map(parse_filesystem_line).collect()
}

fn parse_filesystem_line(line: &str) -> Option<Filesystem> {
    let fields: Vec<&str> = line.split_whitespace().collect();
    let fs_type = *fields.get(1)?;
    if PSEUDO_FILESYSTEM_TYPES.contains(&fs_type) {
        return None;
    }

    let total_kb = fields.get(2)?.parse().ok()?;
    let used_kb = fields.get(3)?.parse().ok()?;
    let mount = (*fields.get(6)?).to_owned();

    Some(Filesystem {
        mount,
        usage: Usage { used_kb, total_kb },
    })
}

/// A section's own per-interface receive and transmit byte counters,
/// loopback excluded and every other interface summed. `/proc/net/dev`'s
/// two header lines, and every line of `/proc/stat` sharing this section
/// (see [`command`]'s own doc comment), have no colon; an interface's own
/// line always does, which is the whole of how this tells the two apart
/// without needing its own delimiter.
fn interface_bytes(section: &str) -> Option<(u64, u64)> {
    let mut receive = 0u64;
    let mut transmit = 0u64;
    let mut found = false;

    for line in section.lines() {
        let Some((name, rest)) = line.split_once(':') else {
            continue;
        };
        if name.trim().is_empty() || name.trim() == "lo" {
            continue;
        }

        let fields: Vec<u64> = rest
            .split_whitespace()
            .filter_map(|field| field.parse().ok())
            .collect();
        /* Receive: bytes packets errs drop fifo frame compressed multicast,
        then Transmit's own bytes as the ninth field. Fewer than that is not
        a line this kernel meant as an interface's own. */
        let (Some(&receive_bytes), Some(&transmit_bytes)) = (fields.first(), fields.get(8)) else {
            continue;
        };

        receive = receive.saturating_add(receive_bytes);
        transmit = transmit.saturating_add(transmit_bytes);
        found = true;
    }

    found.then_some((receive, transmit))
}

fn network_rate(before: &str, after: &str, elapsed_seconds: f64) -> Option<NetworkRate> {
    let (receive_before, transmit_before) = interface_bytes(before)?;
    let (receive_after, transmit_after) = interface_bytes(after)?;

    let receive_delta = receive_after.checked_sub(receive_before)?;
    let transmit_delta = transmit_after.checked_sub(transmit_before)?;

    Some(NetworkRate {
        receive_bytes_per_sec: receive_delta as f64 / elapsed_seconds,
        transmit_bytes_per_sec: transmit_delta as f64 / elapsed_seconds,
    })
}

/// One `/proc/diskstats` section's own device name to (sectors read,
/// sectors written), keyed by name so [`disk_io_rate`] can pair a device
/// between the before and after samples even if the kernel printed them in
/// a different order the second time.
///
/// A diskstats line is `major minor name <11 counters>`; `major` and
/// `minor` are always plain integers, which is what tells this line apart
/// from `/proc/stat`'s own (opens with a word) and `/proc/net/dev`'s own
/// (opens with `name:`, and a colon never parses as an integer) sharing the
/// same section (see [`command`]'s own doc comment). Sector counts are
/// fields 3 and 7 after the name, 1-indexed: reads completed, reads merged,
/// *sectors read*, ms reading, writes completed, writes merged, *sectors
/// written*, ms writing, ios in progress, ms doing io, weighted ms.
fn disk_stats(section: &str) -> HashMap<String, (u64, u64)> {
    let mut result = HashMap::new();

    for line in section.lines() {
        let fields: Vec<&str> = line.split_whitespace().collect();
        if fields.len() < 10
            || fields[0].parse::<u32>().is_err()
            || fields[1].parse::<u32>().is_err()
        {
            continue;
        }

        let (Ok(sectors_read), Ok(sectors_written)) = (fields[5].parse(), fields[9].parse()) else {
            continue;
        };

        result.insert(fields[2].to_owned(), (sectors_read, sectors_written));
    }

    result
}

/// Bytes moved across every disk that is not a partition, summed rather
/// than kept per device (see [`DiskIoRate`]'s own doc comment). A device
/// missing from either sample, or from `partitions`' own parse, is simply
/// not counted rather than failing the whole reading: a disk that appeared
/// or vanished between the two samples (unlikely, but not impossible on a
/// host with hot-pluggable storage) contributes nothing rather than a
/// bogus delta against a counter that was never actually read twice.
fn disk_io_rate(
    before: &str,
    after: &str,
    partitions: &str,
    elapsed_seconds: f64,
) -> Option<DiskIoRate> {
    let before = disk_stats(before);
    let after = disk_stats(after);
    if before.is_empty() || after.is_empty() {
        return None;
    }

    let excluded: HashSet<&str> = partitions
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();

    let mut read_sectors = 0u64;
    let mut write_sectors = 0u64;
    for (name, &(read_after, write_after)) in &after {
        if excluded.contains(name.as_str()) {
            continue;
        }
        let Some(&(read_before, write_before)) = before.get(name) else {
            continue;
        };

        read_sectors = read_sectors.saturating_add(read_after.saturating_sub(read_before));
        write_sectors = write_sectors.saturating_add(write_after.saturating_sub(write_before));
    }

    /* Every kernel that has published this file counts in 512-byte
    sectors, regardless of the device's own physical block size. */
    const SECTOR_BYTES: f64 = 512.0;

    Some(DiskIoRate {
        read_bytes_per_sec: read_sectors as f64 * SECTOR_BYTES / elapsed_seconds,
        write_bytes_per_sec: write_sectors as f64 * SECTOR_BYTES / elapsed_seconds,
    })
}

/// `/proc/loadavg`'s first three fields: `0.42 0.35 0.30 2/456 12345`. The
/// last two (running/total processes, and the most recently created pid) are
/// not read here; nothing in this module needs them.
fn load_average(loadavg: &str) -> Option<LoadAverage> {
    let mut fields = loadavg.split_whitespace();
    let one = fields.next()?.parse().ok()?;
    let five = fields.next()?.parse().ok()?;
    let fifteen = fields.next()?.parse().ok()?;

    Some(LoadAverage { one, five, fifteen })
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

    /// A real `/proc/net/dev`'s own shape: two header lines with no colon,
    /// then one line per interface. `lo` carries obviously-wrong numbers on
    /// purpose, so a test that accidentally counted it would fail loudly.
    const NET_BEFORE: &str = "Inter-|   Receive                                                |  Transmit\n \
                               face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed\n\
                                  lo: 999999   10    0    0    0     0          0         0  999999   10    0    0    0     0       0          0\n\
                                eth0: 5000   50    0    0    0     0          0         0  2000   20    0    0    0     0       0          0\n";
    const NET_AFTER: &str = "Inter-|   Receive                                                |  Transmit\n \
                              face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed\n\
                                 lo: 999999   10    0    0    0     0          0         0  999999   10    0    0    0     0       0          0\n\
                               eth0: 5500   55    0    0    0     0          0         0  2300   23    0    0    0     0       0          0\n";

    const MEMINFO: &str = "MemTotal:       16000000 kB\nMemFree:         2000000 kB\n\
                            MemAvailable:    8000000 kB\nBuffers:          500000 kB\n\
                            SwapTotal:       4000000 kB\nSwapFree:        1500000 kB\n";

    const DF: &str = "Filesystem            Type   1024-blocks     Used Available Capacity Mounted on\n\
                       /dev/mapper/vg0-root  ext4     103080160 42123456  56000000      43% /\n\
                       tmpfs                 tmpfs      2000000        0   2000000       0% /dev/shm\n\
                       proc                  proc             0        0         0       0% /proc\n";

    const UPTIME: &str = "123456.78 987654.32\n";

    const LOADAVG: &str = "0.42 0.35 0.30 2/456 12345\n";

    /// A whole disk (`sda`) and its own partition (`sda1`), so the fixture
    /// can prove exclusion rather than assume it: `sda1` advances by 400
    /// sectors read and 200 written, and must contribute none of that once
    /// `PARTITIONS` below names it.
    const DISK_BEFORE: &str = "   8       0 sda 100 0 2000 10 50 0 1000 5 0 20 15\n\
                                8       1 sda1 40 0 800 4 20 0 400 2 0 8 6\n";
    const DISK_AFTER: &str = "   8       0 sda 150 0 3000 15 80 0 1600 8 0 30 25\n\
                               8       1 sda1 60 0 1200 6 30 0 600 3 0 12 9\n";

    const PARTITIONS: &str = "sda1\n";

    /// Builds the same shape [`command`]'s real stdout has, `echo`'s own
    /// newline included: a `\n` lands right after every marker, which is
    /// what makes the section *after* each one start with a blank line.
    /// Omitting that here is exactly what let `disk_usage`'s off-by-one bug
    /// (real `df` output read as its own header) pass this module's tests
    /// while failing against a real host.
    fn combined() -> Vec<u8> {
        format!(
            "{STAT_BEFORE}{NET_BEFORE}{DISK_BEFORE}{SECTION_MARKER}\n{STAT_AFTER}{NET_AFTER}{DISK_AFTER}{SECTION_MARKER}\n{MEMINFO}{SECTION_MARKER}\n{DF}{SECTION_MARKER}\n{UPTIME}{SECTION_MARKER}\n{LOADAVG}{SECTION_MARKER}\n{PARTITIONS}"
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
            stats.swap,
            Some(Usage {
                used_kb: 2_500_000,
                total_kb: 4_000_000
            })
        );
        assert_eq!(
            stats.disk,
            Some(Usage {
                used_kb: 42_123_456,
                total_kb: 103_080_160
            })
        );
        assert_eq!(
            stats.filesystems,
            vec![
                Filesystem {
                    mount: "/".to_owned(),
                    usage: Usage {
                        used_kb: 42_123_456,
                        total_kb: 103_080_160
                    }
                },
                Filesystem {
                    mount: "/dev/shm".to_owned(),
                    usage: Usage {
                        used_kb: 0,
                        total_kb: 2_000_000
                    }
                },
            ],
            "proc is a pseudo-filesystem and must not appear"
        );
        /* eth0 advances 500 bytes received and 300 sent over the command's
        one-second sample window; lo's own, much larger numbers must not be
        counted at all. */
        assert_eq!(
            stats.network,
            Some(NetworkRate {
                receive_bytes_per_sec: 500.0,
                transmit_bytes_per_sec: 300.0,
            })
        );
        /* sda alone: 1000 sectors read, 600 written; sda1's own 400/200 are
        excluded by PARTITIONS and must not be added on top. */
        assert_eq!(
            stats.disk_io,
            Some(DiskIoRate {
                read_bytes_per_sec: 512_000.0,
                write_bytes_per_sec: 307_200.0,
            })
        );
        assert_eq!(stats.uptime_seconds, Some(123_456));
        assert_eq!(
            stats.load_average,
            Some(LoadAverage {
                one: 0.42,
                five: 0.35,
                fifteen: 0.30,
            })
        );
    }

    #[test]
    fn a_load_average_missing_a_field_is_left_unknown_rather_than_partial() {
        assert_eq!(load_average("0.42 0.35\n"), None);
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
    fn no_swap_configured_reports_a_real_zero_not_unknown() {
        let meminfo = "MemTotal:  16000000 kB\nSwapTotal: 0 kB\nSwapFree: 0 kB\n";
        assert_eq!(
            swap(meminfo),
            Some(Usage {
                used_kb: 0,
                total_kb: 0
            })
        );
    }

    #[test]
    fn a_missing_section_leaves_only_its_own_field_unknown() {
        let partial = format!("{STAT_BEFORE}{SECTION_MARKER}{STAT_AFTER}{SECTION_MARKER}garbage");
        let stats = parse(partial.as_bytes());

        assert_eq!(stats.cpu_percent, Some(30.0));
        assert_eq!(stats.memory, None);
        assert_eq!(stats.swap, None);
        assert_eq!(stats.disk, None);
        assert_eq!(stats.filesystems, Vec::new());
        assert_eq!(stats.network, None);
        assert_eq!(stats.disk_io, None);
        assert_eq!(stats.uptime_seconds, None);
        assert_eq!(stats.load_average, None);
    }

    #[test]
    fn a_partitions_own_io_is_not_added_on_top_of_its_disk() {
        assert_eq!(
            disk_io_rate(DISK_BEFORE, DISK_AFTER, PARTITIONS, 1.0),
            Some(DiskIoRate {
                read_bytes_per_sec: 512_000.0,
                write_bytes_per_sec: 307_200.0,
            })
        );
    }

    #[test]
    fn with_no_partitions_named_every_device_counts() {
        /* sda's own 1000/600 plus sda1's own 400/200, since nothing here
        says sda1 is a partition of sda: 1400 sectors read, 800 written.
        This is the double-counting Option C in the proposal rejected: a
        host that never gets a partition list back reports roughly what a
        partitioned disk's total already covers twice over. */
        assert_eq!(
            disk_io_rate(DISK_BEFORE, DISK_AFTER, "", 1.0),
            Some(DiskIoRate {
                read_bytes_per_sec: 716_800.0,
                write_bytes_per_sec: 409_600.0,
            })
        );
    }

    #[test]
    fn no_recognizable_diskstats_line_reports_no_disk_io() {
        assert_eq!(
            disk_io_rate("not diskstats", "not diskstats", "", 1.0),
            None
        );
    }

    #[test]
    fn disk_stats_ignores_lines_that_are_not_its_own_shape() {
        /* A `/proc/stat` line opens with a word, and a `/proc/net/dev`
        interface line's first token carries a colon: neither parses as
        the plain integer a diskstats line's major number always is. */
        let mixed = "cpu 1 2 3 4\neth0: 5 6 7 8\n   8       0 sda 1 2 3 4 5 6 7 8 9 10 11\n";
        assert_eq!(
            disk_stats(mixed),
            HashMap::from([("sda".to_owned(), (3, 7))])
        );
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
                swap: Some(Usage {
                    used_kb: 0,
                    total_kb: 4_000_000
                }),
                disk: None,
                filesystems: vec![Filesystem {
                    mount: "/".to_owned(),
                    usage: Usage {
                        used_kb: 1,
                        total_kb: 2
                    }
                }],
                network: Some(NetworkRate {
                    receive_bytes_per_sec: 500.0,
                    transmit_bytes_per_sec: 300.0,
                }),
                disk_io: Some(DiskIoRate {
                    read_bytes_per_sec: 1000.0,
                    write_bytes_per_sec: 2000.0,
                }),
                uptime_seconds: Some(60),
                load_average: Some(LoadAverage {
                    one: 0.1,
                    five: 0.2,
                    fifteen: 0.3,
                }),
            })
            .expect("serializes"),
            r#"{"cpuPercent":12.5,"memory":{"usedKb":100,"totalKb":200},"swap":{"usedKb":0,"totalKb":4000000},"disk":null,"filesystems":[{"mount":"/","usage":{"usedKb":1,"totalKb":2}}],"network":{"receiveBytesPerSec":500.0,"transmitBytesPerSec":300.0},"diskIo":{"readBytesPerSec":1000.0,"writeBytesPerSec":2000.0},"uptimeSeconds":60,"loadAverage":{"one":0.1,"five":0.2,"fifteen":0.3}}"#
        );
    }

    #[test]
    fn a_pseudo_filesystem_is_excluded_but_tmpfs_and_overlay_are_kept() {
        let df = "Filesystem   Type      1024-blocks Used Available Capacity Mounted on\n\
                   overlay      overlay      10000000 5000000   5000000      50% /\n\
                   tmpfs        tmpfs          100000       0    100000       0% /dev/shm\n\
                   proc         proc                 0       0         0       0% /proc\n\
                   cgroup2      cgroup2              0       0         0       0% /sys/fs/cgroup\n";

        let found = filesystems(df);

        assert_eq!(found.len(), 2, "found: {found:?}");
        assert!(found.iter().any(|filesystem| filesystem.mount == "/"));
        assert!(found
            .iter()
            .any(|filesystem| filesystem.mount == "/dev/shm"));
    }

    #[test]
    fn a_host_with_no_recognizable_filesystem_line_reports_an_empty_list() {
        assert_eq!(filesystems("df: command not found\n"), Vec::new());
    }

    #[test]
    fn loopback_never_counts_towards_the_network_rate() {
        let before = "lo: 1000 1 0 0 0 0 0 0 1000 1 0 0 0 0 0 0\n";
        let after = "lo: 999999999 1 0 0 0 0 0 0 999999999 1 0 0 0 0 0 0\n";

        assert_eq!(network_rate(before, after, 1.0), None);
    }

    #[test]
    fn a_counter_that_goes_backwards_is_left_unknown_rather_than_huge() {
        /* An interface that was reset between samples (a link flap, a
        driver reload) must not report the wrap as a burst of traffic. */
        let before = "eth0: 5000 1 0 0 0 0 0 0 2000 1 0 0 0 0 0 0\n";
        let after = "eth0: 100 1 0 0 0 0 0 0 2000 1 0 0 0 0 0 0\n";

        assert_eq!(network_rate(before, after, 1.0), None);
    }
}
