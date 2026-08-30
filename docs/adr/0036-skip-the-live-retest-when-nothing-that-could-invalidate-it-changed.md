# ADR-0036: Skip the live retest when nothing that could invalidate it changed

* **Status**: Accepted
* **Date**: 2026-08-29

## Context

ADR-0034, written earlier the same day, decided that opening an existing host
in the wizard runs the proof-and-store phase every time, with no condition on
what changed. That document weighed the alternative directly: only re-test
when something that could invalidate the stored credential actually changed,
host, port, user, or method. It rejected that alternative on purpose, in the
maintainer's own words: "step 2 always leads to a test, full stop, rather than
the wizard silently deciding for itself which edits count as safe... one rule
instead of a conditional a reader has to trust was reasoned correctly." Its
own Follow-up section named the risk directly: a future reader "simply
patch[ing] it back to a conditional."

This document is that patch, and it exists because the concrete cost ADR-0034
accepted showed up immediately: the maintainer opened a host named `teste`
to fix its name, and the wizard ran a live SSH connection attempt to do it.
Asked directly whether that specific case should get its own screen instead,
the maintainer confirmed, having seen the ADR-0034 text quoted back at them:
the rule changes anyway.

Two things this document has to work with, unchanged since this morning:

**`Session` on disk has no field for which method authenticated it.**
`src/ipc/sessions.ts`'s `Session` interface carries `host`, `port`, `user`,
`group`, `credentialId` and `kind`, nothing that says password or private key.
`SessionWizard.tsx`'s own `method` state starts at `'password'` on every
mount, reopening included. Host, port and user are all comparable against
what is on disk; method, one of the four fields ADR-0034 named as
invalidating, is not. Making it comparable would mean adding it to the saved
format, which CLAUDE.md section 5 requires stopping to ask about on its own.

**The wizard already has a screen for "nothing left to prove."** The row that
renders once an attempt has settled, Back / Test again / Finish
(`SessionWizard.tsx`, the `attempted` branch), does not care whether the
attempt it is describing actually ran. Skipping the live test only has to
route into a state that branch already renders; it does not need a new one.

## Options considered

### Option A: leave ADR-0034's rule as it stands

Every reopen retests, full stop, exactly as decided this morning. Costs
nothing to keep. Does not answer the request: renaming `teste` still opens a
socket to it.

### Option B: compare host, port and user against the saved record

`wizardNext` (or the transition it drives) checks, only for an existing host
that already has a stored credential: do the draft's host, port and user
match the saved session's exactly? If they do, Access still saves whatever
changed, name, group, kind, through the same `save()` call, but does not
call `connect()`, and the wizard renders straight into the settled row
instead of starting an attempt. Name, group and kind never enter the
comparison; they are metadata, and no metadata field invalidates a
credential. Method is left out of the comparison for the reason above: it is
not recorded, and it is also moot here, because the case being skipped is
exactly the case where the stored credential is not being rewritten, so
which method would prove a new one never comes up.

### Option C: an explicit "Save without testing" button

Un-retire the button ADR-0034 recorded as deliberately removed ("used to
offer 'Test now' beside 'Finish without testing'; both are gone from the
running tree now"), so a person can opt out of the live attempt by hand each
time rather than have it detected for them. Smaller reversal in one sense,
larger in another: it brings back a choice ADR-0034 named as retired on
purpose, on every reopen, rather than only skipping the test when nothing
that matters changed.

## Decision

Option B. It is what was actually asked for, renaming a host should not open
a socket, and it costs nothing on the case ADR-0034 was actually worried
about: change the host, the port, or the user, and the wizard retests, every
time, with no way to opt out of that by only touching a label. The
conditional ADR-0034 rejected is back, but it is a narrow one, three fields,
compared against a record already on disk, not a judgment call about what
"safe" means.

This narrows ADR-0034's specific "always retests, no condition" rule and
nothing else in it. The wizard is still the only place a host's credential is
set; `InlineCredentialForm` still writes without offering a three-way choice;
`CredentialWindow` is still only Sessions' fallback for a credential that is
missing. ADR-0034's Decision section is annotated to point here rather than
rewritten, per this project's rule that a superseded decision stays legible
rather than disappearing.

## Consequences

**Good**: fixing a host's name or moving it to a different group no longer
opens a connection to prove something that did not change. The common case
this was asked about, and the wizard's own existing settled-row UI already
covers what it needs to show.

**Bad**: this is exactly the cost ADR-0034 spent effort avoiding. A future
reader now has to trust that "host, port, user unchanged" was the right line
to draw, rather than reading one rule with no exceptions. That trust is worth
less than it was this morning, because the line already moved once today.

**Bad**: method stays outside the comparison, on purpose, which means this
says nothing about the case ADR-0034 actually named as the reason to retest,
a changed method. That case does not reach this path at all: it is not
representable in the comparison, so it always falls through to a live test
the same as before. Nothing gets less safe; the gap is that this decision
cannot claim to have reasoned about method the way it reasoned about the
other three, only that method never needed reasoning about for the case
being skipped.

**Follow-up**: if a real need shows up to compare method too, for instance an
edit flow that lets someone declare "this host now uses a private key"
without retyping it, that needs `Session` to record which method last proved
it, which is a change to the on-disk format and its own migration, out of
scope here. Nothing in this document should be read as having decided that
question either way.

---

Narrows ADR-0034's rule that opening an existing host always runs a live
retest, with no condition on what changed. Everything else ADR-0034 decided,
the wizard as the only path, the removed three-way keep choice, the
credential window's demotion to a fallback, stands as written.
