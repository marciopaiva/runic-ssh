# ADR-0034: The wizard is the only way a host gets credentials

* **Status**: Accepted
* **Date**: 2026-08-29

## Context

ADR-0030 split host management in two: `SessionWizard` walks a *new* host
through three moments (host, access, test), and an *existing* host is edited
on `SessionForm`/`SessionEditorPanel`, a single page with a "save & test"
button that opens the credential window (`CredentialWindow.tsx`,
`authenticateInteractively`, intent `'credential'`). ADR-0032 and ADR-0033
then moved the wizard's own test off that window entirely — the target's
secret and, when there is one, the bastion's, are both typed inline, on the
wizard's own step 3, authenticated directly against the connection already
open. None of that touched the plain form's own button, which still opens the
window exactly as it did before ADR-0032 existed.

That step 3 no longer waits for a click either. It used to offer "Test now"
beside "Finish without testing"; both are gone from the running tree now —
reaching step 3 starts the attempt itself, and finishing the wizard without
proving the host works is no longer offered. That change (made earlier in
this same working session, never itself recorded) is folded into this
document rather than written up on its own, because it is a precondition for
what follows: a step that already runs itself is a step that can be shared
between two callers without either of them clicking anything extra.

Two gaps followed from driving this end to end.

**The credential a test proves is usually not kept.** `InlineCredentialForm`
offers three tiers — never, for this run, or the system keychain — and
starts on "never" every time. `connect.ts`'s `shouldTrySaved` already makes
an ordinary connect from Sessions try a saved credential silently before
asking for anything; that machinery already delivers "connect without being
asked again" once a credential is actually stored. The gap is not there. It
is that finishing the wizard, the ordinary way, leaves nothing stored unless
the person running it happens to notice the third radio button and pick it
on purpose.

**An existing host's credential is a second, older experience.** A new host
proves itself inline, on screen, in the same document. An existing host's
"save & test" still hands the whole thing to a separate window —
`CredentialWindow.tsx`, its own bundle, its own tab order, the thing ADR-0008
put in isolation from a terminal's raw bytes and ADR-0032 found unnecessary
for the wizard's own case. Registering a host and fixing a typo'd password on
one already saved are the same kind of action — prove a credential, keep it —
happening through two different mechanisms for no reason tied to what either
one is doing.

The maintainer's own framing, put plainly mid-session: the wizard should be
the one place a host's credentials get set, and once that has happened,
Sessions should never have to ask again. Confirmed twice, directly: always
write to the keychain when one exists, no three-way choice in the wizard; and
the wizard is the only path for both creating a host and altering one,
including its credential, retiring the single-page form as a path rather than
only as a default.

## Options considered

### Option A: leave the split as ADR-0030 made it

`SessionWizard` for a new host, `SessionForm` for an existing one, the
three-tier choice unchanged everywhere. Cheapest — nothing here needs to
move — and it is what is actually running today. It does not answer what was
asked: finishing either path still defaults to nothing kept, and an existing
host's credential still goes through a window the new one's does not.

### Option B: change the default, keep both surfaces

`InlineCredentialForm` starts on "system keychain" instead of "never," in the
wizard specifically. The plain form's "save & test" is quietly pointed at the
same inline mechanism instead of the window, so the two paths agree on how a
secret gets typed. Both surfaces keep existing — the wizard for a new host,
the plain form for editing one — and the three-way choice survives as an
opt-out for whoever wants a host's credential to not be persisted.

This was the recommendation offered before the maintainer chose otherwise. It
delivers "Sessions asks nothing once you have finished" for the path most
people take, without removing the escape hatch a shared machine or a
throwaway test host has a real reason to want. What it does not deliver is a
single path: a host would still be creatable and editable in two different
places, one of them a three-step wizard and the other a page that skips the
questions the wizard asks.

### Option C: the wizard is the only path, keep-choice removed

Retire `SessionForm` and `SessionEditorPanel` as the way a host is created or
altered. `SessionWizard` opens for both a `new` target and an `existing` one,
pre-filled from the saved session when there is one. `InlineCredentialForm`
stops offering a choice at all: it writes to the keychain when
`Vault::availability()` says `Available`, and falls back to `ForThisRun` —
not `Never` — with a stated reason, when it says `Unavailable`. `Never` is
gone as a reachable outcome from this path entirely; a credential is either
kept for good or kept for the run that just proved it, never discarded on
success.

## Decision

Option C, with two rules that were not themselves handed down and had to be
decided here.

