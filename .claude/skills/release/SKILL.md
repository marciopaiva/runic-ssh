---
name: release
description: Cut and publish a release. Use when a version is going out: bumping the version, writing the changelog, pushing a v* tag, and verifying what the tag actually produced. Covers what has to be swept before the tag and what has to be driven after it.
---

# Cut a release

Publishing is pushing a `v*` tag. Everything hard happens before that push and
after it, and none of it is enforced by CI.

The version rules live in section 10 of `CLAUDE.md`: a patch finishes something
an earlier release claimed, a minor opens ground the roadmap named. Read that
first and say plainly which one this is and why. If neither fits, that is a
question for the maintainer, not a coin toss.

## Language

`CHANGELOG.md`, `README.md`, the other docs in the sweep below, and the tag's
own annotation are repository content: English, per CLAUDE.md section 1,
regardless of what language this conversation is in. The sweep table, the
reporting, and anything else said to the maintainer along the way follow
whatever language they are using instead.

---

## Phase 1: the sweep

A release is not the feature. It is the feature plus everything that now
describes the software incorrectly. This list exists because the 0.1.1 release
was reported complete twice while two of these were still missing, and the
maintainer found them by asking rather than a check catching them.

Go through every row. Say which ones changed and which ones you checked and
found already correct. "I updated the changelog" is not an answer to this list.

| Where | What goes stale |
| --- | --- |
| `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` | the version, and they move **together**. `Cargo.lock` follows: `cargo update -p <crate> --offline` |
| `CHANGELOG.md` | the release section, written by hand, before the tag. `Known limitations` is not optional |
| `README.md` | the feature list, the roadmap, and the status paragraph. All three drift independently |
| `docs/installing.md` | example filenames carry the version, and the upgrade advice changes when the version actually moves |
| `docs/testing.md` | how a person drives whatever shipped. Anything a test cannot assert belongs here or it is untestable forever |
| `docs/security-model.md` | only if the change moved data somewhere new, and then it is required |
| `docs/adr/` | an ADR for anything architectural, via `/adr`, committed with the change and not after |
| `design/canvas/` | **an artboard per session surface.** A new screen with no drawing is design debt, and nothing tests for it |
| `src/locales/*.json` | all three catalogs, and `pnpm typecheck` regenerates the typed catalog |
| GitHub milestones | close the one that shipped, open the next |

Two of these have no guard at all. `docs/testing.md` and `design/canvas/` are
the ones that go missing, every time, because nothing fails when they do.

Then run the five commands from section 8 of `CLAUDE.md` in their loud form and
quote the real output. `pnpm gate` is for the edit loop and is not evidence.

Run `pnpm prose` as well. It is not one of the five and it does not gate the
tag, but a release branch adds the changelog, and the changelog is the prose in
this repository most likely to be written in a hurry. Catching it here costs a
second. Catching it in CI costs a push.

---

## Phase 2: the tag

Check the four version numbers agree before tagging. A tag over files that
disagree ships an installer and an about box that contradict each other, and the
tag cannot be moved once it is public.

```sh
git tag -a vX.Y.Z -m "vX.Y.Z

<one line on what this is>
See CHANGELOG.md for what this adds and what it still does not do."
git push origin vX.Y.Z
```

`.github/workflows/package.yml` fires on `tags: ['v*']`, builds on all three
platforms, verifies the per-platform hashes, and creates the release. It passes
`--prerelease` unconditionally.

**The release body links to the docs at the tag.** Documentation corrected after
the tag never reaches anybody who downloads that version. Worth knowing before
promising a doc fix will help the people on the release page.

---

## Phase 3: prove it, by installing it

A green build is not a release somebody ran, and a locally built package is not
the file a stranger downloads. Those are three separate claims and
`docs/installing.md` exists to keep them apart. Do not collapse them in a report.

Walk the path a stranger walks:

```sh
gh release download vX.Y.Z -D <dir> -p "SHA256SUMS" -p "*.deb" ...
cd <dir> && sha256sum -c SHA256SUMS --ignore-missing
```

That answers one direction only: the files you asked for match the list. It
cannot see a file on the release page that no line of `SHA256SUMS` covers, and
`--ignore-missing` forgives an absence by design. v0.2.1 shipped a `window.png`
that way, with every hash verifying (#204, and #182 before it). The workflow now
refuses to publish a file no hash covers, which is the right place for it
because it runs before the page exists. If that step is ever loosened, list the
page against the sums by hand.

Then install the downloaded package and open it. A packaged build serves the
bundled frontend; `tauri dev` serves it from Vite and exercises none of the
packaging, so a dev run does not stand in for this.

Then **drive it**, from `docs/testing.md`. Launching only proves the entry point
resolves.

What can and cannot be driven synthetically is a table in `docs/testing.md`,
under "What synthetic input can and cannot drive". Typing and pasting reach the
webview on a display with a window manager; a drag never does. Anything on the
wrong side of that line is driven by a person: ask the maintainer and wait for
the answer. Do not write a table row that says something was driven when nobody
drove it, and do not write one that says a person drove it when a script did.

---

## Phase 4: close out

* **Write the result into `docs/installing.md`**, including the parts that stayed
  false. A row saying macOS still has nobody is worth more than the rows saying
  yes.
* **Every follow-up becomes an issue.** A follow-up in a report is a follow-up
  nobody does. This is the phase, not an afterthought at the end of a message.
* **Offer `/compact`.** It is the maintainer's command to run, and no session can
  clear its own context. Do not claim to have compacted anything.

---

## Reporting

Say what was verified and how, and say what was not, in the same breath. A
release report that lists only what passed is the one nobody can act on.

The three claims stay separate: what CI built, what somebody ran, and what
somebody ran after downloading it. If a step was skipped, name it and say why.
Never report a gate as passing without having watched it pass.
