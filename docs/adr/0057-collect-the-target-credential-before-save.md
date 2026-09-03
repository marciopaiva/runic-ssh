# ADR-0057: Collect the target's own credential before Save, not after

* **Status**: Accepted
* **Date**: 2026-09-03

## Context

ADR-0032 moved the wizard's own test credential off the separate window and
onto an inline field, `InlineCredentialForm.tsx`. That field only ever
renders after Save: General, Topology and Access all disappear behind a
`{!proving && (...)}` gate the instant Save is clicked, and the field this
document is about appears afterward, once the host key has settled, inside
a fresh block conditioned on `inlineCredential !== null`
(`SessionWizard.tsx`). For a brand-new host, or an existing one with nothing
saved, that is the first and only place the field appears at all: the Access
section itself shows the Password/Private key tabs and, until #327 added a
line saying so, nothing explaining that a field was coming.

Reported directly, live: "porque nao posso informar a senha ou chave no
form principal de cadastro e fazer a autenticação e validação ao clicar em
salvar?" ("why can't I enter the password or key in the main form and have
it authenticate on save?"). The instinct is right and the constraint it
runs into is real, but they are not the same constraint. Section 7 rule 3
of `CLAUDE.md` says a host key is verified before a credential is used
against it: that is about *when a secret is sent*, and it is
non-negotiable. It says nothing about *where the input for that secret is
allowed to render*, which is a UI sequencing choice ADR-0032 happened to
make the same way, not a rule it was following.

**Whether a credential field may share a document with the rest of the
wizard at all is already decided, separately, and does not depend on when
in the flow the field appears.** ADR-0055, three days before this one,
looked at exactly that question: `InlineCredentialForm.tsx`'s field lost
its own webview when ADR-0039 retired the credential window, so it now sits
in the same document, the same JavaScript realm, as everything else the
main webview ever renders, including a remote host's own terminal output at
some other point in that document's life. ADR-0055 accepted that gap on
the strength of the rest of the frontend's own hardening (a strict CSP, no
`dangerouslySetInnerHTML` anywhere in the tree, `xterm.js` treating remote
output as data rather than markup), not on the strength of *which moment*
the field happens to render at. Moving the same field earlier in the same
document's own lifecycle does not reopen that acceptance; it is still the
same uncontrolled `<input>`, read once through `FormData`, in the same
already-evaluated document.

**What already makes this possible, unchanged since ADR-0032.**
`App.tsx` gates every mounted `TerminalView` behind `workspace ===
'sessions'`, a plain `&&`, not a hide-and-keep the way tabs within Sessions
work (ADR-0014). The moment `workspace` becomes `'home'`, every terminal
unmounts and disposes. Nothing decodes a remote host's bytes while Home,
where the wizard lives, is on screen. ADR-0032 built exactly one thing on
top of that fact: a field rendered *after* Save. Nothing about the fact
itself is scoped to that one moment; it holds for the whole time Home is
showing, Access section included, before Save exactly as much as after.

**Where the field currently lives is the actual point of friction.**
`connectSession` (the Rust command) already returns an open,
not-yet-authenticated handle for a direct target, before anything asks for
a credential. That seam is what let ADR-0032 move authentication to a
separate step in the first place. What it did not have to be is a separate
*screen*: the host key check and the credential's own use can still happen
in that order, with the secret typed earlier and simply held until the
handle is ready for it.

## Options considered

### Option A: read the field synchronously at Save, carry it as a plain argument

The Access section gains the same uncontrolled password/private-key/
passphrase fields `InlineCredentialForm.tsx` renders today, shown exactly
when neither a stored nor a kept credential already exists for this host
(the same condition `session.editor.credential.none`'s hint currently
covers, per #327: the hint is replaced by the fields it was standing in
for).

`startProving()` reads those fields the same way `InlineCredentialForm`'s
own `submit` handler already does, `FormData` off a ref at the moment of
the click, into a `Secret | null`. `null` exactly when a stored or kept
credential already covers this host, since then there is nothing to read
and `authenticateWithSaved` is used exactly as today. This travels forward
as a plain function argument, never `useState`, never a component prop:
`onTest(method, secret)` down through `App.tsx`'s wiring into
`useConnect`'s `connect`/`attemptConnect`. Once the connection to the
target itself opens (after the host key is confirmed, and after a bastion's
own credential if one is needed, which is a different host's secret and
unaffected by any of this), `attemptConnect`'s `authenticate()` calls
`authenticateSession(handle, secret)` immediately instead of pausing in
`awaitingInline` to wait for a second screen.

