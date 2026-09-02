# ADR-0056: Retire the two-step host wizard

* **Status**: Accepted
* **Date**: 2026-09-02

Amends ADR-0034.

## Context

ADR-0052 named retiring the Host/Access two-step wizard breadcrumb as its
largest single cost, and deferred finishing the decision rather than
guessing at it: *"A second ADR is owed before the wizard retirement
itself is implemented: it has to actually answer the missing-credential-
notice and create-versus-edit questions this one only names, and record
whichever resolution ADR-0030/ADR-0032/ADR-0034 need as a result."*
Issue #296 is that second ADR. Its companion, #297, is blocked on it and
does the implementation; nothing here touches code.

**Where the notice renders today.** `SessionWizard.tsx:303-316` draws the
missing-credential notice (ADR-0039/ADR-0040) unconditionally, above
whichever step is showing, capped to the same 440px the single-column
panel already uses. It is not scoped to step 2 today, despite reading as
"the Access step's own banner" in ADR-0052's Context: both
`build_hosts_host()` and `build_hosts_access()` draw it in the canvas
because the component draws it regardless of `step`. The two-step layout
never actually gave this notice a home tied to one step; it only ever sat
above both.

**How Access decides to test itself.** `SessionWizard.tsx:156-197`:
reaching Access (`step === 2`) sets `proving`, which an effect turns into
one `onTest` call, unless `skipTest` (ADR-0036: host, port and user all
match the saved record). `step !== 2` is what resets `proving`/`attempted`
on the way out, so a reopen counts as a fresh attempt. The trigger is
tied to a **step transition**, not to a field, a mount, or a button.

**The redirect-and-resume mechanism.** `App.tsx`'s `onCredentialMissing`
(520-536) opens the target's own editor and records, in
`editorOpenedFor` (a `ReadonlyMap<string, string>`, `App.tsx:426`), which
original `sessionId` the redirect was for. `finishWizard` (1358-1388)
reads that map back, and `resumeTargetAfterEditor`
(`connect.ts:244-250`) decides whether to retry: only if the credential
this editor just proved (`testOutcome.get(target.sessionId)`) came back
`'saved'`. None of this reads `step`, a breadcrumb, or anything about
navigable steps; it reads `editorOpenedFor` and `testOutcome`, both keyed
by session id, both untouched by how many steps the screen currently has.

**#300, read against the above.** #300 is a real bug in exactly this
mechanism: an SFTP-originated attempt's `sftpConnectTargets` entry
(or the `resumeId` `onCredentialMissing` recorded) does not survive the
redirect-and-resume round trip, so the resumed connection lands as a
plain Sessions terminal instead of back in the SFTP slot that asked for
it. Nothing in the citations above shows this mechanism reading `step`
or the breadcrumb. It is a defect in `editorOpenedFor`/`resumeId`
bookkeeping, present today, in the two-step layout, independent of how
many steps the screen draws.

## Options considered

### 1. Where the missing-credential notice renders

**Option A: keep it exactly where it already is: the top of the panel,
above everything else, unscoped by column.** This is not a new choice;
it is the current behavior (unconditional, not gated on `step`)
carried into a layout with two columns instead of two steps. The 440px
cap widens to the panel's own width, since there is no longer a
narrower step's content it needs to sit above.

**Option B: anchor it to the Access column specifically**, since that is
the field the notice is actually about. Reads more precisely (the
warning sits next to the thing it explains) but requires the two-column
grid to reserve space for a banner that may or may not be showing, and
disagrees with the component's own current behavior, which never scoped
this to Access even when Access was a distinct step.

**Recommendation: Option A.** It costs nothing to build (the component
already renders it this way; only the width cap changes) and it already
answers questions Option B raises for free: a notice that spans the
panel reads correctly whether the credential it is about is missing from
General, Topology or Access, in the odd case a future field also gains a
missing-input case worth flagging this way.

### 2. Create versus edit

