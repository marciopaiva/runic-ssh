# ADR-0014: Mount a terminal per session, and refuse a second shell on a handle

* **Status**: Accepted
* **Date**: 2026-08-23

## Context

Switching between two connected tabs did not switch terminals. It opened a new
shell on the host and abandoned the previous one, still running (#94).

Two independent decisions produced it, neither wrong on its own:

* `use-terminal.ts` keys its effect on `[container, handle]`. One terminal is
  mounted at a time, for the active handle, so switching tabs changes `handle`,
  the cleanup runs, and `terminal.dispose()` destroys the xterm instance along
  with its scrollback.
* `open_terminal` calls `open_shell` unconditionally. There is no "does this
  handle already have a shell?", so the remount opens a second one. The
  `attach_input` that follows replaces the input sender, and the previous
  `pump` keeps running against a channel nobody reads.

Measured against the test fixture, four round trips between two tabs left nine
shells and nine ptys alive for two sessions — one more per switch. It stops
when the server refuses, and OpenSSH's default `MaxSessions` is 10, so a
session becomes unable to open a shell after roughly ten tab switches.

What the user reports is the scrollback. The leak underneath it is why this is
a defect rather than a polish item.

Relevant to the choice: `docs/architecture.md` says every value crossing into
the core is validated on the Rust side regardless of what the frontend claims
to have checked. And `Registry::Entry` already carries `input: Option<Sender>`,
set when a shell attaches — the fact needed to answer the question was already
in the map, only never consulted.

## Options considered

### Option A: keep one terminal mounted per session

Render a terminal for every connected session and show only the active one.
Each instance keeps a stable `handle`, so the effect never re-runs, the xterm
instance is never disposed, and `open_terminal` is called once per session.

Costs N live xterm instances, bounded by the number of open sessions. Hiding
them is the detail that decides whether this works: an element hidden with
`display: none` measures zero, which would make `FitAddon` compute a garbage
grid and the `ResizeObserver` report `0x0` to the remote pty.

Leaves the core still willing to open unbounded shells for any caller that
asks.

### Option B: make `open_terminal` idempotent

Refuse to open a second shell on a handle that already has one. Small, and it
is an invariant the core should hold regardless of how the frontend is written.

Does not fix the scrollback. The xterm is still destroyed and rebuilt on every
switch; the user gets an empty terminal attached to the right shell, with the
working directory and environment intact. Better than the current behaviour and
still wrong.

## Decision

Both. Accepted on 2026-08-23.

They repair different things, which is why neither alone was enough. Option A
fixes what the user experiences. Option B makes "one shell per handle" a
property of the core rather than a consequence of how the webview happens to be
written today — the frontend is our own code, but that is exactly the
assumption `architecture.md` refuses to build on.

Inactive terminals are hidden with `visibility: hidden` rather than
`display: none`. A `visibility: hidden` element keeps its dimensions, so
`FitAddon` and the `ResizeObserver` go on measuring the real size and a window
resize while a tab is hidden still reaches its remote pty correctly. This is
the detail that makes Option A cheap instead of fiddly.

A repeat `open_terminal` returns `terminalAlreadyOpen` rather than succeeding
quietly. With Option A in place it is unreachable in correct operation, so a
silent success would hide a defect instead of reporting one. It falls through
to the interface's generic failure copy on purpose: the user should never see
it, and inventing dedicated copy for a programming error would imply otherwise.

The tradeoff accepted: the main area now holds a stack of absolutely positioned
terminals instead of one element, so its layout is harder to reason about by
reading the markup, and a mistake there is invisible until someone switches
tabs.

## Consequences

**Good**: scrollback, working directory and shell state survive a tab switch,
because the shell and the terminal both survive it. The shell and pty leak is
gone, and with it the ceiling that made a session stop working after roughly
ten switches. A `ConnectionFailure` no longer destroys the terminal of whatever
session happened to be active.

**Bad**: every connected session holds a live xterm instance and its
scrollback buffer — bounded by `scrollback: 5000` per session, but no longer
one buffer at a time. Hidden terminals still run their `ResizeObserver` and
still receive output, so a noisy background session costs work while nobody is
looking at it. The rate bound in `pump` is what keeps that affordable, and it
is now load-bearing for more than one session at a time.

**Bad, specifically**: `visibility: hidden` is doing real work here and looks
like a cosmetic choice. Someone tidying it into `display: none` or `hidden`
would reintroduce the `0x0` resize with no visible symptom until a user resizes
the window with a background tab open.

**Follow-up**: a `ConnectionFailure` is still drawn over the whole main area
rather than scoped to the session that failed, because a failed session has no
tab to scope it to. That is untouched here and worth its own decision. Whether
output from an abandoned shell could reach a live terminal was never
established — with this change no shell is abandoned, so the question is moot
for the path that created it, but the two pumps emitting on one handle was
never proven impossible by any other route.
