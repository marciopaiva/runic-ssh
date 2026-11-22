# Fleet run limits, measured

ADR-0078 set 64 KiB per stream and 30 seconds per host, and called both guesses.
This records what was measured against the OpenSSH fixtures on 2026-11-22
(`measure_what_a_fleet_run_costs_on_real_sshd` in `src-tauri/tests/against_openssh.rs`,
ignored by default, prints and asserts nothing). The four containers are a
minimal Alpine on loopback: a floor for sizes and a ceiling for speed, not a
picture of a real fleet.

## What was measured

| What | Result |
| --- | --- |
| One trivial exec on a warm connection, 30 runs | median **44 ms**, min 5 ms |
| The same after `nodelay` (below) | median **1.6 ms**, min 1.5 ms |
| 16 KiB, 64 KiB, 256 KiB of output | 2.6 ms, 2.6 ms, 4.2 ms |
| 1 MiB, 4 MiB of output | 9 ms, 27 ms |
| Four hosts, one command each, concurrently | 2.5 ms |
| `ps aux`, `df -h`, `env` | 234, 1220, 254 bytes |
| `ls -lR /etc`, `ls -lR /usr` | 11, 23 KiB |
| `cat /proc/cpuinfo`, `dmesg` | 33, 35 KiB |

## What it found

**The 44 ms was Nagle and delayed acknowledgement.** The client never set
`TCP_NODELAY`, so each small request waited on the kernel's delayed ACK. Setting
`nodelay` in the connection config took the median exec from 44 ms to 1.6 ms.
It is not specific to fleet runs: every keystroke and every request of every
session was paying the same wait, and OpenSSH avoids it for interactive use
the same way. This is a change to every connection, so it is worth a look on a
real network too (the loopback figure is the extreme case).

**Time is not what the 64 KiB cap protects.** Four megabytes crossed in 27 ms
on loopback. On a real link the transfer would take longer, but the cap is
about what the webview has to hold and draw: a run sends every host's streams
across IPC without sharing identical ones, so 64 hosts at the cap is at most
8 MiB of text (64 x 2 x 64 KiB), where 256 KiB would be 32 MiB.

**The cap does cut ordinary diagnostics on a real host.** `cpuinfo` and `dmesg`
are already 33 and 35 KiB on a two-core container. On a 64-core machine
`cpuinfo` is several hundred KiB, `dmesg` and `dpkg -l` routinely pass 64 KiB.
That is what the `truncated` flag is for, and the dialog says so. A fleet run
compares answers; it is not a way to page through a log.

## Decision

Kept: 64 KiB per stream and 30 s per host. Nothing here supports changing
either, and the one number that would (a real network) cannot be measured from
loopback. Revisit with a measurement from an actual remote host, or if people
report truncation on commands they meant to compare.

Not covered: a command that legitimately runs longer than 30 s (nothing in the
fixtures does), and the real application window with a macro. The pt-BR and es
copy of `fleet.*` still needs a native reviewer (#470).
