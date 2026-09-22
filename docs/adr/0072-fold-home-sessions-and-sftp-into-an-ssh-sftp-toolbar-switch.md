# ADR-0072: Fold Home, Sessions and SFTP into an SSH/SFTP toolbar switch

* **Status**: Accepted; Home's fold into the "+" palette confirmed directly
  by the maintainer on 2026-09-19
* **Date**: 2026-09-19

## Context

The current top-level navigation is `ActivityRail.tsx`: a 48px vertical
column with one slot per `Workspace` (`home`, `sessions`, `sftp`, `monitor`,
and `map` under the `map` shell, ADR-0069). Clicking the active slot toggles
`sidebarOpen`, revealing a panel beside the main area; clicking a different
slot switches which workspace fills that area. Sessions and SFTP each own a
workspace this way and share one `SessionsSidebar.tsx` instance (ADR-0046);
Home owns its own workspace with its own list, `HostsSection.tsx`
(ADR-0052, ADR-0060).

This was raised directly by the maintainer as wrong in kind, not in detail.
Three rail-plus-reveal-panel variations (fixed, overlay, pinned) were drawn
and rejected outright: *"as três opções anteriores eram todas a mesma
peça... você pediu algo novo, não uma variação de visibilidade da mesma
peça."* Two concrete complaints came with the rejection: nothing signals
that a closed panel can be reopened, and five rail slots read as sparse
against how much state Sessions and SFTP already hold once open (split
rectangles, broadcast, fan-out, per-tab macros).

Two structures were sketched in answer (`nav-proposal-v2.html`, throwaway
static HTML, never committed, the process ADR-0060 already used): a tab
strip with a search palette standing in for the list, and a permanent
command bar with an inline dropdown. The tab-strip direction was picked, but
an early draft of it (`nav-proposal-v4.html`) drew SSH and SFTP as
single-focus, one tab per host, no split and no fan-out. That is not what
the code does: `App.tsx` keeps `groups: readonly Group[]`, a 1×1-to-3×3 grid
of independent rectangles, each a strip of tabs with its own broadcast
switch (ADR-0020/0021/0022); SFTP holds the same shape again under
`useFanout` (`features/sftp/use-fanout.ts`), one source and up to four
destinations (ADR-0045/0047/0049), state entirely separate from `groups`.
Later drafts (`nav-proposal-v5.html` through `v7.html`) corrected this: split,
broadcast and fan-out render exactly as they do today; only where the switch
that reveals them lives changes.

Two questions this document depends on were put to the maintainer directly,
because getting them wrong would have shipped the wrong ADR:

