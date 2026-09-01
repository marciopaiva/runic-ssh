# Runic SSH: Working Agreement

Runic SSH is a cross-platform SSH/SFTP client. The backend is Rust running
inside Tauri 2.0; the frontend is React with TypeScript. This file is the
contract for any Claude session working in this repository. Read it before
touching code.

The project is at the scaffolding stage: `README.md`, licensing, docs, and this
agreement exist; the application source tree does not yet. Treat the layout
below as the target, and create directories only when a task actually needs
them.

---

## 1. Language

Everything that lands in the repository is written in **English**: source code,
comments, documentation, commit messages, branch names, issue and PR text.
Conversation with the maintainer happens in Brazilian Portuguese. That split is
deliberate.

The one exception is user-facing strings. Runic SSH is translated into Brazilian
Portuguese, English and neutral Spanish, and those translations live only in
`src/locales/`, one flat catalog per locale. All three are offered in the
language selector: Spanish shipped from v0.2.1, its security copy verified by
a native speaker who asked not to be named; see `adr/0007-…`. Finding a named
reviewer for the same strings is tracked in issue #227, unblocking nothing.
`src/locales/en.json` is the source of truth: a string is written there
first, and the other catalogs translate it.
No user-facing text is written anywhere else in the tree, and nothing else in
the tree is written in another language. See
`adr/0007-localize-in-the-frontend-from-typed-error-codes.md`.

Security copy is a special case. A mistranslated host key warning is a
vulnerability, not a typo. Strings that describe a security decision to the user
are reviewed by a native speaker **before the translation is presented as
reviewed**, and the English string stays normative when they disagree.