**Cost**: `authenticate()`'s `intent === 'inline'` branch carries an
optional `Secret` through more of the call chain than it does today, even
though it is never state at any point along it. The separate Sign In step
disappears for the target's own credential; "Back" and "Test again" on a
failed attempt become the same action (return to the form, retype),
since there is no longer a credential-only step to redo blank. Not a
regression on its own, since `InlineCredentialForm` already reset blank on
every retry today, but a visible behavior change worth naming rather than
letting happen by accident. **Forecloses**: nothing that ADR-0033's bastion
flow needs; that path is untouched (see Decision).

### Option B: make the pre-save field optional, keep the post-save prompt as a fallback

Same field in Access, but leaving it blank does not block Save: the wizard
falls back to today's post-save `InlineCredentialForm` exactly as it works
now, only skipping it when the pre-save field was actually filled in.

**Cost**: two sub-flows for one screen, filled and blank, each needing its
own reasoning and its own test coverage, for a form that is trying to
answer "when is a credential asked for" more clearly, not less. The
maintainer's own report was about that question reading as unclear once;
answering it with two possible answers depending on unseen history does not
close it. **Forecloses**: nothing technically, but is the shape most likely
to be reported as the same confusion again, from the other direction.

### Option C: scope the change to brand-new hosts only

Give a `{kind: 'new'}` target the field in Access; leave an existing host
with nothing stored on today's post-save flow, since that was not the case
that prompted the report.

**Cost**: exactly the asymmetry CLAUDE.md's own philosophy asks not to
introduce, a form that behaves differently depending on history nothing on
screen shows. It also does not fully answer the report: forgetting a
credential and reopening an existing host (#326's own delete-confirmation
work made forgetting one easier to do on purpose) would still hit the
flow the maintainer already called strange.

## Decision

Option A, confirmed directly with the maintainer after Options B and C were
named and their costs explained.

**Explicitly out of scope, named rather than merely implied**: a bastion's
own credential, asked for mid-chain when one is needed (ADR-0033). That
secret belongs to a different saved host than the one open in this editor;
there is no Access section for it to be collected ahead of time in. Its
`InlineCredentialForm` rendering, `bastionCredential`, `awaitingBastionCredential`,
`ask_inline`, `credential_prompt`, `submit_credential` and
`CredentialRequests` on the Rust side are all untouched.

**What this deletes**, the same way ADR-0039 named its own removals rather
than letting them happen silently: `submitInlineCredential` in
`use-connect.ts`, the `awaitingInline` stage's rendering path in
`SessionWizard.tsx`, and `InlineCredentialForm`'s own `method`-fixed
(target) rendering mode all lose their only caller for the target's own
credential and are removed. `InlineCredentialForm` itself stays, narrowed
to the bastion's `method: null` mode, its only remaining caller.

**How rule 3 stays airtight**: nothing about *when the secret is used*
changes. The host key is still checked before `authenticate_session` is
ever called; a captured `Secret` sitting in a promise chain's own closure,
unused, while an unknown-key card waits on the user, is no different in
kind from `Credential` already sitting in an in-flight Rust future's own
stack while `connect_reporting` resolves the key first, on the other side
of the same IPC boundary. What changes is only *when the user types it and
it is captured*, which is a UI sequencing question, not this rule's.

## Consequences

**Good**: the common case, a host key already known, collapses from
Save → host key card → Sign In card → connected into Save → connected, with
one field in the place a user's eye already goes rather than a second
screen. No new premise about document isolation is introduced; this reuses
ADR-0032's and ADR-0055's already-accepted ones rather than asking for a
new acceptance.

**Bad**: `attemptConnect`/`authenticate()`'s `intent === 'inline'` branch
gets a real added parameter and a real added branch, carrying an optional
secret further than it travelled before, even though it is never state.
`InlineCredentialForm` and the `awaitingInline` machinery now serve only
the bastion case, which is less symmetric than today's "every inline
credential goes through the same component" shape. A reader has to know
which of two mechanisms applies, target or bastion, where one sufficed
before. The Back/Test-again merge is a real, visible behavior change, not
only an implementation detail.

**Follow-up**: the exact copy and label for retrying a failed attempt, now
that Back and Test again collapse toward one action, is Phase 3's decision,
not this document's. Whether `SECURITY_COPY_KEYS` needs new entries for
whatever locale keys this introduces or retires is a Phase 4 checklist
item, not assumed here. `docs/security-model.md`'s Rule 1, which already
describes the field as living in "the host editor's own Access column,"
becomes literally true of the screen rather than only true of the
document it shares; worth a light pass once implemented, not a rewrite.
