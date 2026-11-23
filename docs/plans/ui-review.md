# Plan: the interface review, after the map

Written on 2026-11-23, with ADR-0080 (remove the map) as its first step. This
is a plan and a proposal, not a decision record. Each phase below gets its own
ADR where the decision is architectural, and every screen change is built in
the application and reviewed by running it, as CLAUDE.md section 4 asks.

## Why now

Removing the map leaves three workspaces and one shell. That is the first time
since v0.6.0 that the navigation can be reasoned about as one thing, and the
review below is what to do with that room. The findings come from reading the
code and driving the application on 2026-11-23, with real hosts:

* **Home is empty.** It shows a logo. The host book lives in a sidebar that is
  closed by default, so a returning user's first screen offers nothing to do.
* **Empty states disagree.** SSH centres a logo and one button. SFTP draws two
  dashed panes with a button each. Home draws a logo. Three screens, three
  answers to "nothing here yet".
* **The toolbar mixes jobs.** Five icons sit at the right, unlabelled, and
  hold session actions (broadcast, macros, host manager) beside application
  settings (theme, language). Meaning lives in tooltips.
* **Sessions need two rows.** Workspace pills on top, a strip of tabs and
  groups below, a facet row (Terminal, Tunnels, Monitor) inside each session.
  Three levels of switching before the terminal.
* **Features are hidden by structure.** Monitor is a large feature, and it is
  a facet label inside a session. Fleet run is a dialog reached from a menu.
* **State is inconsistent.** The status bar says "No session" while a terminal
  is focused elsewhere. That goes away with the map, but the bar still reads
  the focused session in several different ways.

## What does not change

* The visual direction approved on 2026-08-22: the density of Windows Terminal
  and VS Code, the palette derived from the logo, Manrope for the interface and
  JetBrains Mono for the terminal, light as the dark token set with swapped
  values, never a second design.
* Connection state is never carried by colour alone.
* Host key screens: the safe action is the only filled button, and overriding a
  changed key means typing the host name. The sigil is not added to them.
* `sessions.json`, the credential model, host key verification, the IPC
  contract for terminal, SFTP and Monitor, the capabilities in `tauri.conf.json`.
* No new runtime dependency. The tokens already exist (`styles/tokens.css`),
  and `framer-motion` and `@headlessui/react` are already in the tree.

## The review's own rules

These are the checks any proposal below has to pass, and the ones a reviewer
can use without trusting the author.

1. **One answer per question.** One empty state, one place for session
   actions, one place for application settings, one meaning for each glyph.
2. **The terminal is the content.** Chrome gives it the room it can and
   collapses before it competes.
3. **Restraint with the accent.** The brand gradient marks the live and the
   primary action. Nothing else wears it. No glow, no large radii, no cards
   where a list reads better.
4. **Everything is reachable from the keyboard**, and shows the key that does
   it.
5. **State has a shape.** A glyph and a word, then colour. Readable in
   greyscale.
6. **Every string fits in pt-BR**, the longest of the three catalogues, at the
   smallest supported window.

## Directions

### Direction A: Order

Keep the structure. Fix what is inconsistent inside it: Home becomes the host
book, empty states share one pattern, the toolbar is regrouped and labelled,
settings leave the toolbar, the status bar reads one source, shortcuts show
beside actions, Monitor and Fleet get a visible entrance.

Cost: the smallest. No new architecture, no ADR beyond ADR-0080, shippable in
small pull requests. Forecloses nothing. Leaves the three levels of switching.

### Direction B: Stem (recommended after A)

Direction A, plus a different home for sessions. A slim vertical stem on the
left replaces the second row of tabs. Each live session is a node on it:
the host's sigil, lit while connected, with a state glyph, expanding on hover
or focus to name, user and latency. Groups are brackets around nodes, and a
split is a node that holds two. A session gets one header with its facets
(Terminal, Files, Tunnels, Monitor) as a segmented control, replacing the row
of facet labels. Terminals are still mounted only in the SSH workspace, so
ADR-0032 is untouched: the stem lists sessions, it does not render them.

