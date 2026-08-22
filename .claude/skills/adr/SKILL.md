---
name: adr
description: Write an Architecture Decision Record under docs/adr/. Use when a decision adds a runtime dependency, changes the IPC contract, changes credential handling or host key verification, widens a Tauri capability, or would otherwise be expensive to reverse.
---

# Record an architecture decision

An ADR captures why a decision was made, at the moment the reasoning is still
in someone's head. It is written for the person who, two years from now, wants
to undo it and needs to know what breaks. Write it before the code lands, not
after.

The decision is described in `$ARGUMENTS`.

## When an ADR is required

* A new runtime dependency, crate or npm package
* A change to the IPC contract that existing callers rely on
* Anything touching credential storage, transport, or lifetime
* Anything touching host key verification
* Widening a capability in `tauri.conf.json`
* Choosing between two designs where the loser stays viable

Not required for: implementing an already-recorded decision, bug fixes,
refactors that preserve the public surface, documentation.

## Steps

1. List `docs/adr/` and take the next number. Four digits, zero padded.
2. Name the file `NNNN-short-kebab-title.md`. The title names the decision, not
   the problem: `0007-store-credentials-in-os-keychain.md`, not
   `0007-credential-problem.md`.
3. Write it using the template below.
4. If this ADR supersedes an earlier one, set the old one's status to
   `Superseded by ADR-NNNN` and link forward. Never delete or rewrite a
   superseded ADR: the record of a decision that was later reversed is exactly
   the thing that stops it being made again.
5. Commit it with the change it justifies, in the same commit or the one
   immediately before.

## Template

```markdown
# ADR-NNNN: <decision, stated as an action>

* **Status**: Proposed | Accepted | Superseded by ADR-NNNN
* **Date**: YYYY-MM-DD

## Context

What forces this decision. The constraints, the requirement, what is already
true in the codebase. No solutions here. A reader who disagrees with the
decision should still agree with this section.

## Options considered

### Option A: <name>
How it works, what it costs, what it forecloses.

### Option B: <name>
Same.

## Decision

The option chosen, stated plainly, and the reason it beat the others. Name the
tradeoff that was accepted, not only the benefit that was gained.

## Consequences

**Good**: what this makes possible or simpler.

**Bad**: what this makes harder, slower, or more fragile. An ADR with an empty
Bad section is an advertisement, not a record. Every real decision costs
something.

**Follow-up**: work this creates, and the conditions under which this decision
should be revisited.
```

## Quality bar

* The Context section stands on its own without the decision.
* At least two options, and the rejected one is described fairly enough that a
  reader can see why someone would have picked it.
* The Consequences section names a real cost.
* Dates are absolute. Never "last week" or "recently".
