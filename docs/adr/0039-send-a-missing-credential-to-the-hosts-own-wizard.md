# ADR-0039: Send a missing credential to the host's own wizard

* **Status**: Accepted
* **Date**: 2026-08-30

Supersedes ADR-0008. Amends ADR-0033 and ADR-0034.

## Context

ADR-0008 put credential collection in a dedicated window because, at the time,
that was the only place a credential was ever collected: there was no host
management screen, and Sessions was the whole interface. ADR-0032 moved the
wizard's own test off that window. ADR-0033 did the same for a bastion crossed
mid-chain, but only for the wizard's own test (`chain.inline: true`); a chain
opened from Sessions still calls `ask()`, the window, exactly as before.
ADR-0034 made the wizard the only place a host is created or edited at all,
including its credential, and named the window's one remaining caller
directly: "an *ordinary* connect from Sessions falls back to
[`authenticateInteractively`] when nothing usable is saved... That fallback is
untouched by this document."

That was a deliberate choice, not an oversight, and it named real cases: a
session imported before this decision existed (#128, not yet built), a
keychain entry removed by something outside the application, a `for this run`
credential that did not survive a restart. Since then, #197 gave the editor a
way to ask what is actually held for a session, closing the one gap that made
the window's *information* better than the editor's: the editor no longer has
to guess from a stale field. The wizard is already the only place a credential
is set, on purpose, since ADR-0034. A window that exists only to *recover* one
that is missing is now asking the same question the wizard already answers,
through a second mechanism built for a version of this application that no
longer exists: one without a host management screen to send someone to.

The maintainer's framing, put plainly: a host managed by the wizard should
never need a separate login screen in Sessions again, and that includes a
bastion crossed mid-chain, which should authenticate through its own wizard
entry, not the window ADR-0033 still opens for it.

## Options considered

### Option A: redirect silently

Sessions notices a missing credential the same way it does today, and instead
of opening the window, switches to Home and opens the affected host's editor
on its Access step. Nothing explains why the screen changed.

Simplest to build. Cheapest on the eye and the most disorienting: someone
clicked a session and landed somewhere else entirely, with nothing on screen
saying that was expected.

### Option B: redirect, and say why

Same navigation, but the editor that opens carries a plain, dismissible
sentence explaining it: this host needs authenticating before Sessions can
connect to it. Structurally the same idea `editorFailed` already uses to tell
the editor about an action the core refused (#198), but its own state, not a
reuse of `EditorFailure`: nothing failed here, an action in a different part
of the interface (a connect attempt in Sessions) is why this editor opened
at all, which is not the shape `EditorFailure` describes.

### Option C: give Sessions its own affordance instead of navigating

The session's row shows a "needs authenticating" state with a button; nothing
moves until that button is clicked.

Less abrupt, and it puts a credential-shaped decision back in Sessions, which
is the exact surface this decision is trying to retire from that job. It also
adds a UI element to a part of the tree that is meant to be losing one, not
gaining a different one.

## Decision

Option B.

**The mechanism**: today, a missing credential is intercepted before it ever
reaches the caller, everywhere except the wizard's own inline test. That
interception is what opens the window. Removing only the interception, for
the caller that is not the wizard, is enough:

- The target's own case never needed the window to *find out* a credential is
  missing: `authenticateWithSaved` already fails with a typed code, and
  `shouldPromptAfterSaved` (`connect.ts:215`) already classifies which codes
  are worth prompting for. What changes is what happens next: instead of
  calling `authenticateInteractively`, the frontend navigates to that
  session's own editor. `authenticateInteractively` and `ask()` lose their
  only caller.
- The bastion's case is decided inside `open_bastion` (`sessions.rs:824`):
  `chain.inline` already tells it whether the caller is the wizard's own test.
  When it is not, the branch that calls `ask()` on a `worth_asking` failure is
  removed; the error is left to propagate the same way any other bastion
  failure already does, as `ChainFailed { hop: Bastion, .. }`. The frontend
  already has what it needs to find the bastion's own editor: the target
  session's `proxyJump` names it. No new field crosses the IPC boundary to
  carry that.

**What this deletes.** Once neither caller reaches `ask()`, the window has
none left: `CredentialWindow.tsx`, `credential.html`, `credential/main.tsx`,
`capabilities/credential.json`, the `credential` window in
`tauri.conf.json`, and `ask`, `open_window`, `CREDENTIAL_WINDOW`, `prompt_url`
and `authenticate_interactively` in Rust all become dead code and are removed,
along with `tests/credential-window.test.ts`, rewritten as coverage of the
redirect instead of deleted outright. `ask_inline`, `credential_prompt`,
`submit_credential` and `CredentialRequests` stay: ADR-0033's wizard-side
bastion flow still uses all four. `ConnectStage`'s `'authenticating'` stage,
which today means "the window is open," has no meaning left either and is
part of the same cleanup.

## Consequences

**Good**: one mechanism sets and fixes a credential, everywhere, which is
what ADR-0034 already established for the ordinary case and this closes for
the recovery case too. A whole subsystem, its own window, its own bundle, its
own capability file, its own tests, is removed rather than kept dark, which is
exactly the kind of trim this project's own pitch, small and auditable, asks
for when a caller stops existing.

**Bad**: a chain that fails at the bastion no longer resolves in one
continuous motion. Today, answering the window mid-chain lets the same
`connect_session` call carry on to the target. Under this decision the whole
chain fails, the bastion's own editor is where it gets fixed, and the target
has to be clicked again afterward. Two actions where there was one.

**Bad**: someone working in Sessions is moved to Home without asking, even
with the notice Option B adds. A workspace switch is a bigger interruption
than a window that could sit on top of the one already there.

**Bad**: `tests/credential-window.test.ts` and the pieces of
`tests/connect-flow.test.ts` that exercise this path need rewriting against
the redirect, not just deletion.

**Bad**: the case ADR-0034 named and this document is now overriding, a
session imported with no credential at all (#128), will redirect to that
host's editor on its first connect attempt rather than prompting in place.
Acceptable since importing is not built yet, but worth naming because ADR-0034
raised it directly as a reason to keep the window, and this document is the
place that reasoning gets revisited.

**Follow-up**: the exact shape of the "why this editor opened" notice, keyed
per open editor tab the same way `editorFailed` already has to be, is Phase
3's decision, not this document's. Whether a bastion's saved session can ever
be missing at the moment a redirect needs it (deleted out from under a
target that still names it) is worth confirming in Phase 3 rather than
assumed away here; `InvalidProxyJump`'s existing checks suggest it already
cannot happen, but this document does not verify that.

**Amended by ADR-0040 (2026-08-30).** The "two actions where there was one"
cost above was scoped to a single missing hop. Driving a real two-hop chain
with neither hop's credential saved showed it compounds, once per hop, into
one manual click per redirect. ADR-0040 has the affected host's editor retry
the original attempt itself once its own credential is actually saved,
instead of waiting for that click to happen again.
