# ADR-0038: Let the editor ask what is held for a session

* **Status**: Accepted
* **Date**: 2026-08-30

Amends ADR-0025. Where a credential may live does not change; who may be
asked whether one is there does.

## Context

ADR-0025 gave a credential a second home: kept in `SessionSecrets`, in
memory, for the life of the run, never written anywhere. It also said what
the frontend should do about it: "The frontend stops deciding whether a
stored credential exists... it asks the core and falls through when the
answer is no." Every screen that shows that state today does so because it
just orchestrated the connection that produced it (`kept.ts`'s
`describeKeeping`, read once, at the moment of the answer), not because it
asked afterward. Nothing exposes `SessionSecrets::resolve` to the frontend,
so there is no way to ask again once that moment has passed.

The host editor is the screen that has to ask again. It reopens on a saved
host possibly minutes or days after the connection that saved a credential,
and its password block (`SessionWizard.tsx:295-317`) currently answers
"is one stored" by reading `session.credentialId !== null`, exactly the
kind of stale local field ADR-0025 already named as the thing to stop
doing. That field only names the keychain, ADR-0004's original store; a
credential kept only for this run leaves it untouched. Found while
building #196: the editor tells someone who chose "keep it until I close
the app" that nothing is stored, which is true of the keychain and false
of the fact that matters to them, and it offers no way to forget a
credential that has no other way out short of restarting.

## Options considered

### Option A: one command, one boolean, both stores folded together

A new command answers "is anything held for this session," checking
`SessionSecrets` and letting the editor keep reading `credentialId` for the
keychain half, or checking both inside the command and returning one
combined bool.

Smaller surface, but it throws away the distinction #197 asks to be kept:
which store answers changes what "Forget" should do and what the sentence
under it should say. A credential kept for this run and one in the keychain
are not interchangeable facts wearing the same word.

### Option B: a new command naming only what was missing

`SessionSecrets` gains `is_held(&CredentialId) -> bool`, cheap and
secret-free: a presence check against the map `resolve` already reads,
never touching the `Secret` itself. A new command,
`session_credential_kept(session_id) -> bool`, wraps it. The editor already
has `credentialId` for the keychain half; it now asks this command for the
other half and combines both locally, the same way `describeKeeping`
already picks its wording from more than one fact.

Costs one small Rust method and one small command, the minimum that closes
the actual gap: a way to ask about the store nothing exposed before.
Forecloses nothing; the keychain half stays exactly the check it already
was.

## Decision

Option B.

The keychain half of this question was never the problem, `credentialId` on
a freshly loaded session answers it well enough for a first cut, and ADR-0004
never asked for that to move behind IPC. What ADR-0025 actually left
undone is the one thing Option B adds: a way to ask about the store it
introduced. Combining the two answers is the frontend's job, the same job
`describeKeeping` already does with `stored` and `usesVault`.

Both open questions from #197 are resolved by what this exposes rather than
by fixing an answer here: the editor gets to distinguish "in the keychain"
from "until I close the app" because it now has both facts separately, and
"Forget" can act on whichever store answered, or both, once Phase 3 decides
the wording. That is implementation detail this ADR does not need to carry.

## Consequences

**Good**: the editor stops asserting something about a credential from a
field ADR-0025 already distrusted for the same reason. `session.editor.noSecret`,
reworded in #196 to stay silent about the run-only case, gets to say
something true instead of something careful.

**Bad**: a second network-shaped round trip (in-process IPC, but still a
call and an await) every time the editor opens on an existing host, where
today's read is synchronous and local. `SessionSecrets` gains a query
surface it did not have, which is one more thing rule 2 of section 7 has to
keep clean: `is_held` returns a bool and nothing else, by construction, so
there is nothing here for a future caller to accidentally log.

**Follow-up**: the wording and the "Forget" button's exact behaviour when
both stores answer are Phase 3's, not this document's. #131 (SessionSecrets
rendering itself) becomes marginally more relevant with a second caller
exercising the map, though `is_held`'s signature already forecloses it from
being the leak.
