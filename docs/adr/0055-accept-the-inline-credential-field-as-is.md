# ADR-0055: Accept the inline credential field as it is

* **Status**: Accepted
* **Date**: 2026-09-02

## Context

ADR-0008 put credential collection in a window of its own, a second
webview with its own document and its own script, so a script running in
the one that renders a remote host's output could never reach a password
field even if it existed. ADR-0032 and ADR-0034 moved collection onto the
wizard's own Access step for the ordinary case; ADR-0039 retired the
window entirely once nothing but an already-obsolete recovery path still
opened it. Read together, the three answer "where does credential
collection happen" and "how do we stop asking the user to see two
screens for one action," correctly reasoned about on their own terms.
None of them frames the change as a security decision, so the
document-isolation property ADR-0008 was built around became a casualty
of that sequence rather than something evaluated and accepted. Issue
#290 raised this directly during the v0.3.0 docs sweep, and `security-
model.md`'s own Rule 1 already states the gap plainly rather than
continuing to describe a window that no longer exists. Naming the gap
was a documentation fix; deciding whether it is acceptable is this ADR.

**What is actually true today.** The field is a plain, uncontrolled
`<input>` in `InlineCredentialForm.tsx`, read once through `FormData` at
submit, never bound to a React state value, the form reset immediately
after. That satisfies section 6 of `CLAUDE.md` (no secret in the render
tree) on its own terms, regardless of what document the field sits in.
What it does not have any more: the field shares its document with
everything else the main webview renders, including a remote host's own
terminal output. Before ADR-0039, an XSS anywhere else in that webview
could not reach this field, full stop, because it was a different
document. Today it could, if one existed.

## Options considered

### Option A: Accept the current defense as sufficient

Keep the uncontrolled `<input>`/`FormData` mechanism exactly as ADR-0039
left it. Name the trade explicitly as decided, in `security-model.md`,
rather than merely described.

**Cost**: the residual risk (an XSS elsewhere in the main document
reaching the credential field, if such an XSS existed at all) stays
real, not mitigated further. **Forecloses**: nothing; a stronger
mitigation remains available later if the rest of the picture below ever
stops holding.

### Option B: A sandboxed iframe for just the credential fields

Render `InlineCredentialForm` inside an `<iframe sandbox="...">`,
restrictive enough that a script in the parent document cannot reach the
fields it contains, without reintroducing a second webview, its own
bundle, its own capability file and its own test surface, which ADR-0039
removed for good reason.

**Cost**: real engineering the moment cross-frame communication is
needed (submitting the credential back to the parent, focus management,
styling parity with the rest of the wizard), for a browser-level
sandbox boundary that is a different, weaker isolation primitive than a
second Tauri webview ever was, not evaluated deeply enough here to say
it delivers an equivalent property. **Forecloses**: nothing on its own,
but is real, unscoped work for a risk the rest of this ADR argues is
already small.

### Option C: Bring back a window of its own

Restore ADR-0008's shape for the credential field alone.

**Cost**: exactly what ADR-0039 spent its own Consequences section
naming as a real, accepted cost of *not* doing this: a second bundle, a
second capability file, a second set of tests, for a project whose whole
pitch is being small and auditable. **Forecloses**: nothing technically,
but reverses a recent, deliberate decision without new information that
decision did not already have. Named to be set aside, not a real
contender: nothing has changed since ADR-0039 that makes the window's
own cost easier to carry now.

## Decision

Option A. The rest of the frontend's own hardening is what makes the
residual risk small enough to accept rather than small enough to ignore:
a strict CSP, no `dangerouslySetInnerHTML` anywhere in the tree, and
`xterm.js` treating a remote host's output as data to render, never as
markup the document parses. An XSS reaching the credential field
requires a script-execution vulnerability somewhere else in this webview
first, which is exactly the vulnerability class the CSP and the
no-`dangerouslySetInnerHTML` rule already exist to prevent at the
source. Isolating the field further would be defending the second step
of an attack whose first step the rest of the frontend already works to
refuse.

`docs/security-model.md`'s Rule 1 is revised to say this is decided, not
merely observed: the gap ADR-0039 left is accepted, named, and dated,
rather than continuing to read as a fact nobody chose.

## Consequences

**Good**: closes #290 without new engineering, and without reversing
ADR-0039's own small-and-auditable reasoning for retiring the second
webview. The decision is now attributable and dated, which is what
turns "nobody chose this" into "someone did, on this basis."

**Bad**: the residual risk named above is real and stays real. If the
frontend's other hardening (the CSP, the `dangerouslySetInnerHTML` rule,
`xterm.js`'s own treatment of remote output) ever changes in a way that
makes a script-execution vulnerability elsewhere in this webview more
likely, this decision's own premise weakens with it, and this ADR should
be revisited rather than assumed to still hold.

**Follow-up**: none scheduled. Revisit if the premise above changes, or
if a real XSS is ever found anywhere in this webview, at which point
whether it could have reached the credential field stops being
hypothetical.