**Opening an existing host in the wizard runs the proof-and-store phase every
time, the same as a new one.** No condition on what changed: renaming a host,
moving it to a different group, or reopening it to change nothing at all
still ends on step 2 leading into a live connection attempt. This was
weighed against only re-testing when something that could invalidate the
stored credential actually changed — host, port, user, or method — and the
maintainer chose the simpler rule directly: step 2 always leads to a test,
full stop, rather than the wizard silently deciding for itself which edits
count as safe. The cost is a real connection attempt on every reopen, even
one that only touches a label; the benefit is one rule instead of a
conditional a reader has to trust was reasoned correctly.

**The credential window is not deleted. It stops being reachable from here.**
`authenticateInteractively` is not only `savePasswordIn`'s call — it is what
an *ordinary* connect from Sessions falls back to (`use-connect.ts:254`) when
nothing usable is saved: a session imported before this decision existed, a
keychain entry removed by something outside the application, or a `for this
run` credential that did not survive the process closing. That fallback is
untouched by this document; `CredentialWindow.tsx`, `credential.html`, and
`authenticateInteractively` all stay exactly as built. What ends is
`savePasswordIn`, the intent `'credential'`, and every call site that opened
that window as a way to *set* a credential rather than to recover from one
that is missing. `SessionForm` and `SessionEditorPanel` are deleted outright
rather than kept dark: nothing else renders them once the wizard opens for
both targets, and a component nothing calls is a maintenance cost with no
offsetting reason to keep reading it.

`ConnectIntent`'s `'credential'` variant is removed; every caller that
collected a credential without opening a terminal now does it through
`'inline'`, which already exists and already ends the same way — the
connection closes once the secret is proven or refused. `'inline'` stops
being a wizard-only concept in the type's own documentation, because it no
longer is one.

## Consequences

**Good**: one mechanism proves and stores a credential, used by both
creating a host and fixing one already saved, and it is the one ADR-0032 and
ADR-0033 already built — nothing about *how* a secret is collected changes,
only who is allowed to reach it and what the common case ends with. Finishing
the wizard the ordinary way, with no extra click and no radio button to
remember, is what makes a host usable from Sessions with nothing asked again,
which is the whole thing that was asked for.

**Bad**: a host with no working credential and no keychain available now has
no way to be marked "connect anyway, ask me every time" as a deliberate,
permanent choice — the removed `Never` tier. Someone testing a throwaway
box, or on a shared machine where persisting a password is the wrong call,
loses that as an option specifically inside the wizard. `ForThisRun` softens
this when there is no vault at all, but when there is one, the wizard now
assumes persistence is always wanted. This is the tradeoff the maintainer
named directly rather than one this document is choosing quietly.

**Bad**: `SessionForm.tsx`, `SessionEditorPanel.tsx`, and `savePasswordIn`
are deleted, and every test written against them goes with them —
`tests/session-editor-state.test.ts` and pieces of `tests/connect-flow.test.ts`
in particular need rewriting against the wizard's own editors rather than
retired.

**Bad**: opening an already-working host to rename it, or to move it to a
different group, now runs a real connection attempt it did not need. This is
the direct cost of the rule chosen above over the one weighed against it —
every reopen means a live attempt, whatever the reason it was opened for,
and the maintainer's own reasoning for accepting that is worth repeating so a
future reader does not simply patch it back to a conditional: one rule, no
special case a reader has to trust was reasoned correctly.

**Bad**: `CredentialWindow.tsx` now exists for exactly one caller — Sessions'
own fallback when nothing is saved — down from two. A reader has to know
that the window's continued existence is about recovering from a missing
credential, not about how one is normally set, or the code reads like a path
nobody deliberately chose to keep.

**Follow-up**: `SessionWizard`'s own step model changes shape as part of
this — Host and Access remain two real, navigable steps, and what follows is
no longer drawn as a third step with its own breadcrumb entry, since it
already runs itself and now runs for both an editing and a creating host.
That redraw is implementation, not a separate decision, and belongs to
Phase 3 of the change this ADR authorizes, not to this document. Revisit the
removed `Never` tier if a real request for a permanently-unstored credential
surfaces after this ships; this document did not find that need hypothetical
enough to keep the option for, but it also did not find it impossible.

---

Supersedes ADR-0030's split between a wizard for a new host and a plain form
for an existing one. ADR-0030's own text is left as written, including the
parts this document changes, because it is the record of what was decided
before this one and why — see that document's Decision and Consequences
sections for the reasoning this one moved past. ADR-0032 and ADR-0033 are not
superseded: the inline collection mechanism both established is exactly what
this document extends to a second caller, unchanged in how it works.
