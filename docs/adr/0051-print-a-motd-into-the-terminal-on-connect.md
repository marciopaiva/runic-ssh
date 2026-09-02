# ADR-0051: Print a MOTD into the terminal on connect

* **Status**: Accepted
* **Date**: 2026-09-01

## Context

The Sessions empty state already carries the brand mark (ADR from the
v0.3.0 MOTD work: a decorative wordmark shown where nothing is open yet).
The maintainer asked for a second one, in a place that is not empty at
all: printed directly into `xterm.js` the moment a shell connects, the
way a real SSH `/etc/motd` shows a banner at login, with the ASCII art of
the brand mark, the host being connected to, and whether it is reached
through a jump host.

**The injection point already exists, and it cannot race a real MOTD.**
`use-terminal.ts` opens the terminal (`terminal.open(container)`) well
before anything remote can reach it: `watchTerminal`, the subscription
that receives bytes at all, and `openTerminal`, the call that asks the
Rust side for a shell in the first place, both happen later in the same
function. A write placed between `terminal.open` and `watchTerminal`
always lands first, so it can never interleave with a host's own real
`/etc/motd` arriving over the same channel.

**This never needs its own "have I shown this" bookkeeping.** ADR-0014
keeps one `TerminalView` mounted per connected session for as long as
that session exists; the effect that would print a MOTD only ever runs
once per real (re)connection, the same lifetime a mount already has.
Opening ten tabs to the same host prints it ten times, once per shell;
switching between already-open tabs prints it zero times, because
nothing remounts. This is the frequency a MOTD already has on a real
server, not a new rule invented for this one.

**The art**: the maintainer's own conversion of the brand mark through
asciiart.eu's image-to-ascii tool, using `≈` for the shaded body of the
two overlapping circles and `∞`/`≠` for the brighter points where the
tool's own conversion marks the rune crossing them. Recorded verbatim in
`design/canvas/gen.py`'s `MOTD_ART` (not re-derived from the mark's SVG
paths, since the shading technique has no equivalent in path data) so a
future resize starts from the same source image and tool.

**What is available without a new IPC command**: `App.tsx` already
computes `paneLabels` (a `sessionId → groupLabel(session)` map) for every
open session from data it already holds in full (`Session`: host, port,
username). `src/features/sessions/jump.ts`'s `bastionName(session,
sessions)` already answers "which saved host, if any, does this one ride
through," the same lookup `SessionsSidebar`'s own "via" row already uses.
Nothing here needs a value resolved fresh from the server (no DNS lookup,
no round trip): everything printed is what the maintainer already
configured.

Drawn in `design/canvas/TerminalMotdProposal.dc.html`, iterated live
against two things the maintainer asked to change after the first cut:
an art-above-fields-below layout became art-left-fields-right, and a
"Via" row was added for a jump host.

## Options considered

### Option A: Always stacked

Art above, host fields below, both left-aligned, regardless of how wide
the terminal is. One layout, no threshold to get wrong.

**Cost**: none technically. **Forecloses**: the side-by-side layout the
maintainer asked for once the art was actually drawn and reacted to,
which reads closer to what a MOTD banner conventionally looks like
(`neofetch`, `screenfetch`) than a stacked one does.

### Option B: Side by side above a column threshold, stacked below it

The art (49 columns wide) sits to the left of "Runic SSH" and the host
fields when the terminal is wide enough for both; narrower than that, it
falls back to Option A's stacked layout. `terminal.cols` is already read
a few lines below where the MOTD would be written (`use-terminal.ts`),
so the threshold check costs nothing new to know.

**Cost**: two layouts to keep in sync instead of one, and a threshold
column count to pick and justify. **Forecloses**: nothing; Option A is
what a narrow terminal already falls back to.

### Option C: Side by side only, no fallback

Same layout as B, but drawn regardless of width: a narrow terminal wraps
or truncates whatever does not fit.

**Cost**: a wrapped ASCII banner is not a smaller version of the banner,
it is a broken one: the art's own vertical strokes and the crossing
points would land in the wrong rows once a line wraps. **Forecloses**:
nothing technically, but this is the shape most likely to be reported as
a rendering bug on a normal-sized, non-maximized window.

## Decision

Option B, and two further decisions made directly rather than assumed:

**Printed on every connection, not once.** As Context above already
argues, this is already bounded by how long a `TerminalView` stays
mounted (ADR-0014); nothing further gates it, and no setting exists yet
to turn it off. If it ever proves noisy in real use, that is its own
follow-up ADR, not a toggle built ahead of the complaint.

**Coloured with the terminal's own existing ANSI palette, not truecolor.**
`terminalTheme()` (`src/features/terminal/theme.ts`) already maps
`--rs-accent`/`--rs-accent-bright` to blue/cyan and `--rs-brand-end` to
magenta in xterm.js's own 16-colour `ITheme`. Writing the art with plain
SGR codes for those three slots, rather than `\x1b[38;2;r;g;bm` truecolor
literals, means xterm.js re-renders already-printed MOTD text in the new
palette the instant the theme changes, for free; a truecolor write would
bake in whatever the theme happened to be at connect time and stay wrong
after a toggle.

## Consequences

**Good**: the brand identity reaches the surface a person actually stares
at most (the terminal itself, not only an empty state), using data the
app already has, no new IPC command, no new Tauri capability, no new
runtime dependency. The pure part (which lines to print, for a given
session and jump-role) is a plain function of already-typed inputs, the
same "logic lives in the feature slice, not the component" split section
6 asks for everywhere else, and is testable without a live `xterm.js`.

**Bad**: `≈`/`∞`/`≠` are not guaranteed to sit in JetBrains Mono itself;
a real terminal may render them through a font fallback with different
metrics than the monospace grid around them, which is exactly the
doubled-line-spacing artifact this ADR's own canvas mockup hit once
already. That one was a markup bug, not a font one, but the mockup
cannot prove the real font renders these three characters at a clean
single-row height; that has to be checked live, in the packaged app, not
assumed from the canvas. A terminal narrower than Option B's own stacked
fallback (49 columns) still overflows; nothing here guards that
extreme, and it is named rather than silently ignored.

**Follow-up**: implementation is Phase 4, not yet done. It touches
`src/features/terminal/motd.ts` (new: the pure line-building function,
given a `Session`, the full session list, and the terminal's column
count), `src/features/terminal/use-terminal.ts` (the write, between
`terminal.open` and `watchTerminal`), `src/components/TerminalView.tsx`
and `src/App.tsx` (threading host/port/user/via down, the same way
`paneLabels` already threads an identity string), and `src/locales/*.json`
(new keys for the "Host"/"Address"/"Via"/"User" labels, `en.json` first).
`design/canvas/gen.py`'s `build_terminal_motd_proposal` and
`TerminalMotdProposal.dc.html` get promoted into `canvas.json` once the
implementation matches the artboard, the same way ADR-0048 promoted
`SftpFileOps.dc.html`.
