# ADR-0058: Report a failed test inline, not as a card

* **Status**: Accepted
* **Date**: 2026-09-03

## Context

ADR-0057 moved the target's own credential field into the Access section,
read at Save rather than asked for afterward. It left the ending of a test
untouched: clicking Save still swapped the whole editor, General, Topology,
Access and Forwarding all at once, for a full-screen sequence of its own,
`ConnectingSurface` while the attempt was in flight, then `CredentialSaved`
or `ConnectionFailure` once it settled, then a generic Back/Test again/
Finish row once that card was dismissed. A follow-up fix (undocumented,
since it stayed inside what ADR-0057 already covered) later made a
*successful* test skip that ending outright: the wizard closes itself the
instant `authenticate_session` accepts the credential, with nothing left to
dismiss.

Reported live, directly, against a wrong password: "quando informo a senha
errada ele nao valida e continua na mesma pagina, mostrando que o campo de
senha esta errado. Eu acho que tinhamos combinado de nao usar o componente
wizard, era para o processo de form comum com validações no backend de
forma assíncrona" ("when I type the wrong password it doesn't validate and
stay on the same page, showing that the password field is wrong; I thought
we'd agreed not to use the wizard component, it was supposed to be an
ordinary form process with backend validation happening asynchronously").
No such agreement is on record in this repository; what is real is the gap
the report names. A failed test is exactly the case the full-screen swap
never stopped doing: `ConnectionFailure` still opened its own card in place
of the form, and dismissing it still needed a second click (Back or
Finish) before the form came back at all.

**What "an ordinary form" already means elsewhere in this editor.** A
duplicate host, an empty required field, an unreachable jump host: none of
these hide General/Topology/Access to say so. `wrongHostFields` marks the
one field that is wrong, in place, and Save simply runs again once it is
fixed. A wrong password is the same shape of problem, an input the backend
rejected, arriving one round trip later than the others because reaching an
SSH server takes longer than reading a string, not because it is a
different kind of failure.

**What is not the same shape.** A host key decision (unknown, changed,
revoked, certificate-required) and a bastion's own mid-chain credential
(ADR-0033) are not validation errors on a field; they are decisions nobody
but the user can make, with their own dedicated screens (`HostKeyPrompt`,
`HostKeyBlocked`, `HostKeyRefused`, `InlineCredentialForm`) that this ADR
does not touch the content of.

## Options considered

### Option A: keep the full-screen swap, only skip it on success

The state already shipped: success closes the wizard outright; a host key
decision, a bastion prompt, or a failure still hide the form and show a
card in its place, with Back/Finish once the card is dismissed.

**Cost**: does not answer the report. A wrong password still opens a
different screen and still takes two clicks (dismiss the card, then decide
Back or Finish) to get back to a form that could have just stayed where it
was.

### Option B: report every ending inline, including host key and bastion

Flatten host key decisions and the bastion's own field into the same
"field is wrong" treatment a credential failure gets.

**Cost**: a host key decision is not a value the user typed; there is no
field to mark, and no correction to make by fixing an input. Rendering a
trust/cancel decision as though it were validation would understate what
accepting a changed key actually commits to (CLAUDE.md section 7 rule 3).
The bastion's own credential is a different host's secret entirely,
InlineCredentialForm's own reason for existing (ADR-0033); folding it into
Access's error styling would blur whose field it actually is.

### Option C: the form stays mounted throughout; only the ending changes shape

General, Topology, Access and Forwarding render unconditionally, never
swapped out. A host key decision or a bastion's own field appears inline,
above the form, in the same banner slot `missingCredential`/`problem`
already use, since answering either is still a real, undodgeable decision
that needs its own space, just not the whole page. A failed credential
test appears next to the field it is about, inside Access, the same
red-bordered treatment `HostGeneralFields` already gives a duplicate host,
and Save re-enables as the retry. Save, Cancel and Delete are held
(disabled) only while a decision is actually pending or a network round
trip is actually in flight, read fresh off the live attempt each render
rather than off anything that could lag behind it.

**Cost**: `testSurface`'s own failed-and-settled endings, previously two of
the four states it rendered, move out of it entirely; a new `testFailure`
prop carries the raw code and hop instead, so this component can put the
message next to the field rather than in a card of `attemptSurface`'s own
choosing. The retry has to re-arm the same effect that fired the first
attempt (`attempted` reset to `false` in `startProving`), where before a
fresh Save always started from a clean, just-mounted state. A brief gap
between clicking Save and the new attempt actually reaching Rust's
`connect_session` is not reflected in the disabled state; a second click
landing in it is superseded cleanly by `useConnect`'s own generation
counter, the same protection a stray double click anywhere else in the
app already relies on, so nothing is unsafe about the gap, only imprecise
about when the button visibly re-enables.

## Decision

Option C. The form is the one surface this editor has, and a value it
rejected belongs next to that value, not on a different screen entirely.
A host key decision and a bastion's own field keep their existing content
and their own dedicated space, inline rather than full-screen, because
both are still asking the user to decide something a red border under a
password field cannot ask.

**What this deletes**: `CredentialSaved.tsx` (already gone, no caller since
the auto-close fix); the `{!proving} / {proving}` render switch in
`SessionWizard.tsx`; the `phase` label above the old swap
(`wizard.phase.bastion`, now dead, removed with it); the Back/Test
again/Finish row for a failed attempt and its `onFinish` prop, replaced by
the persistent form's own Cancel and Save; `wizard.back`, `wizard.finish`
and `wizard.result.failed`, the locale keys that row alone used.

**What this keeps**: `HostKeyPrompt`, `HostKeyBlocked`, `HostKeyRefused`,
`ConnectingSurface` and `InlineCredentialForm` render exactly the content
they always did, only repositioned; `attemptSurface` in `App.tsx` still
builds them for Sessions' own use unchanged. `describeFailure` is now
called from two places, `ConnectionFailure` for an ordinary session and
`SessionWizard` for a wizard-owned inline message, rather than from one.

## Consequences

**Good**: a wrong password behaves like every other field this editor
already validates, in place, correctable, no screen to leave and come
back from. The report's own words, "processo de form comum," are close to
literally what this is now.

**Bad**: `SessionWizard.tsx` grew a second failure-rendering path
(`describeFailure` called directly) alongside `ConnectionFailure`'s own,
which duplicates the title/body lookup rather than sharing a component;
acceptable since the two render into genuinely different shapes (a card
with actions versus a field-level line with none), but a future third
consumer of `describeFailure` is worth pausing on before adding a fourth
copy of the same lookup. The busy-state gap named in Option C's cost is a
real, if narrow, window where Save looks clickable a beat before it
actually is held.

**Follow-up**: no ADR or canvas artboard exists for the retired full-screen
states; the design canvas notes no gap here since none of them were ever
drawn there. Worth a canvas artboard for the new inline failure shape if a
design pass revisits Home's host editor again.
