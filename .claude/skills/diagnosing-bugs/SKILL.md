---
name: diagnosing-bugs
description: A disciplined loop for a bug whose cause is not yet known, reproducing it, minimizing it, forming a hypothesis, instrumenting, fixing, then testing. Use as Phase 1 of /feature when the request names a symptom rather than a cause. Not for a bug whose fix is already obvious from reading the code; that is a Phase 1 analysis on its own.
---

# Find the cause before writing the fix

A fix for a symptom you have not reproduced is a guess wearing a diff. This
loop is what Phase 1 of `/feature` looks like when the task starts as "X does
the wrong thing" rather than "add Y."

The symptom is described in `$ARGUMENTS`.

`ssh/registry.rs` is the example already written into section 6 of
`CLAUDE.md`: a second shell opened on one connection abandoned the first,
which kept running, held a pty, and counted against the server's
`MaxSessions` (#94, ADR-0014). That bug was found by this loop once. It is
written down so the next call site does not have to relearn it; this skill is
how the next one gets found the same way.

## Language

The Analysis this loop feeds into Phase 1 (see the bottom of this skill) is
conversation, not repository content. Write it in whatever language the
maintainer is using in this conversation. Whatever fix it leads to still
writes English into the tree, per CLAUDE.md section 1, regardless of what
language found it.

## 1. Reproduce

Pin down exact steps, exact input, exact platform, before reading a line of
the module you suspect. A bug you cannot reproduce on demand has not been
found yet, it has been guessed at.

* SSH or SFTP behavior: use the container fixtures in `docs/testing.md`, not a
  live server nobody else can reach. State which fixture, which port, and the
  known-hosts state, so the repro is something another session can run
  unchanged.
* A bug that only shows up after several actions in sequence: write the
  sequence down as steps, not as a description of the eventual state. "Open
  two shells on one connection" reproduces #94; "sometimes a shell hangs
  around" does not.
* If it will not reproduce twice in a row, that is itself a finding: say so,
  and treat non-determinism as the hypothesis to chase, not as a reason to
  guess at a fix.

## 2. Minimize

Cut the repro down until every remaining step is load-bearing. Remove a step;
if the bug still shows, that step was never part of the cause. Stop when
removing anything makes the bug disappear.

A minimized repro is usually most of the fix already, because what is left
after cutting is a short list of what actually matters, which is close to what
the hypothesis in the next step needs to name.

## 3. Hypothesize

Write one sentence: "`X` does `Y` because `Z`." Not "something is off in the
registry." A hypothesis that cannot be wrong is not one; it has to name a
mechanism specific enough that a piece of evidence could contradict it.

Read code only to test this sentence, not to browse the module looking for
something suspicious. Reading without a hypothesis is how a real bug gets
missed in favor of an unrelated thing that also looked wrong.

## 4. Instrument

Add whatever confirms or kills the hypothesis: a log line, an assertion, a
debugger, a temporary test. Confirm or kill it before touching the fix.

**Section 7 rule 2 does not pause for debugging.** Nothing secret is logged at
any level, including a `dbg!` or an `eprintln!` added to chase a hypothesis
and meant to come out before the commit. "Temporary" is not an exception the
rule makes; a leak from an instrumentation line left in by accident is still a
leak. If the hypothesis touches `vault/` or a credential's path across the IPC
boundary, instrument with the shape of the data (a length, a type, a hash), not
the value.

Strip every temporary instrumentation line before Phase 4 starts, not after.
`git diff` before the fix commit is where this is checked.

## 5. Fix

Once the hypothesis is confirmed, write the fix for the mechanism, not the
symptom in step 1. If the fix is larger than the investigation, the
hypothesis was probably incomplete: return to step 3 rather than patching
around a cause still not fully understood.

If the fix falls into section 5's stop-and-ask list (credentials, host key
verification, a dependency, the IPC contract, the on-disk session format),
stop here and take it through Phase 2 and 3 of `/feature` before writing it.
A confirmed root cause does not skip that gate; it is what makes the Phase 2
proposal concrete instead of speculative.

## 6. Test

Use `/tdd`. The regression test is the minimized repro from step 2, translated
into an assertion, watched to fail against the pre-fix code and to pass
against the fix. If the pre-fix code is still in the tree, run the test
against it directly; if not, `git stash` the fix, confirm red, restore it.

A fix with no test that would have caught the original bug is a fix for one
report, not for the class of bug. Section 6's `ssh/registry.rs` guard is the
standard: one call site fixed, one test that would fail again if a second
call site made the same mistake.

## Where bugs in this codebase like to hide

* **Async boundaries.** Anything touching the network or the filesystem is
  `async` on Tokio (section 6). A hypothesis involving a stale value or a
  double-run is often a task outliving the call that spawned it; check section
  6's teardown rule before looking elsewhere.
* **The IPC seam.** A value that looks right in Rust and wrong in the
  frontend, or the reverse, is often the boundary itself: a mismatched field
  name, a type that serializes differently than expected, or an error mapped
  too early or too late. `/tauri-cmd` describes the shape a correct command
  takes.
* **Platform differences.** `keyring` behaves differently per OS by design
  (DPAPI, Keychain, libsecret), and so does the webview (WebKitGTK, WebView2,
  WKWebView; see the paste and clipboard sections of `docs/testing.md` for two
  bugs that were only visible on one engine). A hypothesis confirmed on one
  platform is confirmed on one platform, not stated as general until checked on
  a second.

## Feeding this back into Phase 1

The loop above produces exactly what `/feature`'s Phase 1 asks for:

```
## Analysis

**What exists**: <the mechanism, confirmed by the instrumented repro>
**What is missing**: <the guard or check that would have prevented it>
**Constraints**: <section 7 rules, binding ADRs, platform scope of the confirmation>
**Open questions**: <anything the repro did not settle>
```

Continue into Phase 2 from there. A confirmed hypothesis with a minimized
repro is a strong Phase 2 proposal; a guess is not, no matter how plausible.
