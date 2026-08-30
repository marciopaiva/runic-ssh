# ADR-0040: Retry the connection once its credential redirect settles

* **Status**: Accepted
* **Date**: 2026-08-30

Amends ADR-0039.

## Context

ADR-0039 sends a connect attempt with nothing usable saved to the affected
host's own editor in Home, rather than to a credential window. Its
Consequences section named the cost of that directly, and accepted it:

> a chain that fails at the bastion no longer resolves in one continuous
> motion. Today, answering the window mid-chain lets the same
> `connect_session` call carry on to the target. Under this decision the whole
> chain fails, the bastion's own editor is where it gets fixed, and the target
> has to be clicked again afterward. Two actions where there was one.

That sentence describes one hop missing a credential. Driving the real
`runic-bastion` / `runic-target-a` two-hop fixture (#133) by hand on
2026-08-30, with neither hop's credential saved yet, showed what the same
mechanism does when more than one hop is missing one: click the session,
fix the bastion's credential, click the session again, fix the target's own
credential, click the session a third time before a shell finally opens.
Filed as #238. The cost ADR-0039 named does not stay at "two actions where
there was one"; it compounds once per hop still missing a credential, and a
chain is exactly the shape most likely to have more than one.

`App.tsx` already has everything a fix needs, without reopening ADR-0039's
own mechanism:

* `onCredentialMissing(sessionId, hop)` knows the original `sessionId`
  Sessions was trying to reach before it computes which host's editor to open
  (`credentialRedirectTarget`) and records that redirect in `editorOpenedFor`,
  today a `ReadonlySet<string>` used only to drive the dismissible "this
  opened because Sessions asked" notice.
* `testOutcome`, a `ReadonlyMap<string, 'saved' | 'failed'>` set by the same
  `useConnect` wiring, already tells the wizard's own settled row whether the
  credential it just tested was saved. `finishWizard`, which "Concluir" calls,
  reads neither map: it closes the editor and stops.

## Options considered

### Option A: leave it as ADR-0039 accepted it

Nothing changes. The cost is named and understood, and #238 closes as
by-design.

Cheapest, and the one the dogfooding directly argues against: the sentence
ADR-0039 accepted was written against a single missing hop, and a
two-hop chain already triples the clicks needed for what used to be one.
The maintainer, presented with this, chose not to accept the compounded
version of a cost that was scoped to the simpler case.

### Option B: improve the notice, change nothing else

Keep the manual re-click, but make the notice say plainly that Sessions is
still waiting and coming back to this row is the next step.

Smaller change, no risk of an unsolicited reconnect. Does not reduce the
click count the dogfooding actually complained about: a two-hop chain still
needs three clicks on the same row, just with a clearer sign telling the
person to make the second and third one.

### Option C: retry the original attempt when its redirect settles

Widen `editorOpenedFor` from `ReadonlySet<string>` to
`ReadonlyMap<string, string>`, keyed the same way, valued with the original
`sessionId` `onCredentialMissing` had before it redirected. `finishWizard`,
for an existing target, looks up that entry; if present and
`testOutcome.get(target.sessionId) === 'saved'`, an already-computed answer
that is exactly what the wizard's own "Salvo." banner is already trusting,
it calls the existing `connect(resumeId)` again before clearing the entry.
Dismissing the notice (`dismissOpenedFor`) clears the same entry, so
dismissing it also opts out of the retry, consistent with its own doc
comment: cleared the same way a failure notice already is, on the next
action in that editor.

If the retried connection meets a second hop still missing its own
credential, `onCredentialMissing` fires again, exactly as it does from a
fresh click, and records a fresh redirect the same way. A chain with several
missing credentials settles on its own instead of one manual click per hop.

No IPC change, no new dependency, no Rust touched: `testOutcome` and
`connect` already exist in `App.tsx` for this exact purpose.

## Decision

Option C.

The tradeoff accepted is aimed at the specific failure the dogfooding found:
a click that already happened once should not need to happen again once the
thing that stopped it is actually fixed. What is given up is named below
rather than assumed away: finishing the editor can now start a connection
attempt nobody explicitly asked for at that exact moment.

## Consequences

**Good**: a chain with N hops missing a credential settles in one pass
through Sessions and N redirects, rather than N+1 manual clicks on the same
row. Reuses state the app already computes correctly for its own UI
(`testOutcome`); no new IPC surface, no new dependency, no change to how a
credential is stored or transmitted.

**Bad**: someone who opened the redirected editor only meaning to fix or
inspect a credential, with no intention of connecting right now, gets an
unsolicited connection attempt the moment they click "Concluir". ADR-0039
already named a related cost, a workspace switch nobody asked for; this adds
a second one on top of it rather than removing the first.

**Bad**: dismissing the "this opened because Sessions asked" notice and
opting out of the automatic retry are now the same action, because they share
the same piece of state. Someone who dismisses the notice only to reduce
clutter, meaning to keep the automatic retry, cannot do one without the
other today.

**Follow-up**: if the coupling above proves confusing in practice, it needs
its own piece of state rather than reusing `editorOpenedFor` for both jobs.
Not split now, on the same reasoning ADR-0039 itself used to prefer reusing
structure over inventing a new one, absent a concrete complaint.
