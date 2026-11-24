# Plan: the road to 1.0

Written on 2026-11-23, after a review of the whole repository by four
independent read-only passes (security, documentation, code health, packaging)
and a read of every finding that mattered against the code. The roadmap used to
define 1.0 as "production grade stability, and a signed installer on every
platform". This document records what changed and what is left.

## The decision: no signing

The maintainer decided on 2026-11-23 not to buy a Windows signing identity or an
Apple Developer account, and to distribute from GitHub Releases as they are. So
1.0 is **not** signed, and the roadmap and `docs/installing.md` say so instead of
promising it. What replaces "signed" as the bar for trust is what the project can
do without anyone's certificate:

* every release carries `SHA256SUMS`, covering every file attached, checked in
  the workflow against the bytes after they leave the build machines;
* the installers are built from a tag in public, by `package.yml`, with every
  action pinned by hash and no secrets in the build;
* each platform says what it will warn about, in `docs/installing.md`, and says
  not to click through blindly.

Not decided, and cheap if wanted: a build provenance attestation for the
installers (GitHub's own attestation action, no key to hold, no cost). It lets
someone verify that a file was produced by this repository's workflow from this
commit, which a checksum beside the file cannot say.

## What 1.0 means now

"Production grade stability": nothing the review found is left that makes the
application lose data, take every session down, or weaken a security rule, and
the things that cannot be tested by a machine have been tried by a person on
each platform that ships.

## The review, and where each finding went

Security, all verified against the code before being acted on:

| Finding | Where |
| --- | --- |
| `trust_host_key` could replace `known_hosts` with a file holding one key, after any read error | #524 |
| `local_remove` and `local_rename` did not check the name they act on, so `..` reached `remove_dir_all` on a parent | #525 |
| Eight Monitor reads had no output cap and no deadline, so a host could exhaust memory or hang a poll | #526 |
| No file the application writes had a restricted mode: 0644 files in a 0755 directory | #527 |
| The webview can run a script macro on up to 64 hosts and open a local shell. By design, and not said anywhere | stated below |

The last one is a property of the design and not a defect: the interface is the
only thing that talks to the user, so whatever can drive the interface can drive
the application. `docs/security-model.md` accepts the same limit for the
credential field (ADR-0055). It is worth saying plainly that the same is true of
`fleet_run`, `open_local_shell` and the local file commands, and that the
Content Security Policy (`default-src 'self'`, no remote scripts) is what stands
between a page and them. A confirmation in the core for `fleet_run` is the one
mitigation worth considering; the fleet dialog already shows the target list and
the script before anything runs.

Smaller, left as they are for now and recorded here so they are not rediscovered:
a unit name that may contain `\` in the journal command; `download` that
overwrites an existing local file and follows a symlink at the destination; no
depth or entry bound on removing a remote directory tree from a hostile server;
no limit on the number of local shells; pending host key decisions that never
expire; and `cargo deny` reporting `zvariant_derive` as unmaintained through
`keyring`, with no safe upgrade.

Documentation, done in this branch: `CLAUDE.md` said the project was at the
scaffolding stage and pointed at a directory that does not exist; the changelog
had no Known limitations for the next release; the README, architecture and
security model did not mention the Bar, Spaces, the Hall, the Logbook or the
files written for them; `docs/testing.md` had no manual check for any of it;
ADR-0070 and ADR-0078 had the wrong status.

Left for a person, because a machine cannot do them:

* **Retake the screenshots** in `assets/`. They are from v0.5.0 and show a
  screen that no longer exists. `assets/README.md` already calls a stale
  screenshot a bug.
* **Run the application on a Mac, once.** No one ever has. #132 is closed
  without that having happened, and `docs/installing.md` says so.
* **Drive the checks in `docs/testing.md` that nothing automated reaches**: the
  production hold with two connected hosts, and the Logbook recorders with a
  connected host, on Linux and on Windows.

## Before the tag

The release skill's sweep applies, and a few things only 1.0 needs:

* `SECURITY.md`, with a way to report a vulnerability privately. The repository
  has none, and for an SSH client it is the most important file it lacks. GitHub's
  private vulnerability reporting is the channel that needs no address of anyone's.
* Drop `--prerelease` from the release step on purpose, for this tag only.
* `icon.icns` and the bundle metadata (publisher, copyright, homepage, license),
  so the installers do not show empty fields.
* Third-party licence notices in the installers. The dependencies are under
  MIT, Apache-2.0, MPL-2.0 and the fonts under OFL, several of which ask for the
  notice to travel with the binary. Adding a tool for it is a decision under
  section 4 of `CLAUDE.md`.
* Done, decided by the maintainer on 2026-11-24: the identifier
  `com.runicssh.client` is final. Changing it after 1.0 would orphan every
  user's configuration directory and keychain entries, so it is not to be
  changed.
* Decide whether `core:webview:allow-internal-toggle-devtools` stays. It is
  inert in a release build unless the `devtools` feature is on, which it is not.

## After 1.0

Intel macOS and Windows ARM builds; a signed apt or rpm repository; an opt-in
updater (it needs an ADR, since rule 5 forbids an update ping by default); the
Stage (ADR-0082, Proposed); reviewing the Spanish security copy (#227); removing
the inert `previewFeatures` setting and `workspace.json`.
