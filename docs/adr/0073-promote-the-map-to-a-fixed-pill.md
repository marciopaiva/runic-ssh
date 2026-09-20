# ADR-0073: Promote the map to a fixed pill

* **Status**: Accepted, amended by ADR-0075 (choosing the pill becomes a
  workspace switch instead of a shell switch; the pill and the preview
  prompt keep their behavior)
* **Date**: 2026-09-19

## Context

ADR-0066 put the map behind `previewFeatures`, a setting off by default
(`settings-context.tsx`), and kept classic navigation as what a fresh
install lands on. The stated reason was to buy evidence before choosing
between cutting classic, keeping both, or cutting the map, without handing
an unfinished feature to someone who came for a finished client. Turning
the setting off while the map shell is in front falls back to classic
(`App.tsx:293`), and the shell switch itself only renders behind the same
gate (`App.tsx:2424`).

`nav-proposal-v7.html` draws MAPA as the third of three fixed pills, SSH,
SFTP, MAPA, on the same row, with no setting gating it. This reopens
ADR-0066's decision directly, not as a detail of the new navigation but as
its own question: the new nav has no rail to hide a fourth-workspace-style
entry behind a setting the way `ActivityRail`'s `map` slot did, and folding
the map into the SSH/SFTP pill switch (ADR-0072) forces a choice between
keeping it gated (a pill that sometimes isn't there) or promoting it (a
pill that always is).

This document is honest about what has and has not changed since ADR-0066
shipped: no usage evidence from the self-selected group ADR-0066 named has
been reviewed here, and none is cited as the reason for this proposal. The
reason is structural: a pill row with a member that vanishes depending on a
setting is a worse version of the exact problem ADR-0071 and ADR-0072 exist
to remove, a control whose presence you have to already know about to find.
The map's own finish is a separate question this document does not answer
either way, only that showing it inconsistently is the wrong way to keep
asking it.

## Options considered

### Option A: Leave ADR-0066 as it stands

Keep the map behind `previewFeatures`, gated out of the new pill row the
same way it is gated out of `ActivityRail` today: the pill only renders
when the setting is on.

**Cost**: none beyond the awkwardness named in Context: a pill row where one
member sometimes doesn't exist. **Forecloses**: nothing; a later ADR can
still promote it once real evidence exists.

### Option B: Promote the map, retire the setting

`shell`'s `map`/`classic` split loses its `previewFeatures` gate. The MAPA
pill always renders, `chooseShell('map')` is reachable without opening
settings first, and `previewFeatures` either goes away entirely or keeps
gating whatever else it covers, if anything does today besides the map
(to confirm in Phase 1: `usePreview()`'s only cited caller in Context is the
map).

**Cost**: small by the mockup's own audit, a settings toggle removed and a
condition removed from two call sites (`App.tsx:293`, `App.tsx:2424`); no
IPC change, no dependency, no migration since the map has no on-disk
session format of its own. **Forecloses**: the specific mechanism ADR-0066
chose (opt-in preview) for gathering map feedback before committing to it.
Reverses ADR-0066's Decision, not just its Consequences.

### Option C: Promote the pill, keep the gate one level down

The MAPA pill always renders and is always clickable, but choosing it while
`previewFeatures` is off opens a short, explicit "this is a preview" prompt
instead of the map, matching how a changed host key or an unreviewed locale
already interrupt with a stated reason rather than silently degrading.
Turning `previewFeatures` on removes the prompt.

**Cost**: between A and B. Keeps the setting and its stated meaning (an
explicit opt-in to work in progress, ADR-0066's own point of comparison with
ADR-0007's Spanish locale), while fixing the inconsistent-pill problem: the
pill is always there, what happens after clicking it is what is gated.
**Forecloses**: less than B. A maintainer or reviewer can still find and
gate the map by the same mechanism ADR-0066 chose; only the entry point
becomes uniform.

## Decision

Option C. It answers the structural problem this document exists for, a
pill that must always be exactly as present as its siblings, without
quietly overturning ADR-0066's actual point: that turning the map on is
supposed to be a deliberate, informed choice, not a rail icon someone
stumbles into. B throws that away for a cost this document has no new
evidence to justify paying. A leaves the inconsistency Option C exists to
fix.

`previewFeatures` keeps its current meaning and default (off). The MAPA
pill renders unconditionally in the new toolbar switch (ADR-0072). Choosing
it while the setting is off shows the opt-in prompt in place of the map
shell; accepting the prompt is equivalent to turning the setting on from
Settings, and either path is reachable at the same call sites ADR-0066 named.
`App.tsx:293`'s fallback-to-classic on turning the setting off elsewhere
stays: nothing here changes what happens once someone is looking at the map.

This amends ADR-0066's Consequences (how the opt-in is reached) without
reversing its Decision (that it stays an opt-in). ADR-0066's Status line is
updated to note the amendment and point here.

## Consequences

**Good**: MAPA is a pill exactly like SSH and SFTP, present or absent
depending on nothing the user has to remember. The opt-in ADR-0066 wanted
stays real; it moves from "you cannot find the door" to "the door tells you
what is behind it before you walk through."

**Bad**: one more prompt exists in the app, and it is only ever seen by
someone who has not yet opted in, which is a narrow audience by design; it
is still a component with no obvious eventual removal date. Whether
`previewFeatures` gates anything besides the map, once Phase 1 confirms it
does not, is worth asking whether the setting should just be renamed
`mapPreview` for honesty rather than kept generic for a feature it alone
covers.

**Follow-up**: the actual prompt's copy is `src/locales/en.json`-first per
CLAUDE.md section 1, translated after, and does not need its own ADR;
Phase 4 writes it against the real strings the way any other user-facing
text is. Whether `previewFeatures` should be renamed is a Phase 1 question
for whoever implements this, not decided here.
