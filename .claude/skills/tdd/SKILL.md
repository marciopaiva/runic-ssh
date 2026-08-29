---
name: tdd
description: Drive an implementation with red-green-refactor: a failing test first, the minimum code to make it pass, then a cleanup pass with the tests still green. Use during Phase 4 of /feature, or any time code is being written that has an observable behavior to assert. Not for throwaway exploration or a change with nothing to assert.
---

# Red, green, refactor

Section 6 of `CLAUDE.md` already says the test is written alongside the code,
not after. This skill is how that happens in practice rather than staying a
sentence nobody checks.

The change being built is described in `$ARGUMENTS`.

## Language

Code, tests, and comments follow CLAUDE.md section 1: English, always,
regardless of what language this conversation is in. Whatever is said about
the loop while it runs, what is red, what made it green, what changed in
refactor, follows the maintainer's own language instead.

## Why the order matters

A test written after the code passes on the first run, which proves nothing:
it was written to match code you have already read, so it cannot fail in a way
that would have caught the bug it is supposedly guarding against. A test
written first and watched to fail is the only version that has demonstrated it
can catch something.

## The loop

### 1. Red

Write the test for the next small piece of behavior. Run it. Read the failure.

* It must fail **because the behavior is absent**, not because of a typo, an
  import error, or a signature mismatch. A test that fails to compile has not
  told you anything yet; fix the scaffolding until the failure is the assertion
  itself.
* One behavior per red. `connect_session_rejects_unknown_id` is a red step;
  a test asserting five unrelated things is three steps wearing one name.

### 2. Green

Write the smallest amount of code that makes the test pass. Not the smallest
amount of code you expect to need eventually: the smallest amount that passes
this test right now. The next red step is what earns the next piece.

Run it. Confirm green. Do not read ahead into refactor while a test is still
red.

### 3. Refactor

Clean up with the tests as the guardrail: rename, extract, remove duplication.
The tests must not change, and the behavior they assert must not change. If a
refactor needs a test to change, it was not a refactor; it was a redesign, and
it starts a new red step.

Run the full suite for the module before moving on, not just the test just
written. A refactor that breaks a sibling test is exactly what this step
exists to catch before the gate does.

## Rust

* `cargo test <name>` while iterating, the full `cargo test` before reporting.
* Unit tests live beside the domain module they test, per section 3 of
  `CLAUDE.md`: `ssh/`, `sftp/`, `vault/`, `config/`. A test that needs Tauri in
  the picture to run is testing the wrong layer; see `/tauri-cmd` for where the
  boundary sits.
* An IPC command gets its error-path test as in `/tauri-cmd`: write it red
  against the unregistered or unimplemented handler, then make it pass.
* `unwrap()` and `expect()` are denied outside `cfg(test)`. Inside a test they
  are how a test reports its own failure; use them freely there and nowhere
  else.

## TypeScript

* Components stay presentational (section 6). State and effects live in the
  feature slice, so that is where the test goes; a component test that mocks
  half the feature slice to check a click handler is testing the wrong layer.
* `pnpm test` for the loop and the report, `pnpm typecheck` before either: a
  type error is a red step TDD does not need to reproduce, the compiler is
  already doing it.

## Anything that outlives the call that started it

Section 6 names this explicitly: a spawned task, a listener, an interval, a
held connection. `ssh/registry.rs` is the example already written into
`CLAUDE.md`: a second shell opened on one connection used to abandon the
first, which kept its pty and its slot against the server's `MaxSessions`
(#94, ADR-0014).

The red step for this class of bug is not "the second shell fails to open"; it
is "the first shell's resources are released once it is no longer reachable."
Write the test that asserts the teardown ran, watch it fail against code with
no teardown, then add the guard. A fix without this test is a fix for the
symptom seen once, not the class of bug section 6 is naming.

## Not this skill

* A throwaway prototype with no behavior to keep. Nothing here blocks quick
  exploration; it blocks calling exploration finished.
* A pure refactor with an existing test suite already covering the surface.
  Run the suite before and after; there is no new red step because there is no
  new behavior.
* Documentation, formatting, config. Section 4 already excludes these from the
  five phases for the same reason.

## Gate

```bash
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
pnpm typecheck
pnpm test
```

The same five as section 8. This skill is what makes their output meaningful
by the time they run, not a substitute for running them.
