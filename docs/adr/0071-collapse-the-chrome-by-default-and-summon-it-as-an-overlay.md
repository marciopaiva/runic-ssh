# ADR-0071: Collapse the chrome by default and summon it as an overlay

* **Status**: Accepted and implemented; ADR-0072 (Proposed) would make
  `SidebarOverlay` and all four of its call sites unused if accepted
* **Date**: 2026-09-18

## Context

The visual direction approved on 2026-08-22, reviewed as a canvas rather than
written as its own ADR, put the interface in the density of Windows Terminal
and VS Code: a custom titlebar carrying the session tabs, a sessions sidebar
always visible, a status bar always visible. ADR-0005 built the titlebar on
that premise (own chrome so the tab strip and the drag region can share the
same 38 pixels), and ADR-0020 built the groups-in-the-titlebar,
activities-in-a-rail model on top of it. Neither ADR chose the density itself;
both assumed it as given.

ADR-0063 (2026-09-09) added a shadow scale, a radius scale, a z-index scale
and glass tokens to `tokens.css`, in service of a "modern AAA" target for
component finish. Those tokens exist and are in use by the primitives under
`src/components/ui/`, but the VS Code-style density keeps every surface
pinned edge to edge, so a card's shadow or a dialog's radius rarely has room
to read as anything more than a thin outline.

The maintainer asked, independent of that component-level work, to drop the
VS Code/Windows Terminal density itself and move the chrome toward something
that reads as current in 2026. A survey of comparable terminal and SSH
products split into two camps: general-purpose terminals chasing either an
AI-native block model (Warp) or near-zero chrome (Ghostty, Kitty, WezTerm),
and dedicated SSH/SFTP clients built around a host list and a full-bleed
session view (Termius). Runic is in the second category by function, not the
first: it connects to hosts it does not control the shell on, and its core
use, watching several of those hosts at once through broadcast and fan-out
(ADR-0065) and topology groups (ADR-0060/0061, surfaced via ADR-0020), depends
on session state staying visible without the reader having to ask for it.

Constraints going in: no new runtime dependency (the four packages ADR-0063
already granted cover what this needs); no IPC change; no migration for
stored sessions; the palette (navy/cyan/violet derived from `assets/logo.png`)
and the typography (Manrope, JetBrains Mono) from the 2026-08-22 direction are
not being revisited here, only density and chrome.

## Options considered

### Option A: Command blocks, Warp-style
Segment each session into command/output blocks, navigable independently, in
a floating canvas rather than a fixed panel. Warp can do this because it
controls the local shell and injects prompt markers into it. Runic connects
over `russh` to a shell it does not control and cannot assume will accept an
injected hook; there is no reliable boundary to cut a remote PTY stream into
blocks on. Forecloses compatibility with an arbitrary remote shell, which is
the product's basic promise, and reads as a step toward an AI-terminal
identity the project has deliberately stayed out of.

### Option B: Collapsed by default, summoned as an overlay, Termius-style
Keep the information architecture already decided elsewhere (Home as a
host-book, ADR-0052; groups by topology, ADR-0060/0061; the SFTP workspace,
ADR-0044 through ADR-0050; the map as a separate opt-in surface, ADR-0064,
ADR-0066, ADR-0068) and change only how much of it stays pinned on screen.
The sidebar and the activity rail collapse to a narrow strip by default and
expand as an overlay when summoned; screens go full-bleed; cards pick up the
radius, shadow and glass values ADR-0063 already defined instead of the
near-flat ones in use today; the terminal takes the full pane when it has
focus. No new dependency: Framer Motion and Headless UI, already in the tree,
cover the overlay's motion and focus handling.

### Option C: Zero chrome, palette-driven, Ghostty/Kitty-style
Remove persistent chrome almost entirely; the terminal fills the window, and
session switching and navigation move into the command palette
(`src/features/commands`, already built for ADR-0069). This is the sharpest
visual departure from the current density, but it optimizes for one person in
one shell, which is not Runic's shape: broadcasting a command to several
hosts, or reading their state at a glance through groups, needs those hosts
visible by default, not one keypress away. Forecloses default visibility of
multi-session state, which every one of the broadcast, fan-out and topology
ADRs assumes.

## Decision

Option B. It is the only one of the three that changes the visual language
without contradicting the multi-session use case the rest of the project is
built around, and it spends no new dependency or architectural risk to do it,
only the tokens ADR-0063 already paid for. The tradeoff accepted is real: the
sidebar and rail stop being ambient information the reader absorbs without
acting, and become something summoned, which costs a keypress or a hover to
recover what used to cost nothing.

## Consequences

**Good**: the shadow, radius, glass and motion tokens from ADR-0063 finally
have room to read as intended. The chrome layer shrinks to what a Termius-like
client needs, without touching the information architecture, security model,
IPC surface, or stored session format. No new runtime dependency.

**Bad**: session and activity awareness that used to be always on screen now
requires summoning the overlay, a real cost for a workflow built around
peripheral awareness of several open sessions; this needs to hold up under
actual use with broadcast/fan-out active, not just look right in a static
artboard. The density change touches the chrome-layer assumption baked into
ADR-0005 and ADR-0020, so both are noted below rather than left silently
stale. Roughly a dozen chrome-adjacent artboards under `design/canvas/`
(`Main*.dc.html`, `Collapsed.dc.html`, `HomeCollapsed.dc.html`, and whatever
else assumes an always-visible sidebar or rail) need redrawing before any
component work starts, which is real design time spent before a single line
of chrome code changes.

**Follow-up**: draw the revised chrome artboards in `design/canvas/` for the
maintainer's review before Phase 4, per CLAUDE.md section 4. Update the
radius, shadow and spacing values `tokens.css` already carries where the new
density needs different numbers; the color values are out of scope. Revisit
this decision if using the interface with several hosts broadcasting at once
shows the overlay costs more attention than the fixed sidebar did.

That review is done. Three candidate artboards came out of it, not one:
`ChromeProposalOverlay.dc.html`, a literal drawing of Option B above; and two
more radical alternates drawn during the same pass, `ChromeProposalDock.dc.html`
and `ChromeProposalOrbit.dc.html` (plus six Orbit sub-screens), neither of
which draws Option B. The maintainer confirmed `ChromeProposalOverlay.dc.html`
on 2026-09-19; Dock and Orbit are declined, recorded in
`design/canvas/README.md`. Phase 4 proceeds from the Overlay artboard.

Phase 4 is implemented. `SidebarOverlay.tsx` (a new component, built on
`Transition`/`Transition.Child` rather than `Dialog.tsx`'s own
`HeadlessDialog`, since `Dialog` always portals to `document.body` and this
overlay has to stay anchored to its own content row) replaces the reflowed
`SessionsSidebar` at all four call sites: Sessions, SFTP and Monitor in
`App.tsx`, and Home's own `<nav>` in `HostsSection.tsx`. `sidebarOpen` starts
`false`. Selecting a session or host from the overlay closes it, the
confirmed UX decision from Phase 4 review. The three artboards this ADR
named, `Main.dc.html`, `Collapsed.dc.html` and `HomeCollapsed.dc.html`, are
redrawn to match; `ChromeProposalOverlay.dc.html` is kept as the record of
the proposal that was accepted, its own panel geometry left as the
placeholder it always was.
