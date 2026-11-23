# Plan: Spaces, a Stage and a Bar

Written on 2026-11-23. It carries out ADR-0081 and replaces the three
directions in `docs/plans/ui-review.md` with the one the maintainer chose. The
general rules in that document (the interface review's own rules, the
motion rules, the quality bar) still apply and are not repeated here, except
where Spaces adds to them. This is a plan, not a decision record: slice 3 gets
its own ADR before code, and every screen is built in the application and
reviewed by running it.

## The idea in one paragraph

You work in a **Space**, an environment such as Production, Staging or Lab. On
the **Stage**, a host's terminal, files and monitor sit side by side, and the
sessions you want alive but not in front of you rest on a shelf. A **Bar**
commands everything: `@` picks hosts, `>` runs a saved macro, `/` opens files,
and the scope is always shown as chips. Each Space opens on its **Hall**, a
plate per host with its state. Each host keeps a **Logbook** of what happened to
it, on this machine only.

## What it replaces, and what it does not

Replaces: the tab strip, the groups and splits as the way to hold sessions, and
the separation of SSH and SFTP into workspaces, in slice 3. The empty Home, in
slice 2. The command palette's current shape, in slice 1.

Does not change: `sessions.json` beyond one optional field, the credential
model, host key verification and its screens, the IPC contract for terminal,
SFTP and Monitor, the capabilities, macros and their two types, the reconnect
flow, the fleet run's rule that the frontend never sends a string it composed,
and the visual direction (palette, Manrope, JetBrains Mono, the sigil).

## The pieces

### Space

A name, an order and a weight (`normal` or `production`). A host has at most one
Space. A host reached through a jump host in another Space is allowed: the
chain is a property of the host, not of the Space. A Space holds the open
sessions of its hosts, its macros' scope and its layout. Switching is
instant with the keyboard (`Ctrl+1` to `9`) and through a popover with the
mouse, and sessions stay alive in the Spaces you leave.

**Production weight.** A band under the title bar, a shield glyph and the word
"Production" in the Space chip and the status bar. Sending a command to two or
more hosts in a production Space needs a confirmation by holding the button
for about 800ms. The single-host terminal is not slowed. This prevents a
slip; it is not a security control, and the documentation says so.

### The Bar

One field, summoned with `Ctrl+K` and open in the title row. It replaces the
command palette and keeps its registry.

| Token | Meaning | Becomes |
| --- | --- | --- |
| `@name` | pick hosts, by name, group or Space | a scope chip |
| `>` | choose a saved macro | runs on the scope, after the target list is shown |
| `/` | open files | the files of the scoped host |
| no token | verbs and hosts together, recent first | the first match opens |

The right side shows the host under the cursor: key, credential, topology,
multiplexer and its last Logbook event. Every row shows its shortcut. `>`
never takes free text: it chooses a saved macro, which keeps the rule
ADR-0078 set. The tokens are not translated.

### The Hall

The first screen of a Space. A plate per host: the sigil (lit when connected,
faint when saved, struck when dropped), name and `user@host`, the state as a
glyph and a word, the latency, and a small sparkline. Arrow keys move, `Enter`
opens the terminal, `F` the files, `M` the monitor. With no hosts, one card:
"Add your first host" and "Open a local shell".

**The last line.** A plate can show the last line of the host's output. That is
host output outside a terminal, and ADR-0032 rests on nothing rendering a
host's output while a credential field is on screen. It ships only after a
review: sanitised plain text, bounded in length, hidden while a credential
field is open, with a test that fails if it is not. Slice 2 ships without it.

### The Stage

Tiles, not tabs. A host's terminal is the main tile. Files and Monitor are
tiles of the same host and sit beside it. A tile can be split, closed, resized
and moved. Dragging a file from one tile to another is a transfer. The shelf
at the bottom holds sessions that are alive and not on screen, as sigils with a
state glyph; a click brings one back without reconnecting.

