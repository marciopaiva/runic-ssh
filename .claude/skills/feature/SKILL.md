---
name: feature
description: Drive a change through the four Runic SSH phases (Analyze, Propose, Resolve, Implement). Use for any non-trivial work in this repository: a new feature, a bug whose cause is not yet known, a refactor, or a dependency change. Do not use for typos, formatting, or a change the maintainer already specified line by line.
---

# Feature pipeline

Four phases, in order. Do not collapse them. The value is in stopping between
Analyze and Propose, and between Propose and Implement, so the maintainer can
redirect while redirecting is still cheap.

The request is in `$ARGUMENTS`. If it is empty, ask what to work on and stop.

---

## Phase 1: Analyze

Read before reasoning. File names lie; code does not.

1. Locate the surface the change touches. Search for the feature slice in
   `src/features/`, its IPC wrapper in `src/ipc/`, the command module in
   `src-tauri/src/commands/`, and the domain module behind it.
2. Read those files in full, plus their callers and their tests.
3. Check `docs/adr/` for a decision that already binds this area. An existing
   ADR is a constraint, not a suggestion.
4. Check section 7 of `CLAUDE.md`. Decide now whether this change touches
   credentials, host key verification, logging, or capabilities.

Write the analysis:

```
## Analysis

**What exists**: <the current behavior, with file:line references>
**What is missing**: <the gap the request is asking to close>
**Constraints**: <platform differences, security rules, binding ADRs>
**Open questions**: <numbered; each one either gets answered in Phase 3 or
                    becomes a stated assumption>
```

No edits in this phase. Not one.

**Stop here and show the analysis** if it contradicts the request, if the
request turns out to be already implemented, or if a security rule blocks the
obvious approach. Otherwise continue to Phase 2 in the same turn.

---

## Phase 2: Propose

Two or three real options. A single option is a decision presented as a
proposal, which is worse than either.

For each option:

```
### Option N: <name>

**How**: <mechanism, concretely: which modules, which crates, which types>
**Cost**: <work, new dependencies, runtime overhead, added surface>
**Forecloses**: <what this makes harder later>
```

Then, always:

```
**Recommendation**: Option N, because <reason>.
**Blast radius**: <files touched | IPC contract changed? | dependencies added?
                  | migration needed for stored sessions? | platforms affected>
```

If the decision is architectural (new dependency, IPC contract change,
credential handling, capability widening, anything expensive to reverse), write
an ADR with the `/adr` skill before moving on, and **stop for approval**.

Otherwise state which option you are taking and continue.

---

## Phase 3: Resolve

Close every thread before the first edit.

* Answer each open question from Phase 1, or park it with an explicit stated
  assumption. Silence is not an answer.
* Write the plan:

```
## Plan

1. <ordered step, one logical change each>
2. ...

**Tests**: <the specific test that proves this works, and where it lives>
**Rollback**: <how to undo this if it turns out wrong>
```

* Confirm the plan does not violate section 7 of `CLAUDE.md`. If it does, return
  to Phase 2 rather than negotiating with the rule.

---

## Phase 4: Implement

1. Work the plan in order. Write each test alongside its code, never after.
2. If reality contradicts the plan, stop. Return to Phase 2 with what you
   learned. Do not improvise a different design inside an edit.
3. Run the full gate from section 8 of `CLAUDE.md`:

```bash
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
pnpm typecheck
pnpm test
```

4. Report:

```
## Done

**Built**: <what now works that did not before>
**Tested**: <commands actually run, with their real results>
**Not done**: <anything deliberately left out, and why>
```

A command that does not exist yet because that part of the tree is not
scaffolded is reported as not run. Never present unrun code as verified, and
never report a gate as passing when you did not watch it pass.