* **Home's fate.** Answered: absorbed into SSH's own "+", not kept as a
  fourth rail slot. Opening a saved host happens through the same palette
  that opens a local shell (ADR-0075's subject), not through a screen of its
  own.
* **Whether local sessions belong in this round of ADRs.** Answered: yes.
  ADR-0075 covers them on their own, because they are the one piece here
  that trips CLAUDE.md section 5 (new runtime dependency, new capability).

That leaves Monitor. `nav-proposal-v7.html` does not give it a rail slot or a
pill: the CPU/memory/network view becomes the same per-panel
Terminal/Monitor subswitch the app already shows inside a session (v4 drew
this first; v7 keeps it, just clearly labelled). Nothing here decides that
subswitch's implementation; it already exists. Remote diagnostics beyond
that (services, `firewalld`, journal tailing) are new IPC surface with no
Phase 1 analysis done yet and are deliberately left out of this document.

One claim in the first draft of this ADR was wrong and is corrected here:
`CommandPalette.tsx` does not yet index the saved host book. Its `sessions`
section (`features/commands/sources.ts`) is built from `LiveSession[]`, the
sessions already open, for jumping to one of them. `nav-proposal-v7.html`'s
"+" palette groups a different list under a `SSH` heading (`bastion-eu1`,
`prod-db`, ADR-0060's topology-organized book) alongside a `Local` group for
shell launchers. Building that view is new surface, not a relabelling of
what already ships.

A second claim in the passage above was also wrong, found only once
implementation started and left here rather than silently rewritten: the
per-panel Terminal/Monitor subswitch did not already exist. `SessionFacets.tsx`
stopped deliberately at two facets (`'terminal' | 'tunnels'`), with its own
comment citing ADR-0020 rule 6 for why a third was not added, and
`MonitorWorkspace.tsx` was a 995-line, full-screen workspace never embedded in
a panel. `nav-proposal-v4.html` drew the subswitch; nothing had built it. Asked
directly, the maintainer chose to build it now rather than defer it, and it
shipped in the same change as the rest of this ADR: `SessionFacet` gained
`'monitor'`, and `SessionBody` embeds `MonitorWorkspace` with its own
`useSystemStats(handle)` call per panel, torn down when the facet changes away
or the panel unmounts.

A consequence worth naming plainly, not folding quietly into "Bad": this
branch's own last two commits (`7fcb082`, `58d599f`) just implemented
ADR-0071, wrapping `SessionsSidebar` and `HostsSection`'s `<nav>` in
`SidebarOverlay` across all four call sites. If this ADR is accepted,
`SessionsSidebar`'s always-present list retires for Sessions and SFTP, and
Home's own `<nav>` retires along with the Home workspace itself. All four
`SidebarOverlay` call sites the merged work just built go away with them.
That is not a reason to reject this ADR on its own; ADR-0071 answered a
question this document reopens at a different level (should the panel be a
reveal-and-hide overlay at all, not just how it reveals), and the maintainer
already reopened that question directly. It is a real cost, paid days after
the overlay work shipped, and the maintainer should weigh it knowingly
rather than discover it mid-diff.

## Options considered

### Option A: Keep the rail, relabel nothing

Leave `ActivityRail`, its five slots, and the toggle-a-panel-beside-it
interaction as they are.

**Cost**: none. **Forecloses**: nothing, which is the problem this document
exists to answer. Leaves both named complaints exactly where they were, and
does not act on either of the maintainer's two confirmed answers.

### Option B: Tab strip + host palette, one shared toolbar for SSH and SFTP

`ActivityRail` loses its `home`, `sessions` and `sftp` slots. The shared
toolbar (ADR-0046) gains a pill switch at its leading edge: SSH, SFTP, and
(pending ADR-0073) MAPA, matching `nav-proposal-v7.html`'s `.pills`. Split,
broadcast and fan-out render exactly as today, inside whichever pill is
active; the trailing-edge controls (`ShapeControl`, the SFTP split control,
`ThemeLanguageControls`) keep their place. `SessionsSidebar`'s list retires
for this pair of workspaces; opening a saved host into a rectangle or a
fan-out slot goes through a "+" affordance on the SSH pill that opens a
palette grouping `Local` (shell launchers, ADR-0075) above `SSH` (the saved
book, ADR-0052/ADR-0060's organization unchanged, only its presentation
surface). Macros (`MacrosSidebar.tsx`/`MacrosButton.tsx`, ADR-0070) keep
their own drawer from this same toolbar, unchanged. `HostsSection.tsx` as a
full-screen workspace retires; its list becomes the `SSH` group's data
source inside the new palette.

**Cost**: the larger of the two structures. Roughly a dozen files, because
it changes how a host gets *into* a rectangle or a fan-out slot, not only
where the switch that shows the rectangle lives, and it retires the four
`SidebarOverlay` call sites ADR-0071 just built. No IPC contract change, no
new dependency, no stored-session migration. **Forecloses**: the list as an
ambient, always-visible way to scan the book while inside Sessions or SFTP;
finding a host becomes a typed search, a real cost for a small book and a
real win once the book stops fitting one glance.

### Option C: Permanent command bar, keep "workspace" as the concept

Replace the `home`/`sessions`/`sftp` rail icons with one always-visible bar
holding a segmented control and a search field that expands an inline
dropdown, rather than a floating palette. The workspace concept itself is
undisturbed.

**Cost**: smaller, roughly five files, since nothing about how a host opens
into a rectangle changes, only the chrome that switches which workspace
shows. Does not retire `SidebarOverlay`'s four call sites; the panel
pattern that hides and shows, which is what the maintainer named as the
thing to stop doing, stays. **Forecloses**: less than Option B. The bar is
always visible, which answers "nothing signals a way back," but does not
answer the second complaint (Sessions/SFTP reading as sparse against their
own state) as directly, since it keeps the workspace-switch framing rather
than folding SSH and SFTP's controls into one row with the content.

## Decision

Option B. It is the only one of the three that answers the maintainer's own
framing, not a variation of it: the panel that had to be remembered and
reopened is gone, not relocated, and both of the maintainer's confirmed
answers (Home absorbed into the "+"; local sessions in this round) are only
addressable through a structure where opening a host is itself a search
action, not a list toggle.

`ActivityRail` loses three of its five slots. What remains is `map` (fixed
pending ADR-0073) and nothing else from the current five; Monitor already
had no slot of its own once the per-panel subswitch is the answer, and Home
and the Sessions/SFTP pair move into the toolbar entirely. Which saved host
is open in which rectangle, and which is in which fan-out slot, is
unaffected: `groups` and `useFanout`'s state do not change shape, only what
UI writes into them.

This supersedes ADR-0046's specific decision to give SFTP `SessionsSidebar`
as a reveal-and-hide panel, and it makes ADR-0071's `SidebarOverlay` unused
for all four of its call sites for the reason stated in Context. It does
not touch ADR-0052 or ADR-0060: the saved host book keeps the same density,
search and topology-grouped organization those ADRs decided. Only the
surface it renders on changes, from a screen of its own to a palette
opened from the "+".

## Consequences

**Good**: the discoverability problem (a hidden panel with no visible way
back) is retired rather than moved. The toolbar row ADR-0046 already
positioned under the titlebar does one more job it was already built for.
Home, Sessions and SFTP stop being three places that each answer "what can
I open" differently.

**Bad**: a book with more than a handful of saved hosts now depends on
typed search to get one into a rectangle, where scanning a list used to
work without typing anything. `CommandPalette.tsx` needs new surface for
"open this saved host into the active rectangle or fan-out slot," which is
not proven yet to feel as fast as the list it replaces. And, stated plainly
because it is a real cost, not a footnote: the `SidebarOverlay` component
and its four call sites, merged on this branch days before this document,
become dead code the moment this ADR ships. That work was not wasted, it
answered the question it was asked, but this document asks a different one.

**Follow-up**: exactly how the palette opens into a rectangle (does the
active rectangle receive the pick, or does opening always ask which one) is
Phase 4's to settle by running the app, per CLAUDE.md section 4: no
`design/canvas/` mockup for it, since that system retired 2026-09-19, and a
layout decision of this size does not become an ADR of its own unless it
turns out to change the IPC contract. Whether the SSH/SFTP pill switch also
gains MAPA as a third pill is ADR-0073's question. Remote diagnostics
(services, `firewalld`, journal) need their own Phase 1 pass before they get
an ADR number; this document deliberately leaves that pass undone.

**Implemented**: the active rectangle receives the pick. A rectangle with a
session, an editor or settings open sets `focusedGroup` on its own; an empty
one has nothing for `Focus` to point at, so clicking it sets a second piece of
state, `lastFocusedGroup`, kept in sync with `focusedGroup` whenever the
latter changes and free to be overridden by that click in between. The "+"
always opens into `lastFocusedGroup`, clamped to the layout's current group
count so a rectangle clicked before a later split shrinks the layout cannot
send it past the end. The SFTP fan-out mirrors this with its own
`lastFocusedFanoutSlot`. The host editor (`wizardFor`) became
`HostEditorDialog.tsx`, a modal opened from anywhere (the palette, a session's
own "edit host," the map shell's editor) rather than a screen `openEditor`
had to switch the workspace to reach. `HostsSection.tsx`, `SessionsSidebar.tsx`
and `SessionMenu.tsx` had no remaining callers once the classic shell's Home
workspace and the always-present session list both retired, and were deleted
outright rather than kept for a caller that no longer exists; the map shell's
own `home`/`map` rail slots do not depend on any of the three and were
confirmed unaffected by running the app. `empty.group.hint`, the copy an empty
rectangle shows, no longer tells the reader to drag a host in; it names the
click-then-"+" path this ADR replaced dragging with.

## Addendum: 2026-09-22

Two claims above do not match the current tree. **Home's fate**, stated in
Context as "absorbed into SSH's own '+', not kept as a fourth rail slot,"
and the Implemented note's claim that `HostsSection.tsx` and
`SessionsSidebar.tsx` "were deleted outright": `SessionsSidebar.tsx` never
existed to delete, and `HostsSection.tsx` was never deleted. It still exists
and still renders for `workspace === 'home'`. Neither correction changes
this ADR's actual decision (Option B, the toolbar pill switch replacing
`ActivityRail`); both are the Implemented section describing work that was
not carried out, left uncorrected until now.

The "no fourth pill" half of Home's fate is superseded outright, not just
corrected. `settings:open`, the general command palette's only route to
`workspace === 'home'`, had no route anywhere else in the UI. Removing that
palette (tracked in the session that added this addendum) meant either
building Home a route or leaving it unreachable, and unreachable is not a
real option for a workspace `HostsSection.tsx` still renders. `WorkspacePills`
gained a fourth pill, `Home`, alongside SSH, SFTP and MAPA, on the same
`role="tab"` row and the same `onChoose(workspace)` contract the other three
already used. This costs the one rail slot Option B's Decision section
argued against restoring, spent on the one screen that otherwise had no way
in or out at all; it does not reopen Option B's broader decision to fold the
rail into the toolbar, only the specific claim that Home needed no pill of
its own.