**Casting.** Several terminal tiles can be armed to receive what is typed. The
armed set is shown as chips in the Bar and a mark on each tile.

**Credentials.** Asking for a credential is a step that takes the whole Stage,
with no terminal tile mounted. It keeps ADR-0032's premise and the guard test.

### The Logbook

Per host, local, bounded, append-only. Events: connected (with the host key
fingerprint that was checked), dropped, reconnecting, reconnected, macro run
(name and exit status), transfer (name, size, direction), host key changed.
Never keystrokes, host output or secrets. A golden test pins the allowed fields
so a new event cannot carry more by accident. Bounded to a fixed number of
events and bytes per host, oldest dropped first. A view with filters and a
search, and "clear this host's Logbook".

## Motion and interaction

The general rules are in `ui-review.md`. What Spaces adds, from a review against
Emil Kowalski's design-engineering rules:

| Where | What | Why |
| --- | --- | --- |
| The Bar | No animation at all: it opens, filters, moves the selection and updates the preview at once | The most repeated action in the application |
| Switching Space | Instant by keyboard. The mouse popover scales from `0.97` with opacity, 150ms, from its button. The content swaps with no crossfade | Done dozens of times a day |
| Production band | Reveals with `clip-path`, 200ms ease-out in, 120ms out | A state, not a show; leaving is faster than entering |
| The Hall | No entrance animation. Plate actions fade in on hover only, 120ms, `hover: hover` and `pointer: fine` | The first screen opens often |
| Plate data | Text and sparkline update without animation, at most once a second. The state glyph swaps with a 150ms fade and `blur(2px)` | A functional graph does not animate, and every server change would make the plate shake |
| Tiles | Geometry changes at once. A new tile fades in over 120ms. Dragging a border follows the pointer, with pointer capture and one xterm refit per frame | Animating width or height would refit the terminal and resize the remote pty on every frame |
| The shelf | Parking moves the tile header to its chip with `transform` and `opacity`, 200ms ease-in-out, and un-parking reverses it | The motion tells you where the session went |
| Casting | The armed border changes colour in 100ms. On `Enter`, each target pulses once for 200ms. Never on each key | It confirms the command left without flashing per letter |
| Casting in production | Hold to confirm: a linear `clip-path` fill over about 800ms, released in 200ms ease-out | Slow where a person decides, fast where the system answers |
| The Logbook | A live event enters with opacity and a short offset, 200ms, only while the view is open. Loading history is instant | A live event deserves notice, a loaded batch does not |
| The sigil | Cut on connect: 240ms, 30ms between strokes, on the focused session only. A drop is instant. The reconnecting glyph turns linearly, one turn a second | The one flourish, rare enough to afford |
| Reduced motion | Movement, scale and turning go. Opacity and colour fades stay | Reduced is not none |

Keyboard-triggered actions never animate: `Ctrl+K`, `Ctrl+1` to `9`, arrows in
the Hall, moving focus between tiles. The focus ring moves without gliding.

## Data

| Change | Where | Compatibility |
| --- | --- | --- |
| `space` on a host | optional field in `sessions.json` | additive, a missing field is the default Space |
| Space definitions | new `spaces.json` (name, weight, order) | new file, no migration |
| Logbook | new directory, one bounded file per host | new, no migration |
| Last line per session | the core keeps one short sanitised line, in memory only | after its review, and not persisted |

Existing `group` values can be offered as Spaces once, on the maintainer's
confirmation. Nothing converts silently.

## Slices

