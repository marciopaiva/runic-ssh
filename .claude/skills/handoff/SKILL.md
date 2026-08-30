---
name: handoff
description: Write what happened in this conversation into the repository record, so a session with no memory of it can pick the work up. Use when work stops before Phase 5 of /feature, mid-task, blocked, or a session simply ending. Not a substitute for Phase 5 when the work is actually done; use that phase directly instead.
---

# Put the work where the next session can find it

A session's context does not survive it. If what was learned, tried, or
decided lives only in this conversation, it is already lost the moment the
conversation ends, whether that happens now or in three replies. This skill is
what moves it somewhere that does survive: the issue tracker, the branch, the
commit.

What stopped, and why, is described in `$ARGUMENTS`. If empty, ask what state
the work is in before writing anything.

**This is not `/compact`.** Nothing here touches the model's context, and no
session can clear its own. `/compact` is a command the maintainer types. This
skill produces a document; offering `/compact` afterward is still the
maintainer's call, exactly as Phase 5 of `/feature` already says.

## Language

The handoff document itself is English, always. An issue comment is issue
text, and CLAUDE.md section 1 already puts that in English regardless of what
language this conversation is in. Anything said here about the handoff,
including where it should go, follows the maintainer's own language instead.

## If the work is actually finished

Use Phase 5 of `/feature` directly. This skill is for the other case: work
that stops before that phase, mid-Phase 4, blocked on an answer, or a session
ending with the plan only half executed. Do not run both on the same piece of
work; Phase 5 already covers the finished case.

## What a handoff has to answer

A session picking this up cold needs to reconstruct the state without asking
anyone. Write:

```
## Handoff: <what this was>

**Goal**: <the original request, in one sentence>
**State**: <what is done, confirmed working, with how it was confirmed>
**In progress**: <what is half-built, and exactly how far>
**Blocked on**: <a decision, an answer, an external dependency, or nothing>
**Tried and ruled out**: <approaches abandoned, and why, so they are not
                          re-explored from zero>
**Next step**: <the one concrete action that continues this, not a list of
               eventually>
**Repro or commands**: <exact commands to get back to this state, not a
                        description of them>
```

`Tried and ruled out` is the line that saves the most time and gets skipped
the most. A session that does not know an approach was already tried will try
it again.

## Where it goes

* **An open GitHub issue exists for this work already**: write the handoff as
  a comment on it. This is the ordinary case for anything that started from an
  issue.
* **Nothing tracks this yet**: propose opening one, and say what would be in
  it, rather than opening it unasked. Creating an issue is visible to anyone
  watching the repository; confirm before posting unless the maintainer has
  already said to proceed without asking for this piece of work.
* **A blocker needs a decision only the maintainer can make**: put the
  question where section 5 of `CLAUDE.md` already says it belongs, as a
  stop-and-ask, not buried inside the handoff document as a side note.

## Uncommitted state

Check `git status` before writing the handoff. A handoff describing work that
is sitting uncommitted on disk is describing something the next session cannot
find by reading the repository; it can only find it by having the same working
tree, which it will not.

* Work worth keeping: commit it, even mid-feature, with a message that says
  plainly it is incomplete. A commit is not a claim that the feature works.
* Work that was a dead end: say so in the handoff and leave it uncommitted, or
  `git stash` it with a note in the handoff naming the stash, rather than
  silently discarding it. `git status` first, per the standing rule, before
  anything that could lose it.

## Quality bar

* A session with no memory of this conversation could execute `Next step`
  without asking a clarifying question first.
* `Tried and ruled out` names the approach and the reason, not just that
  something did not work.
* Every command under `Repro or commands` was actually run in this session,
  not assembled from what should work.
* Nothing secret appears in the document. A handoff is written where anyone
  with repository access can read it; section 7's logging rule applies to
  what gets typed here exactly as it applies to a log line.
