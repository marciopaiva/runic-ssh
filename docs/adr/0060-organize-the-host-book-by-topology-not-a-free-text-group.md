# ADR-0060: Organize the host book by topology, not a free-text group

* **Status**: Accepted
* **Date**: 2026-09-03

## Context

Raised live: whether the current Home/Hosts sidebar (`HostsSection.tsx`) is
the best navigation for a saved-host book at all, not whether some detail
of it is wrong. The screen has never been questioned at this level since
ADR-0052 gave it its current shape, which is `SessionsSidebar.tsx`'s own
list, reused wholesale: a filter box, then hosts bucketed under whichever
free-text `group` string was typed for each one, or "ungrouped."

That bucket is manual and disconnected from the one piece of real
structure this data already has: `Session.proxyJump` names another saved
host this one is reached through, and `jumpRole()` (`features/sessions/
jump.ts`) already computes, from that field alone, whether a host carries
others or rides one. Nothing about the current list uses this. A bastion
and the three targets that only exist because of it can be scattered
across three different typed-in group names, or file under nothing at
all, with no visual sign they depend on each other. The `group` field
itself already appears as a section heading (`groupSessions`, `features/
sessions/state.ts`) and, separately, as an icon per row (`HostKindIcon`,
ADR-0031): a jumpServer/target/direct kind that is set by hand and can
disagree with the actual topology `proxyJump` describes.

## Options considered

Explored as three independent, fully worked mockups (`nav-proposal-
topology.html`, `nav-proposal-usage.html`, `nav-proposal-search.html`,
not committed: throwaway static HTML built by three separate agents,
each briefed on the real data model and told nothing about the other
two), rather than argued from description alone.

### Option A: Usage-driven organization

Keep the flat list's shape; add a capped "Recent" strip above it
(`lastConnectedAt`, a new field this proposal names explicitly), and turn
`group` into filter chips instead of section buckets.

**Cost**: needs new persisted state tracking actual connects, including
through a chain, or the section reports something misleading. Reorders
itself between sessions in a way the current list never does, which the
proposal's own account says needs an explicit "never reorganize" escape
hatch it does not yet have.

**Forecloses**: nothing; this is additive to the current shape and could
still be layered onto whichever of the other two ships.

### Option B: Search-first, list-secondary

Replace the always-reserved 280px list with a 148px recency rail plus a
keyboard-first fuzzy switcher (`Ctrl/Cmd+K`), reusing the interaction
`CommandPalette.tsx` already trained into this app elsewhere.

**Cost**: by its own honest accounting, strictly worse than today's list
for a small book (three hosts gain a keystroke and a modal for what fit
in one glance), and depends on a habit (the shortcut) a first-time user
has no reason to already have.

**Forecloses**: the persistent, always-visible list as the default
browsing surface; reaching it becomes deliberate rather than ambient.

### Option C: Topology-first hierarchy

Two sections instead of one flat run: **Bastions**, each a host that
carries at least one other, expandable, its carried hosts nested under
it (recursively, so a bastion reached through another bastion nests two
levels deep); **Direct**, everything with no jump relationship at all,
flat, exactly as today. `group` moves off the primary axis entirely, onto
a small pill per row, so a tag can mark a bastion and an unrelated direct
host alike without forcing them into one bucket, which they cannot be
today.

**Cost**: named directly by its own proposal: a book with no bastions at
all gets nothing from this over the current list, only an absent section
where a heading would have been; nesting several levels deep degrades a
280px column's readable width faster than a flat list ever could; a
collapsed bastion is invisible to a name search unless the search itself
reaches into it.

**Forecloses**: nothing about `group`'s own data (still a free string on
`Session`, still rendered somewhere); the manual `kind` field
(jumpServer/target/direct) stays and still draws its own icon per row,
independently of which section a host lands in, which means the two can
now visibly disagree (a host hand-marked "direct" that a live
`proxyJump` elsewhere still points at renders under Bastions with a
"direct" glyph). That disagreement is the computed topology telling the
truth over a stale manual field, not a bug to hide.

## Decision

Option C, chosen directly after reviewing all three rendered mockups
against the real token file and the real data model. Three follow-on
questions, each with a real cost either way, resolved directly rather
than assumed:

- **A book with no bastions shows no "Bastions" heading at all**, the
  same rule an empty `group` bucket already follows in
  `groupSessions` today: a heading with nothing under it is not
  information, and does not get to stay as a hint that the feature
  exists.
- **A bastion's own expanded/collapsed state survives closing the
  application.** Read and written through `localStorage`, keyed by
  session id, not through the settings file `persistTheme`/`persistLocale`
  already use. That file holds application-wide choices; this is a
  scroll position for one view, closer to `sidebarOpen` in `App.tsx`
  (which does not persist at all today) than to a theme. `localStorage`
  is the first use of it anywhere in this frontend's source; nothing
  secret goes into it (an id and a boolean per bastion), which is the one
  rule section 6 of `CLAUDE.md` places on it.
- **Filtering the list auto-expands whichever collapsed bastion holds a
  match.** Without this, the filter box can be asked for a host that
  exists, answer nothing, and be wrong about it, which is worse than not
  filtering into a hierarchy at all.

Dangling `proxyJump` (a saved id that no longer resolves to a session,
the same case `credentialRedirectTarget` already has to answer) renders
as a root: nothing to nest it under, so it is not nested, in whichever
section (Bastions if it also carries something, Direct otherwise) its own
computed role puts it in.

Scope: `HostsSection.tsx` and its own supporting pure functions in
`features/sessions/state.ts` only. `SessionsSidebar.tsx`'s own list, a
different screen with a different job (live sessions, not a saved-host
book), is untouched; nothing here revisits ADR-0029's split between the
two.

## Consequences

**Good**: the one real structural fact this data has stops being
invisible. A bastion carrying several targets reads as what it is, not
as three unrelated rows that happen to share a hand-typed word, or as
nothing at all if nobody typed one.

**Bad**: a book with no jump chains, plausibly the common case for a
new install, gains no benefit and loses screen space to a section that
never draws anything, an explicit, accepted cost rather than a hidden
one. Nesting depth has no upper bound tested here; a chain more than two
or three hops long has not been seen rendered and may need its own
follow-up (truncated names, or a horizontal scroll inside one row) once
somebody actually has one. `localStorage` is now something this frontend
uses at all, a small addition to what a future security or privacy
review has to know is there, even though nothing it holds is sensitive.

**Follow-up**: wire the chosen mockup into `design/canvas/gen.py` as a
real generated artboard (retiring the standalone HTML), reusing
`host_row()`'s existing `depth`/`via` parameters, which already draw the
connecting-line indent this needed and were sitting unused for this
purpose. Whether `group`-as-pill should ever become a real filter facet
(the usage proposal's own chip row) is a separate decision, not assumed
here.
