---
name: feature
description: Drive a change through the five Runic SSH phases (Analyze, Propose, Resolve, Implement, Close out). Use for any non-trivial work in this repository: a new feature, a bug whose cause is not yet known, a refactor, or a dependency change. Do not use for typos, formatting, or a change the maintainer already specified line by line.
---

# Feature pipeline

Five phases, in order. Do not collapse them. The value is in stopping between
Analyze and Propose, and between Propose and Implement, so the maintainer can
redirect while redirecting is still cheap — and in Phase 5, which is what stops
the work living only in a conversation that will not survive.

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

---

## Phase 5: Close out

The work is not finished when it merges. It is finished when someone who was
not here can pick it up from the repository alone.

1. **Put the outcome where it survives the session.** The commit, the pull
   request, the issue and any ADR are the record. Anything a future session
   would need — a decision made mid-implementation, a blocker hit, a follow-up
   the change created, an environment requirement discovered — is written into
   one of them, not left in the conversation. If it only exists in chat, it is
   already lost.
2. **Say what the change created.** Work discovered on the way — a follow-up, a
   debt, a question — becomes an issue or a line in an existing one. A
   follow-up mentioned only in a report is a follow-up nobody does.
3. **Offer to compact.** A merge is the point at which the conversation stops
   being needed, because step 1 moved everything durable out of it. Offer the
   maintainer `/compact`; it is theirs to run.

Do not claim to compact anything yourself. Nothing in this repository, and no
tool available to a session, clears the model's context — the harness does it
automatically when the window fills, and `/compact` is a command the maintainer
types. A skill that instructs otherwise is describing a control that does not
exist.

---

## Output discipline

Tokens are spent mostly on command output nobody reads, and a session that
fills its window on build logs compacts sooner and remembers less of the work.
This costs nothing to follow:

* **Cap verbose commands.** Pipe installs, builds, test runs and CI logs through
  `tail`, `grep` or a summarising step. `apt-get install -qq … | tail -5`, not
  the whole transcript. When a command fails, then read the failure in full.
* **Use `pnpm gate` for the loop, the five commands for the report.** The quiet
  form is five lines and answers "does it pass". It is not evidence: a claim
  that a guard fails when violated, or that a specific test proved something,
  cites the output that showed it.
* **Never `cat` a whole file to look at part of it.** Use `sed -n 'A,Bp'`,
  `grep -n`, or a targeted read.
* **Do not re-read a file to confirm an edit landed.** The edit tools fail
  loudly; a successful edit needs no verification pass.
* **Summarise machine output rather than pasting it.** A gate result is five
  lines of pass or fail, not five command transcripts.

The exception is evidence. When reporting that something works — or does not —
the actual output is the evidence, and trimming it to look tidy is worse than
the tokens it saves.