| Slice | What | Ends when |
| --- | --- | --- |
| 0 | Remove the map (ADR-0080), in three pull requests | ADR-0080 accepted and merged |
| 1 | **The Bar.** The palette becomes the Bar: scope chips, `@`, `>`, `/`, shortcuts shown, recents first. No layout change | the six core tasks complete with no pointer |
| 2 | **Spaces and the Hall.** `space` and `spaces.json`, the switcher, the Hall in place of Home, the production weight and the cast guard, the one-time offer to turn groups into Spaces. No last line yet | a person can tell Production from Lab at a glance, and a broadcast to two hosts in Production asks |
| 3 | **The Stage.** Its own ADR first (ADR-0082, Proposed, with three options and a recommendation, waiting for the maintainer). Tiling, the shelf, casting, the credential step, replacing the tab strip, groups and the SSH and SFTP split | the maintainer has used slices 1 and 2 for a week and says go |
| 4 | **The Logbook.** Store, recorder in the core, IPC to read and clear, the view. Can ship before slice 3 | the golden test pins the fields, and a drop and reconnect show up in the view |

Each slice has its own tests, a screenshot of each screen in both themes in the
pull request, and the quality bar from `ui-review.md`. The fallback if slice 3
proves too costly is slices 1, 2 and 4 on the existing shell, which are worth
shipping on their own.

## Slice 1, as built

Decided with the maintainer on 2026-11-23, after reading the palette:

* The palette was only the host picker behind the "+" button, with no global
  shortcut and no actions. Slice 1 therefore adds the action, macro and files
  sources, not only the grammar.
* **Shortcut:** `Ctrl+Shift+P`, and `Cmd+K` on a Mac. Plain `Ctrl+K` is left
  alone: it is kill-line in readline and a command in nano and emacs.
* **Recents** live in memory for the window's life. Nothing is written to disk.
* **Scope** lives only while the Bar is open, so a chip is never left standing
  where it is not on screen.
* The Bar stays a modal. Moving it into the title row is part of slice 3.
* The footer shows what is saved about the highlighted host (address, whether a
  login is saved, a jump host). The last Logbook event waits for slice 4, and
  the per-row shortcut for the shortcuts that exist.

## Slice 4, as built

Taken on 2026-11-23 with the plan's suggestions, the maintainer not having
answered the open questions: 500 events and 64 KiB per host, recorded by
default, local only. Revisit if either bound or the default is wrong.

* The core writes `connected` (at the login, not the connect), `hostKeyTrusted`
  (with `replaced`) and `macroRun` (through the fleet run). The interface
  reports a drop and each reconnect attempt, through a command that refuses
  every other kind.
* The connection event carries no fingerprint: a matched key is not surfaced by
  the connection, and carrying it out would have meant touching host key
  verification. The fingerprint is recorded when a key is trusted instead.
* Not built: transfers, removal of a host's Logbook with the host, filters and a
  search, and a Logbook line in the Bar's footer.

## Risks

* **The Stage replaces what the group strip does.** Splits, broadcast per group
  and per-tab macros all have behaviour. If the Stage cannot carry it, the
  fallback above applies.
* **Terminals and tiles.** A tile that moves must not remount its terminal, and
  a resize refits once. Parked sessions stay mounted and hidden.
* **ADR-0032.** The credential step and the Hall's last line both touch it.
  `tests/no-terminal-in-home.test.ts` stays green, and the last line has its
  own guard.
* **The Bar's grammar.** Prefixes are learned, not discovered. Every empty
  state and the first Bar open show them.
* **The guard becomes habit.** Holding to confirm can be done without reading.
  The target list is shown above the button, and the number of hosts is on it.
* **`App.tsx`.** The shell holds the state of every workspace. Slice 1 is the
  chance to move the Bar's state out of it.
* **Translation length.** Plate and chip labels in pt-BR are the first thing to
  break at 900 by 560.

## Open questions

1. Is the weight a switch (`normal` or `production`), or does a Space have
   named levels?
2. Can a host belong to more than one Space, or exactly one? The plan assumes
   at most one.
3. Does the one-time group import ask once at the first launch after the
   update, or live in Settings?
4. What are the Logbook's bounds, in events and bytes, and is the default to
   record or to ask on first use?
5. Is the Hall's last line worth its review, or do plates stay with state and
   latency only?
6. Does the Stage's "Files" tile replace the SFTP workspace entirely, or does
   the two-pane transfer view remain for moving between two hosts?