**Option A: no difference.** A create-time draft (no `id` yet) renders
the same screen, blank fields, and the Access column shows the plain
Password/Private-key picker with no stored-credential note, since
`credential_id.is_some()` is trivially false for a draft that has never
been saved. This is what "one screen, not two components" (ADR-0052's
own framing, "the maintainer's own ask... built from fields that already
exist") already implies without a special case.

**Option B: hide Forwarding for a draft**, since a host with no `id` yet
has nowhere to persist a forward against. Real, but scoped to
`Forward`/ADR-0054 rather than to this decision: whether Forwarding
shows an empty state or is hidden outright for a draft is #301's own
call (session storage), not a reason to split the create and edit
layouts here.

**Recommendation: Option A.** Named narrowly: Forwarding's own
draft-vs-saved behavior is out of scope for this document and belongs to
whichever of #301-305 implements it.

### 3. What happens to ADR-0030, ADR-0032 and ADR-0034

**ADR-0030** ("Test a host from its own editor tab"): already
`Superseded by ADR-0034`. Nothing here changes that; the chain a reader
follows (0030 → 0034 → this document) already exists and does not need a
second pointer.

**ADR-0032** ("Collect the wizard's own test credential inline"): its
decision is that Access types a credential inline, uncontrolled, read
once via `FormData`, authenticated through `authenticate_session`
directly rather than through a separate window, and that the guarantee
this relies on (`workspace === 'sessions'` is the only thing that mounts
a terminal) is asserted by `tests/no-terminal-in-home.test.ts`. None of
that is about step count, a breadcrumb, or navigation. Merging Host and
Access into two columns on one screen changes neither the input's own
mechanism nor the guard it depends on. **No change**, not even a
clause: this document does not touch ADR-0032.

**ADR-0034** ("The wizard is the only way a host gets credentials"): its
core decision, the wizard is the only path to set or fix a credential,
no separate window, no `Never` tier, every reopen retests unless
ADR-0036's fields match, is untouched by this document. One clause is
not: its own Follow-up states, as still true at the time it was written,
*"Host and Access remain two real, navigable steps."* This document
makes that false. **Amend, not supersede**: the same distinction
ADR-0052 drew for ADR-0029/ADR-0046 applies here. The specific clause
about step navigation is revised in place, and everything else ADR-0034
decided stands. What replaces it: reaching Access, the trigger for
`proving`/`onTest` today, is what a step transition into `step === 2`
currently means; on one screen, the corresponding moment is **the editor
mounting on an existing host** (the equivalent of "arriving at Access"
when Access is always visible rather than reached). This is the shape
of the change; the exact code (whether it is a mount effect, a changed
condition on the existing `useEffect`, or something else) is #297's own
implementation decision, not this document's.

## Decision

Options A/A above, ADR-0032 untouched, ADR-0034 amended in place for the
one clause named. Concretely, for #297 to build from:

- The missing-credential notice renders once, at the top of the detail
  panel, above the two-column row, full panel width. It is not owned by
  either column.
- A create-time draft and an existing host render the same layout. The
  only difference is which fields start blank and whether Access shows
  the stored-credential note, both already driven by data that exists
  (`values`, `credential_id.is_some()`), not by a structural fork.
- ADR-0034's "Host and Access remain two real, navigable steps" clause is
  superseded by: Host (General/Topology) and Access render as two
  columns on one screen; reaching Access is no longer a step transition,
  it is the screen existing at all, so whatever currently fires on
  `step === 2` fires on mount for an existing host instead. Everything
  else ADR-0034 decided (wizard-only credential path, no window, no
  `Never` tier, ADR-0036's skip-when-unchanged rule) is unchanged.
- **#300 is not fixed by this document**, and is not expected to be.
  The bug lives in `editorOpenedFor`/`resumeId`/`sftpConnectTargets`
  bookkeeping, which this document does not touch: neither where the
  notice renders nor merging two steps into two columns reads or writes
  any of that state. #300 stays open, to be worked through the
  diagnosing-bugs loop as its own issue, independent of #297.

## Consequences

**Good**: #297 has a concrete answer for all three questions ADR-0052
deferred, none of which required inventing new mechanism: the notice
keeps the placement it already has, the create/edit question resolves to
"no special case," and only one clause of one ADR needed revising rather
than a new document reopening ADR-0034 wholesale.

**Bad**: the "reaching Access" trigger loses the one signal
(`step === 2`) it used to key off entirely. A mount-based equivalent has
to be careful about the exact case ADR-0034's own useEffect comment
worried about, refiring on an unrelated re-render, without a step
transition to lean on as the fire-once guard. This is named as a real
implementation risk for #297, not solved here.

**Bad**: leaving #300 unresolved means #297 ships with a known,
previously-filed bug still live in the mechanism it is restructuring.
Restructuring `finishWizard`'s call site is a natural moment to also fix
#300, and #297's own issue text already says as much; this document
does not assume that will happen as a side effect, since the actual
defect (an id or a map entry not surviving the round trip) has not been
isolated yet.

**Follow-up**: #297 draws the new notice placement and the merged
create/edit layout into `design/canvas/gen.py` before implementing,
per the canvas-first rule; `HomeBookProposal.dc.html` does not show the
notice today and needs it added as part of that pass, not assumed to
already be there. #300 stays a separate issue, worth attempting
alongside #297 since the code it touches is the same, but not a
precondition for #297 to ship.
