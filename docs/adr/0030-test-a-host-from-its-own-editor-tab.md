# ADR-0030: Test a host from its own editor tab

* **Status**: Superseded by ADR-0034
* **Date**: 2026-08-29

## Context

Registering a host is offline on purpose. `config/sessions.rs` says so directly:
a session names a host, not a way into it, and `SessionDraft` has no field a
secret could reach. Nothing about a host is checked against the network at
save time.

A host key can only be verified by actually opening a connection to it, and
the same is true of a credential: the client has no way to know a password is
right without a server saying so. Both live inside the real connect path
(`ssh/connection.rs`, `ssh/trust.rs`), which is where they have to live.

A way to run that check from the editor already exists, and mostly works. The
"save & test" button on `SessionForm` (`onSavePassword`, threaded through
`savePasswordIn` in `App.tsx:991`) saves the draft and then calls
`connect(id, 'credential')`. `connect.ts` names exactly the sequence this ADR
cares about: a host key decision always comes before a credential, and the
`'credential'` intent closes the connection the moment the server accepts
rather than leaving an authenticated session open behind a form nobody asked
to see one. `Keep` (never, for this run, stored) is still the user's own
choice, made in the credential window ADR-0008 put it in.

What that button does not have is anywhere to show its work while it works.
`attemptSurface` (`App.tsx:733`), the piece that renders the host key screens,
the connecting spinner and the settled confirmation, is mounted once, inside
the Sessions workspace's `<main>`, positioned over the group box of the
session it is about (`App.tsx:1476-1487`). There is no equivalent slot in
Home. So `savePasswordIn` has to call `setWorkspace('sessions')` and
`setFocus({ kind: 'session', sessionId })` before it connects, or the whole
sequence would run with nothing on screen to show it. The comment already
sitting on that function names the result: *"driving it showed the whole
sequence running in a tab nobody was looking at: the button appeared to do
nothing."* Somebody testing a host they are still registering is dropped out
of Home and into a Sessions tab to watch it happen, which is the same
disorientation ADR-0029 already fixed twice for other affordances leaking out
of the group model in the other direction.

ADR-0029 separated Home from Sessions precisely so Home would own chrome
shaped for what it actually does, instead of borrowing the terminal group
model. Its own follow-up section named the Home workspace's interior as
undecided. This is that: Home never got a place to show a connection attempt,
because nothing in Home has needed one before now.

A second gap sits next to it. Which kind of credential a host takes, a
password or a private key, is chosen only inside the dedicated credential
window, as local state (`CredentialWindow.tsx:46`, `Method = 'password' |
'key'`, seeded to `'password'` every time). Nothing upstream can tell it which
one is likely wanted. That value is not a secret; ADR-0008 and rule 6 of
`CLAUDE.md` are both about the password or passphrase itself, not about which
kind of credential a host uses. There is no rule against choosing it on the
plain form, only nowhere today that does.

This was first built as Option A below: the single-page form, unchanged in
shape, gained the method field and stopped switching workspace. It worked, and
running it was what surfaced the actual request: the maintainer's own framing
from the start of this conversation was *"nesse wizard o usuario já informaria
o tipo de autenticação... e o ultimo step poderia ser o teste antes de
concluir"*: an explicit sequence, not a single page that happens to have
grown a method field. Seeing Option A running was what made that gap legible;
the decision below is Option B, chosen after Option A shipped and was found
short of what was actually asked for.

## Options considered

### Option A: give Home its own attempt surface

Render `attemptSurface` (or a Home-scoped equivalent driven by the same
`ConnectStage`) inside the host's editor tab instead of inside a Sessions
group box, and stop `savePasswordIn` from switching workspace at all. The
sequence connect.ts already runs (host key decision, credential window,
settle) plays out without leaving Home. `SessionForm` gains a plain,
non-secret method selector (password or private key), and `CredentialPrompt`
gains an optional field the credential window uses to seed its own `Method`
state instead of always starting on `'password'`.

Cost: `attemptSurface`'s positioning today is derived from a session's group
box (`attemptBox`), which has no meaning for an editor tab; a Home-scoped
variant has to be built next to it rather than reused outright. `App.tsx` is
already named as overdue for a split (ADR-0017's Bad section, ADR-0029's
follow-up); this adds one more seam to that split rather than removing one.
`CredentialPrompt` grows a field, which is an addition to the IPC contract,
not a break: an older frontend build still constructs a well-formed prompt
without it.

