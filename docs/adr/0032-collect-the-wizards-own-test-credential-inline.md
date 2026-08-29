# ADR-0032: Collect the wizard's own test credential inline

* **Status**: Accepted
* **Date**: 2026-08-29

## Context

ADR-0030's wizard lets step 2 choose a method, password or private key, and
carries it to the credential window as a seed (`CredentialPrompt.
suggestedMethod`), so the window opens on the right tab instead of always
guessing password. Driving it end to end surfaced what that seed actually is:
a default, not a decision. The window still renders both tabs and lets either
be clicked, so a method chosen in step 2 can be silently ignored one screen
later, which makes step 2 read as decoration once you have watched it happen.

The fix asked for was to remove the second choice, not to lock the window's
existing tabs. That is a different decision than it first sounds like: the
separate window exists at all because of ADR-0008, and *"could the wizard
collect the credential itself, inline"* is the question ADR-0008's Option A
already answered once, in the main window, and rejected: sharing a document
with the terminal was the whole argument against it.

Whether that argument still holds for the wizard specifically is a question
about this codebase's *current* structure, not about the original one, so it
was checked rather than assumed. `App.tsx` renders every mounted terminal
inside `{workspace === 'sessions' && (<main>...)}`, a plain conditional, not
a hide-and-keep the way switching *tabs within* Sessions works (ADR-0014). The
moment `workspace` becomes `'home'`, that whole branch is `false`, React
unmounts it, and every `TerminalView` inside it runs its cleanup, which
disposes its `xterm.Terminal` instance. Nothing renders remote output while
Home is showing. The wizard lives in Home. So the specific failure mode
ADR-0008's Option A names: `document.querySelector('input').value` reachable
from a bug in the same document that is decoding a host's bytes, has nothing
to reach, right now, for exactly the surface this decision is about.

The difference that matters: ADR-0008's isolation is structural. The
credential window is a separate bundle; `tests/credential-window.test.ts`
walks its import graph and fails if the terminal is reachable from it at all,
so the guarantee cannot be broken by a change that forgets about it. What
this document leans on is a runtime condition, one `&&` in `App.tsx`, with
no test tied to the reason it matters. A future change that keeps a terminal
mounted across a workspace switch, for some UX reason nobody has proposed yet,
would break this decision's premise silently. That gap is real and is not
closed by choosing Option A below; it is closed by the guard the Decision
section requires as part of taking it.

## Options considered

### Option A: an inline field, uncontrolled, submitted directly

The wizard's own step 3 collects the secret itself once a host key is
trusted, in an uncontrolled input read at submit time, the same rule the
credential window already follows, so nothing new is asked of how the value
is handled once typed. It authenticates through `authenticate_session`, the
existing command that takes a secret directly and proves it against an
already-open connection, never through the `CredentialRequests`/window
protocol at all. No separate window opens for this path.

This is the one real gap in feature parity: `authenticate_session` and
`remember_credential` cover "never" and "in the system keychain," but nothing
exposed lets the frontend keep a secret in `SessionSecrets`: the "until Runic
SSH closes, in memory only" middle tier ADR-0025 built specifically because
it is what most people actually want. Dropping that tier silently would be
answering this ADR by quietly reducing a different one, so a small new
command, `keep_credential_for_run`, is part of this decision rather than a
follow-up: it does exactly what `SessionSecrets::keep` already does, reachable
without the window.

### Option B: lock the existing window's tabs

Thread a `locked` flag into `CredentialWindow` from `suggestedMethod`: when a
caller already chose a method, render it without the switcher, so there is
nothing left to click that would disagree with step 2. No new IPC surface, no
change to where a secret is typed, ADR-0008's guarantee stays exactly as
structural as it already is.

It does not answer what was actually asked, though it is worth naming why
the maintainer moved past it: once step 2 exists at all, a window that opens
on its answer and still offers to override it reads as the same problem this
document opened with, whichever way the override is spelled. Locking the
tabs fixes the symptom (the click) without fixing the shape (a decision made
on one screen, re-litigated on the next).

## Decision

Option A, with `keep_credential_for_run` added so it loses none of the three
tiers ADR-0025 already offers everywhere else, and one guard added so the
premise in Context stays true on purpose rather than by accident:

**`tests/no-terminal-in-home.test.ts`** (or equivalent) asserts, by reading
`App.tsx`, that the block mounting `TerminalView` is gated on
`workspace === 'sessions'` and nothing else. It is a source-pattern check, the
same kind `tests/credential-window.test.ts` already runs for the window's own
bundle isolation, not a runtime guarantee, but a change to the gating
condition now has to touch a test that says why it is there, instead of
silently reopening what this document found true and relied on.

This is scoped to the wizard's own step 3 test. The credential window is
unchanged for every other caller: an ordinary connect from Sessions, and a
bastion's own prompt (ADR-0027), both of which still open it exactly as
ADR-0008 decided, because neither of them has a step 2 to have already
answered the question the window would otherwise ask again.

## Consequences

**Good**: step 2's choice is a decision once this ships, not a suggestion
that survives until the next screen. The wizard's test reads as one
continuous form: host key, then a field, then done, rather than a form that
hands off to a window for the last part. `keep_credential_for_run` closes a
gap this change would otherwise have opened, and leaves ADR-0025's three
tiers reachable from every path that authenticates, not only the ones that
go through a window.

**Bad**: the isolation this path relies on is a runtime condition asserted by
a source-pattern test, not a structural one enforced by a separate bundle.
The guard makes a future change to that condition visible; it does not make
the condition itself impossible to change. Anyone weakening it should read
this document before they do, which is what the guard's failure message is
for.

**Bad**: `authenticate_session` now has two frontends instead of one: the
wizard's inline form, and whatever already called it before this shipped, if
anything did. The credential window's protocol (`CredentialRequests`, opaque
request ids, the window-close-answers-a-dismissal wiring ADR-0028 built) is
now one of two ways a secret reaches a connection rather than the only one,
and a reader has to know which caller is asking to know which path applies.

**Follow-up**: closed by ADR-0033, which extends this same inline mechanism to
a bastion's own credential: the gap named here, a session behind a jump host
still seeing a window mid-test, no longer exists. Revisit this decision
outright if Home ever gains a reason to keep a terminal mounted across a
workspace switch; the guard will fail first, but the reasoning above will
need rewriting, not just the code.