Cost: medium. A new ADR that supersedes parts of ADR-0071 to 0073, a rewrite of
the tab strip and group strip (`GroupStrip.tsx`, about 400 lines), keyboard
and drag rules for the stem, and a setting to opt in for one release. Forecloses
the horizontal tab strip as the default. Risk: groups and splits carry a lot of
behaviour (ADR-0020, 0029), and the stem has to express all of it.

### Direction C: Workbench

A dockable layout: editor groups, a side panel and a bottom panel for
transfers and fleet results, arranged by the user and remembered.

Cost: the largest, by a wide margin. A layout engine, persistence, and a way to
keep ADR-0032 true for terminals that move between docks. Forecloses nothing,
and delivers little a terminal client needs that A and B do not. Not
recommended now.

**Recommendation**: A first, then B behind a setting. A fixes the visible
inconsistencies at low risk and is useful on its own. B is the change with the
real ceiling, and it is better judged by using A's cleaned-up base than by
drawing it. C is deferred until someone can name the task it makes possible.

## Screen by screen

### Hosts (replaces Home)

The host book is the first screen, full width, search-first (press `/` or just
type). Rows show the sigil, name, `user@host:port`, the topology (reached
through a jump host, or serving as one), and a state glyph and word for hosts
that are connected. A "Live" section on top lists open sessions and jumps to
them: it existed briefly and was pulled before v0.9.0, and returns here on
purpose with a click that activates the session. Selecting a row shows its
details on the right with Connect, Files, Edit and Run macro. With no hosts,
one card: "Add your first host" and "Open a local shell", and the key to open
the palette. The logo moves to the empty state and the About box.

### Session frame

One header per session: sigil, name, a state glyph with a word ("Connected,
12 ms", "Reconnecting, attempt 2 of 8"), facets as a segmented control, and
actions at the right (split, broadcast, macros, run on several). The reconnect
banner stays under it, as today. The terminal takes everything else.

### The stem (Direction B)

A column about 44px wide, expanding to about 220px on hover, focus or when
pinned. Roving focus with the arrow keys, `Ctrl+1` to `9` to jump, drag to
reorder or to drop a node onto another to split. Each node: the sigil (lit
when connected, cut once when a connection comes up, struck when it dropped),
and a state glyph beside it that does not rely on colour.

### Toolbar

Left: the workspaces, text and icon. Centre: nothing. Right: one cluster of
session actions with labels when the window is wide enough and icons with
visible shortcuts when it is not, then one gear that opens settings (theme,
language, window chrome, preview features). Theme and language leave the
toolbar.

### SFTP

Same two-pane structure and fan-out, with the empty state shared with the other
screens. Transfers move to a bottom drawer that shows per-file state, speed and
a cancel, and opens by itself while something is moving. Drop targets say what
will happen before the drop ("Copy to the folder you are over").

### Monitor

Keep the content. Give it a visible entrance (a labelled facet, and a card on
the host's detail on Hosts), align chart styling with the tokens (the same
endpoint emphasis, grid and area fill on every chart), and say, in one
sentence, what a host without `ss` or `journalctl` is missing instead of an
empty table.

### Run on several hosts

Becomes a sheet with the script, the targets as host groups with a ticked list
and the left-out hosts named, and the grouped results beside them, so a run is
one surface and not three modal steps. Results keep the byte-for-byte grouping
and the marked differing lines. Copy per group.

### Command palette

The one door. Verbs and hosts in one list, recent first, with the shortcut
beside each, and a section for macros. It already exists; the change is
ranking, shortcut display and being the answer to "where is X" for anything in
this list.

### Status bar

Always about the focused session, from one source: state, host, latency,
throughput, encoding, grid size. Latency and throughput open Monitor. With no
session it shows the application version and nothing invented.

### Feedback and errors

Toasts for things that finish on their own (a transfer, a reconnect), one
pattern for typed errors with a plain next step, which the catalogue already
carries. No modal for something the person can ignore.

### First run

A fresh install shows the Hosts empty state and nothing else, with the palette
shortcut visible. No tour.

## Design language

* **The line.** The sigil's engraved stroke (1.4 on a 24 grid, round caps, the
  three tones: stem rune, cyan, violet) is the one decorative element. Icons
  that carry meaning get the same weight.