That is deliberately not "before release". Pre-1.0, with no users to ask, it
blocked shipping on a reviewer who did not exist, which is a way of never
shipping rather than a way of being careful. What the rule is actually
protecting is the claim: nobody says these strings have been checked until
somebody has checked them, and a locale nobody has reviewed is offered with that
known rather than hidden. Spanish is already held out of the selector on exactly
this basis (ADR-0007, #4).

A pass by a model is not that review, and not only because it lacks
accountability: it will have written some of the strings it is checking, and it
cannot tell whether a warning lands as urgent to somebody at two in the morning
in their own language. It is worth doing anyway. One such pass found four real
defects in the host key screens (#101, #38), and it changes what a reviewer
starts from, not whether one is needed.

### How the prose is written

Everything written here is read by a person: the README, the decision records,
the commit messages, the documentation. Write it the way you would write to a
colleague who is competent and busy.

Use ordinary punctuation. A full stop, a colon, a semicolon or a pair of
brackets will do the work, and one of them is almost always the right mark. The
long dash is not a general purpose connector, and reaching for it every second
sentence is the clearest tell that nobody chose the punctuation at all.

Say the thing once, in the order it happened, with the subject in front of the
verb. Prefer the short word. If a sentence needs a dash to hold it together, it
usually needs to be two sentences.

None of this is about formality. It is about the text sounding like it was
written on purpose, which is the same standard the rest of this file asks of the
code.

The rule applies to everything written from here on: prose, commit messages,
pull request text, code comments. What already exists was corrected in the
documents people read, and deliberately **not** swept through the code
comments. A style pass across every file in the tree would take the line
authorship with it, and in a repository where the reason for a change is the
thing being preserved, that costs more than the inconsistency does. Old comments
are corrected when the code around them is touched anyway.

---

## 2. Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Shell | Tauri 2.0 | Native webview, no bundled Chromium |
| Backend | Rust (edition 2021) | All privileged work lives here |
| SSH/SFTP | `russh` + `russh-sftp` | Pure Rust, no OpenSSH process spawning |
| Terminal | `xterm.js` | Rendered in the webview |
| Frontend | React + TypeScript + TailwindCSS | Strict mode, no `any` |
| Secrets | `keyring` crate | DPAPI on Windows, Keychain on macOS, libsecret on Linux |
| Build | `pnpm` + `cargo` | `pnpm tauri dev` for the dev loop |

Do not introduce a new runtime dependency without going through the Propose
phase in section 4. Adding a crate or an npm package is an architectural
decision in a project whose entire pitch is being small and auditable.

---

## 3. Target layout

```
runic-ssh/
├── CLAUDE.md              This agreement
├── README.md              Public-facing description
├── assets/                Logo and static brand assets
├── docs/
│   ├── architecture.md    How the pieces fit together
│   ├── security-model.md  Threat model and non-negotiable rules
│   └── adr/               Architecture Decision Records
├── src/                   React frontend
│   ├── components/        Presentational components
│   ├── features/          Feature slices (sessions, terminal, sftp, vault)
│   ├── ipc/               Typed wrappers over Tauri commands
│   └── lib/               Framework-free helpers
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    └── src/
        ├── main.rs        Entry point, wires the command handlers
        ├── commands/      One module per IPC surface, thin
        ├── ssh/           Connection, auth, channels, port forwarding
        ├── sftp/          File transfer and directory listing
        ├── vault/         Credential storage on top of `keyring`
        └── config/        Session persistence and app settings
```

The `commands/` modules stay thin. They validate input, call into a domain
module, and map errors. Business logic belongs in `ssh/`, `sftp/`, `vault/`, or
`config/`, where it can be tested without a running webview.

---

## 4. Workflow: Analyze, Propose, Resolve, Implement, Close out

Every non-trivial task runs through five phases in order. A task is trivial
only if it is a typo, a formatting fix, or a change the maintainer described
line by line. When in doubt, run the phases.

The `/feature` skill drives this pipeline end to end. Use it rather than
improvising the sequence.

### Phase 1: Analyze

Understand the ground before proposing anything.

* Read the code that the change touches, plus its callers and its tests. Do not
  reason from file names.
* State what already exists, what is missing, and what constrains the solution
  (platform differences, the security rules in section 7, existing ADRs).
* List every open question and every assumption you are making.
* Produce no code and no file edits in this phase.

Output: a short written analysis. Findings only, no solution yet.

### Phase 2: Propose

Give the maintainer a real choice.

* Present two or three viable approaches. One option is not a proposal.
* For each: how it works, what it costs, what it forecloses.
* Recommend one and say why. A recommendation is required; a survey is not a
  proposal.
* Name the blast radius: files touched, IPC surface changed, dependencies added,
  migration needed for existing stored sessions.

Anything architectural also gets an ADR under `docs/adr/` via the `/adr` skill.
Architectural means: a new dependency, a change to the IPC contract, a change
to how credentials are stored or transmitted, or a decision that would be
expensive to reverse.

Anything that changes what a screen looks like, a new surface or a visible
adjustment to an existing one, gets drawn or updated in `design/canvas/`
first, following `design/canvas/README.md`. Present it the way an ADR gets
presented: for review before Phase 4, not after. A change too small to
warrant an ADR can still be too visible to skip the canvas; the two checks
are independent; do not treat "no ADR needed" as "no canvas needed."

### Phase 3: Resolve

Close the loop before writing code.

* Wait for the maintainer to pick an option when the choice is architectural,
  touches security, or is hard to reverse. Otherwise take the recommendation and
  say plainly that you are doing so.
* Answer or explicitly park every open question from Phase 1. A parked question
  gets a stated assumption.
* Write the implementation plan: ordered steps, the tests that will prove it
  works, and the rollback story.

### Phase 4: Implement

* Follow the plan. If reality contradicts it, stop and return to Phase 2 rather
  than improvising a different design mid-edit.
* Write the test alongside the code, not after the fact.
* Run the gate in section 8 before reporting done.
* Report what was built, what was tested, and what was deliberately left out.

### Phase 5: Close out

The work is finished when someone who was not there can pick it up from the
repository alone.

* Put the outcome where it survives the session: the commit, the pull request,
  the issue, the ADR. A decision made mid-implementation, a blocker hit, an
  environment requirement discovered. If it exists only in a conversation, it
  is already lost.
* Turn what the change created into work: a follow-up mentioned only in a
  report is a follow-up nobody does.
* A merge is where the conversation stops being needed. Offering to compact it
  is fine; claiming to have compacted it is not. No session can clear its own
  context, and a skill that says otherwise is describing a control that does
  not exist.

---

## 5. When to stop and ask

Stop and ask the maintainer before:

* changing anything in `vault/` or how credentials move across the IPC boundary;
* changing host key verification behavior;
* adding a runtime dependency;
* upgrading `russh`, `russh-sftp`, `tauri`, `keyring` or `zeroize` across a
  major version. Adding a dependency is already on this list, and a major bump
  is the same decision arriving as a version number. These five are the ones
  whose behavior is itself a security rule: a `russh` major can change what host
  key verification does without a line of ours moving;
* changing the IPC contract in a way that breaks an existing frontend caller;
* changing the on-disk format of stored sessions without a migration;
* any network call to a host the user did not configure.

Proceed without asking for: implementing an approved plan, adding tests,
refactoring inside a module without changing its public surface, fixing a bug
whose cause you have demonstrated, documentation.

---

## 6. Coding standards

### Rust

* `#![forbid(unsafe_code)]` at the crate root. If a task appears to need
  `unsafe`, that is a Phase 2 proposal, not a local decision.
* Errors are typed with `thiserror` per module and surfaced across IPC as a
  serializable enum. `unwrap()` and `expect()` are denied at both crate roots
  under `cfg(not(test))`, so the compiler holds this rule and not the reader. A
  panic in the core takes the application down and every session it was holding
  open with it. Tests may unwrap, which is how a test reports a failure.
* Anything touching the network or the filesystem is `async` on the Tokio
  runtime Tauri already provides. Never block the IPC thread.
* Public items carry doc comments explaining why, not what.
* `cargo fmt` and `cargo clippy --all-targets -- -D warnings` both pass.

### TypeScript

* `strict: true`. No `any`, no non-null assertion to silence the compiler.
* Every Tauri command gets a typed wrapper in `src/ipc/`. Components never call
  `invoke` directly, so the IPC surface stays greppable in one directory.
* An IPC wrapper returns its value and rejects on failure. `asIpcError` narrows
  the rejection and gives back `undefined` when it was not one of ours, which is
  how a caller separates a domain error from a bug in here. That `undefined`
  carries weight; do not trade it for a result type with nowhere to put it.
* Components stay presentational. State and effects live in the feature slice.
* No secret ever enters React state, `localStorage`, or a component prop.
* Nothing under `src/` logs, and `pnpm prose` checks it. `src/credential/` holds
  a typed password in the clear because somewhere has to, so one logging
  statement there is exactly the leak security rule 2 describes.

### Anything that outlives the call that started it

A spawned task, an event listener, an observer, an interval. Each one gets a
teardown path, and a test that proves the path runs.

This is not tidiness. `ssh/registry.rs` keeps the reason next to `has_shell`: a
second shell opened on one connection abandoned the first, which kept running,
held a pty, and counted against the server's `MaxSessions` (#94, ADR-0014). The
fix was a guard at one call site. This is that bug written down once, so the
next call site does not have to learn it again.

---

## 7. Security rules

These are non-negotiable. A change that breaks one of them does not ship, even
if the maintainer asked for it in passing; raise it instead.

1. **Credentials never cross the IPC boundary in plaintext toward the
   frontend.** The frontend references a credential by opaque id. The Rust side
   resolves the id against the OS keychain at the moment of use.
2. **Nothing secret is ever logged.** No passwords, no passphrases, no private
   keys, no session tokens, not at any log level, not in a panic message, not in
   an error returned to the frontend. Redact before the value can reach a
   formatter.
3. **Host keys are verified.** Unknown host keys prompt the user; changed host
   keys block the connection and require an explicit, deliberate override.
   Never verify-none, never a silent trust-on-first-use.
4. **Private key material is zeroized after use** (`zeroize`), and never written
   to a temporary file. A task that outlives the call which spawned it can hold
   a secret past that point, or hold an authenticated session open after
   everything that asked for it is gone. Both are this rule, and section 6 says
   what the teardown has to prove.
5. **No telemetry, no crash reporting, no auto-update ping** without an explicit
   opt-in that defaults to off.
6. `tauri.conf.json` capabilities stay minimal. Widening a capability is a Phase
   2 proposal with an ADR.

See `docs/security-model.md` for the threat model these rules come from.

---

## 8. Testing and the pre-report gate

Before reporting a task complete, run and pass:

```bash
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
pnpm typecheck
pnpm test
```

If a command does not exist yet because that part of the project is not
scaffolded, say so explicitly in the report rather than skipping it silently.
Never report work as done on the strength of code that was written but not run.

Those five, in that form, are canonical. They are what CI runs, and their output
is what a report cites when it claims something passed.

`pnpm gate` runs the same five quietly, for the loop between edits, and
re-runs the first failure verbosely. It is a check, not evidence: it tells you
whether the gate passes and not which test proved what. A claim that something
was verified cites the loud form.

`pnpm gate rust` and `pnpm gate front` run one half, for when only one half
changed.

`pnpm prose` checks the three rules in this document a machine can decide: the
long dash from section 1, the commit prefix and subject length from section 9,
and the logging statement from section 6. It reads only what the branch adds,
which is the rule rather than a shortcut. The tree holds around 180 long dashes
in code comments and every one of them is meant to be there, for the reason
section 1 gives. It is not one of the canonical five, and it does not gate a
merge on its own; it is there so the rule stops depending on whoever happened to
read the diff. CI runs it as its own job, next to the five rather than among
them.

Run it before reporting a task done, not after CI says so. `pnpm gate` does not
call it, on purpose, so nothing local stops you from reporting a documentation
change complete with a stray long dash or a commit prefix CI will bounce. That
round trip is the one this check exists to save.

Rust domain modules get unit tests. The IPC layer gets at least one test per
command covering the error path, because the error path is what the user
actually hits.

---

## 9. Commits

* Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`,
  `chore:`, `ci:`, `design:`. Subject in the imperative, under 72 characters.
  `ci:` and `design:` were in use long before they were written down here; the
  list was short because nobody had looked, not because they were irregular.
* Body explains why the change was made when the subject is not self-evident.
* **No AI attribution of any kind.** No `Co-Authored-By: Claude`, no session
  trailer, no generated-with footer, in commits or in PR descriptions.
* One logical change per commit. Do not bundle a refactor with a feature.
* Never commit to `main` without being asked. Branch as
  `feat/<short-slug>` or `fix/<short-slug>`.
* Never `git push --force` to a shared branch without explicit approval.

---

## 10. Versioning and releases

Pre-1.0, so the rules are looser than semver and the looseness is the point:
anything below 1.0 may break, and this project intends to. What follows is what
we actually do, written down because it was decided in a conversation and a
decision that lives only there is already lost.

* **A patch release** finishes something an earlier release claimed. v0.1.0 said
  it gave you a working terminal and shipped one you could not copy out of, so
  copy and paste went out as v0.1.1 rather than waiting for the next minor.
* **A minor release** opens ground the roadmap named: SFTP, port forwarding,
  session import. These are what the milestones track.
* **Three files carry the version and move together**: `package.json`,
  `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`, plus `Cargo.lock`
  which follows from the last. A release where they disagree is a release whose
  installer and about box disagree.
* **`CHANGELOG.md` is written before the tag**, by hand, and the
  `Known limitations` section is not optional. It is the part a person reads
  before installing.
* **Publishing is pushing a `v*` tag.** `.github/workflows/package.yml` builds
  every installer, verifies the hashes and creates the release. It passes
  `--prerelease` unconditionally, so every tag lands as a pre-release until
  somebody changes that on purpose.

## 11. Project skills

| Skill | Use it for |
| --- | --- |
| `/feature` | Any non-trivial change. Drives the five phases in section 4. |
| `/tauri-cmd` | Adding an IPC command end to end, Rust through to typed wrapper. |
| `/adr` | Recording an architectural decision under `docs/adr/`. |
| `/release` | Cutting a version: the sweep before the tag, and driving what the tag produced. |
| `/tdd` | Writing code with an observable behavior: a failing test first, then the minimum that passes it. Phase 4's usual tool. |
| `/diagnosing-bugs` | A bug whose cause is not yet known: reproduce, minimize, hypothesize, instrument, fix, test. Phase 1's tool when the request names a symptom. |
| `/handoff` | Work that stops before Phase 5, mid-task or blocked. Writes the state into the repository record for a session with no memory of this one. |

Skills live in `.claude/skills/`. Extend them when a workflow repeats often
enough to be worth encoding.
