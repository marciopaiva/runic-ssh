# ADR-0001: Record architecture decisions in this repository

* **Status**: Accepted
* **Date**: 2026-08-21

## Context

Runic SSH is starting from an empty source tree with several choices already
implied by the README: Tauri instead of Electron, `russh` instead of shelling
out to OpenSSH, the OS keychain instead of an application-managed secret store.
Those choices have reasons, and the reasons currently exist only in the head of
the person who made them.

The expensive failure mode in a small project is not making a wrong decision. It
is making a right decision, forgetting why, and then quietly reversing it during
a refactor eighteen months later. This is sharper here than in most projects
because several of the decisions are security decisions, where the cost of a
silent reversal is not a bug but an exposure.

## Options considered

### Option A: Keep the reasoning in commit messages and PR threads

No new process. The information technically exists in the history.

In practice it is unsearchable. Nobody finds the reasoning for a 2026 decision
by reading 2026 pull request comments in 2028, and the platform hosting those
comments is not the repository.

### Option B: One long design document

A single `design.md` covering everything.

It stays current for about three months. Because it is edited in place, the
record of what was rejected disappears with each revision, which is precisely
the part worth keeping.

### Option C: Architecture Decision Records

One immutable file per decision, numbered, with context, options, decision, and
consequences. Superseding is done by adding a new record, never by editing the
old one.

## Decision

Option C. Decisions that are expensive to reverse get an ADR under `docs/adr/`,
written before the code lands, using the template in the `/adr` skill.

The tradeoff accepted is friction: recording a decision costs perhaps twenty
minutes, and some of those decisions will turn out never to be questioned. That
is a real cost and we are paying it deliberately, because the failure it
prevents is silent.

## Consequences

**Good**: the reasoning outlives the author. A future contributor can see not
only what was chosen but what was rejected and why, which is what makes a
reversal an informed decision rather than an accident.

**Bad**: friction on every architectural change, and a directory that will
eventually contain records nobody reads. ADRs also go stale in a specific way:
a record can be accurate about its moment and misleading about the present.
Status fields and supersession links are the only defense, and they require
discipline to maintain.

**Follow-up**: the criteria for what requires an ADR live in `CLAUDE.md`
section 4 and in the `/adr` skill. Revisit this record if the project grows past
a handful of contributors and needs a heavier design review process.