* **Surfaces and type.** Existing tokens only. A type scale of 11, 12.5, 14,
  18 and 24 for Manrope and 13 for the terminal, on a 4px spacing grid, with
  radii of 4, 6 and 10.
* **Motion.** The existing durations (100, 200, 300ms) and easings. One
  signature: the sigil is cut, once, when a connection comes up. Everything
  else is a state change, not a show. Reduced motion removes the rest.
* **Elevation.** A border and, for overlays only, one shadow. No blur panels.
* **State.** Connected, connecting, reconnecting, dropped and idle each have a
  glyph and a word, defined once and used on Hosts, the stem, the session
  header and the status bar.

## The quality bar

A phase is done when these hold, and each can be checked by someone who was not
there:

* **Contrast.** Text at 4.5 to 1, interface boundaries and glyphs at 3 to 1, in
  both themes, measured per screen.
* **Keyboard.** The six core tasks (open a host, open a second session, split,
  run a macro, send a file, run on several hosts) complete with no pointer.
* **Fit.** Every string fits in pt-BR at 900 by 560, with no clipping.
* **Motion.** Nothing animates under reduced motion, and no animation blocks
  input.
* **Speed.** The host book is usable within 300ms of the window being ready, on
  the maintainer's machine, measured.
* **Honesty.** No unhandled rejection in the dev console while using any screen
  (it caught one on 2026-11-23, fixed in #507), and a screenshot of each screen
  in both themes in the pull request.
* **Tests.** Each behaviour change has a test, and the existing guards
  (`no-terminal-in-home`, the token and copy guards) stay green.

## Phases

| Phase | What | Needs |
| --- | --- | --- |
| 0 | Remove the map (ADR-0080), in three pull requests | ADR accepted |
| 1 | Order: Hosts as Home, shared empty state, regrouped toolbar and settings, one-source status bar, visible Monitor and Fleet | none beyond this plan |
| 2 | Stem and session frame, behind a setting for one release | a new ADR |
| 3 | Polish: motion pass, SFTP drawer, Monitor and Fleet alignment, accessibility audit | phase 2 in use |

Each phase ends with a stop: the maintainer uses it for a few days before the
next one starts.

## Risks

* **Groups and splits.** The stem has to carry everything the group strip does.
  If it cannot, B ships as A plus the session frame and the strip stays.
* **`App.tsx`.** The shell holds the state of every workspace. Phase 1 should
  take the chance to move the toolbar and status bar state out of it.
* **ADR-0032.** Any layout that moves terminals around must keep nothing
  rendering remote output while the inline credential field is on screen.
  `tests/no-terminal-in-home.test.ts` is the guard.
* **Translation length.** pt-BR runs about a third longer than English. Labels
  next to icons are the first thing that breaks.
* **Reversing a decision on purpose.** Hosts as Home overturns the
  "Home is only a logo" change of v0.9.0. That is intended, and it should be
  said in the ADR, not discovered.

## Open questions

1. Hosts as Home: a full host book, or the sidebar plus a better empty state?
2. Is the stem the default after one release, or does it stay opt-in?
3. Does a session get a "Files" facet (a drawer with that host's folders), or
   does SFTP stay only a workspace?
4. Is one window enough, or is a second window for a session in scope?
5. Which of the six core tasks is the one that matters most, so phase 1 is
   judged on it first?
