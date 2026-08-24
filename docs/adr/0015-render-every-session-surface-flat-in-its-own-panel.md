# ADR-0015: Render every session surface flat in its own panel

* **Status**: Accepted; the two-box rule amended by ADR-0017, and "panel"
  read as "pane" by ADR-0019
* **Date**: 2026-08-23

## Context

The interface grew one surface at a time, each one solving the problem in front
of it, and nobody ever decided how the application talks to the user. Driving
the built application end to end on 2026-08-23, with a real connection to the
test sshd and a real unknown host key and a real cancelled credential, produced
four
different answers to the same question in four consecutive screens:

| Surface | Where it renders | Whose it is |
| --- | --- | --- |
| Host key prompt | a bare flex child of the root column, after `StatusBar` | one session |
| Connection failure | `absolute inset-0` inside `<main>` | one session |
| Credential prompt | a separate OS window | one session |
| Settings | a tab, with navigation inside it | the application |

Three of those are deliberate. The first is not: `HostKeyPrompt` is a 620px
`<section>` with no positioning of any kind, laid out in normal flow at the
bottom of the column, where it lands in the lower-left corner and overflows the
window. It declares `role="dialog" aria-modal="true"`, which is false: there
is no backdrop, no centring, and no focus trap. The markup claims a behaviour
the component does not have, and a screen reader is told the rest of the
application is inert when it is not.

Two constraints bound anything done here.

**The credential window is not a style choice.** Rule 1 of section 7 keeps
secrets out of the document that renders terminal output. A modal inside the
main webview would be exactly as forbidden as an inline panel, so the
credential prompt stays a separate OS window whichever way this decision goes.
It is outside the question, not an exception to one side of it.

**A connection attempt is currently global.** `useConnect` holds one `attempt`,
and the host key decision, the authenticating stage and the failure all hang
off it rather than off a session. That is why they render at the root: there is
no session panel for them to belong to. `openTabs` compounds it. It admits a
session with `handle !== null || kind === 'connecting'`, so the moment an
attempt fails and the session becomes `unreachable` its tab disappears, taking
away the only place a failure could have been shown. ADR-0014 recorded this as
an open follow-up.

The application is multi-session by definition. Whatever rule is chosen has to
hold when three tabs are open and the second one needs an answer.

## Options considered

### Option A: make every surface modal

Give the host key prompt a real overlay, centring and focus trap, and move the
connection failure and the settings editor into the same modal layer. One
mechanism, one visual language, and the guarantee a modal exists to give: the
decision cannot be ignored or lost behind something else.

It costs the settings tab. Settings is flat by construction, with navigation on
the left and content on the right inside `<main>`, and was built that way
deliberately in #96 and shipped on 2026-08-21. Choosing modal reverts it and
restores the `SessionEditor` overlay that #96 deleted.

It also costs multi-session. A modal blocks the window, not the session. With
three tabs open, session B waiting on a host key freezes A and C, which have
nothing to do with that decision and may be mid-transfer.

### Option B: make every surface flat, inside the panel it belongs to

Anything that belongs to one session renders inside that session's panel;
anything that belongs to the application is a tab; the credential prompt stays
an OS window because it carries a secret. The host key prompt, the failure and
the terminal become three things that can occupy one session's panel, and only
the focused session's panel is visible.

It costs the modal guarantee. A prompt in a background tab can be left
unanswered, so the tab has to carry the marker that says so.

It requires the attempt's surface to be addressed to the session it names
rather than to the root, and requires a session to keep its tab for as long as
it has an unresolved attempt. Otherwise a failure still has nowhere to live.

## Decision

Option B. Every surface that belongs to a session renders flat inside that
session's panel.

> A surface belongs to a session or to the application. A session's surface
> renders in that session's panel; the application's renders as a tab. The only
> separate window is the credential prompt, because it carries a secret.

The deciding argument is not consistency, which both options deliver. It is
that a modal blocks the window while the thing it is asking about is one
session. In a client whose normal state is several open connections, a question
about one of them must not stop the others.

The tradeoff accepted is real and worth naming: an unknown host key stops being
impossible to ignore. That is tolerable here for a reason specific to this
application. `HostKeyPrompt` already arms its primary button only after the
user confirms they verified the fingerprint elsewhere. The protection against
clicking through was never the backdrop; it was the inert button, and that
survives the move. A prompt waiting in a background tab is marked on the tab
and in the sidebar, both of which distinguish state by shape before colour
(`features/sessions/state.ts`).

Menus and the command palette are not covered by this rule. They are transient
launchers positioned at a point, not surfaces that report state or ask a
question, and treating them as either would be a category error.

## Consequences

**Good**: one rule, short enough to remember and to apply to surfaces that do
not exist yet: SFTP transfer progress and port-forward status both already
have an obvious home. The follow-up ADR-0014 left open closes by construction
rather than by fix: a failure scoped to a session panel cannot cover the whole
main area, because the panel is not the whole main area. The lie in
`aria-modal="true"` goes away with the markup that told it.

**Bad**: a question in a background tab can go unanswered indefinitely, and the
tab marker is now load-bearing for something that used to be guaranteed by a
backdrop. If a user misses a host key prompt because they switched tabs, this
decision is why.

**Bad**: it makes the attempt model more complicated before it makes it
simpler. One global `attempt` becomes one per session, and a session has to
hold its tab through failure until the failure is dismissed, which means a tab
can now exist for a session with no handle and no connection, a state that did
not previously exist.

**Bad**: the credential window still looks like raw GTK next to an application
that does not. Unifying the visual language stops at the window boundary, and
this decision does not fix that.

**Follow-up**: `useConnect` still holds one attempt at a time, so starting a
second connection replaces the first rather than running beside it. This
decision does not change that and does not depend on it, since the surface is
addressed to `attempt.sessionId` either way, but the rule above only pays off
fully once attempts are concurrent, and that is its own piece of work.

The credential window is worth styling to match the application,
tracked separately. It is presentation only and must not move any secret. The
`ConnectionFailure` scoping named in ADR-0014's follow-up is resolved here.
Revisit this decision if a surface appears that genuinely must block every
session at once; nothing in the v0.1.0 scope does.