### Option B: a step wizard (host, then auth, then test)

Replace the single-page form with an explicit sequence for a **new** host:
host details, then the method choice, then the test, each its own step with
its own forward and back controls. Editing an existing host keeps the
single-page form exactly as Option A built it: there is no unsaved sequence
to walk through for a host every field of which is already filled in, and a
wizard that immediately shows three steps of already-true answers is not
doing the job a wizard is for.

It needs everywhere Option A needs: the attempt still has to render inside
Home, and the method field is still chosen outside the credential window. So
it carries Option A's whole cost and adds step state (which step a draft is
on, kept alongside the draft itself so switching to look at another host and
back does not lose it), forward and back navigation, and a second component
that draws a new host differently from an existing one. What it buys over
Option A is the shape the maintainer actually asked for: register, choose how
you will authenticate, then prove it works, as three distinct moments rather
than one form with a button at the bottom.

### Option C: leave the jump, only announce it

Keep `savePasswordIn` exactly as it is and add a message that says a test is
about to switch views, so the jump is explained rather than silent.

Cheapest, and it does not touch `App.tsx`'s split-off attempt surface at all.
It also does not fix anything: the workspace still changes under someone who
was in the middle of registering a host, which is the actual problem, not its
absence of warning.

## Decision

Option B, on top of Option A, and the method field with both.

Option A's attempt surface and method field are not undone. Option B needs
both and reuses them exactly as built. What changes is what wraps a *new*
host: three steps (host details, then authentication method, then an
optional test) instead of one page. An existing host keeps the plain form,
because the question a wizard answers, what do I fill in next, has no
content once every field already holds a true answer.

The reason is not a property of the code; it is that Option A, once running,
was short of what was asked for. The maintainer's own description of the
feature, given before any of this was built, was already a sequence: host,
then how you will get in, then prove it. And a single page with a button at
the bottom is a different shape even when it does the same work underneath.
Building Option A first was not wasted: it is the state machine, the
attempt-surface plumbing and the method field that Option B's steps 1 and 2
are drawn from, and none of that is rebuilt.

The test step (step 3) stays exactly as the earlier conversation settled it:
skippable. "Concluir sem testar" saves the host and closes the wizard without
connecting, the same ending the plain form's Save button has always had.
"Testar agora" saves, connects, and renders the same attempt surface Option A
built, inline in the step. Once the attempt is dismissed, settled, failed,
or cancelled, a "Concluir" action closes the wizard; the host is already on
disk by then, so this does not save it again.

## Consequences

**Good**: registering a host now reads the way it was described from the
start: three moments, not one form, while the mechanics underneath (host
key first, credential window second, nothing kept until the server accepts)
are exactly what `connect.ts` already guaranteed and Option A already surfaced
inside Home. The method field removes the same friction it removed under
Option A, now chosen a step earlier and on its own screen rather than beside
the test button.

**Bad**: a new host and an existing one are now drawn by two different
components (`SessionWizard` and `SessionEditorPanel`), sharing field-level
pieces (`HostFields`, the method picker) but not the surrounding chrome. A
change to a shared field still touches one place; a change to navigation or
layout now touches two.

**Bad**: which step a draft is on has to survive being looked away from and
back. Home has one rectangle, and switching to look at a different host
unmounts whichever editor was showing. This document accepts keeping the step
number on the draft itself (`OpenEditor`, alongside the values and the
baseline) rather than only in component state, which is one more field two
functions (`withEditor`, `settled`) have to carry through correctly.

**Bad**: everything Option A's own Bad section named still holds:
`attemptSurface` is two call sites now, and `CredentialPrompt` carries a field
one caller uses. Neither is made worse by wrapping the same surface in steps;
neither is made better either.

**Follow-up**: split `App.tsx` along the seam this creates, on top of the ones
ADR-0017 and ADR-0029 already named: now two components' worth of editor
wiring rather than one. Decide whether the chosen method persists across an
abandoned-and-reopened draft or resets every time; this document assumes the
latter, matching `CredentialWindow`'s own always-fresh default. Revisit the
`CredentialPrompt` field's placement if a second caller needs to suggest a
method for a different reason than "the wizard's own step 2 just asked."
ADR-0031 records the host-kind field the maintainer asked to have added to
step 1 while this document was being revised, so a reader of `SessionWizard`
is not left wondering why a categorisation field showed up in an ADR about
testing a connection.
