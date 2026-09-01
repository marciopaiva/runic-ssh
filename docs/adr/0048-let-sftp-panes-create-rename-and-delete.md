# ADR-0048: Let an SFTP pane create, rename and delete entries

* **Status**: Accepted
* **Date**: 2026-09-01

## Context

Every write this application has done against a pane's own filesystem, local
or remote, has so far been moving an existing file's bytes: `download`,
`upload`, `transfer` (ADR-0041, ADR-0045). Nothing creates an entry, renames
one, or removes one. #256's roadmap asked for exactly that as its third
phase, after selecting files (Phase 1) and dragging them between panes
(Phase 2): a new folder, a rename, a delete, for whichever pane a person is
looking at.

The remote side already has everything this needs at the protocol level.
`russh-sftp` (the client already in use, ADR-0041) exposes `create_dir`,
`rename`, `remove_dir` and `remove_file` on the same `SftpSession` `list`/
`download`/`upload` already use; no new dependency. The local side has only
`sftp::local::list` today and needs the equivalent three calls through
`std::fs`. `sftp::path::check_name`, already the one place a remote entry's
name is validated before it is trusted (no separator, no `.`/`..`, no
control character, length capped), is the same check a name typed into this
application's own UI needs before it becomes a path segment: a text field
that is supposed to hold one name has exactly the same failure mode a
hostile server's listing does if something in it is read as a path, and
reusing the check costs nothing new.

SFTP version 3, the version `russh-sftp` speaks, has no directory-tree
delete and no "already exists" status code. `remove_dir` refuses a
non-empty directory; the protocol has no batch or recursive delete
operation at all, so removing a directory with anything in it means walking
the tree from this side: list it, delete each child, recurse into each
subdirectory, then remove the directory once it is empty. A name collision
on `create_dir` or `rename` comes back as `SSH_FX_FAILURE`, the same
generic status code used for whatever the server has no more specific
answer for; there is no way to tell that failure apart from any other on
the wire.

Neither a plain SFTP server nor a bare local filesystem call gives this
application a trash or an undo. Whatever "delete" means here, it is
permanent the moment it succeeds.

Nothing in the UI today edits a name in place, and nothing opens a context
menu on an SFTP row. `GroupMenu.tsx` is the one context menu this tree
already has: a plain list of items, an optional `detail` line under a
destructive one, opened by right-click, positioned by `menuPosition`. It
already carries the exact shape this feature needs (see its own doc
comment: "the count belongs on the control that does the thing, where it is
read a moment before the decision"), used today to close a group of tabs
with the tab count as that same kind of warning.

## Options considered

### Option A: In-place editing and a lightweight context menu, one-click recursive delete

A row's name becomes a plain text input in place for both a rename and a
freshly created "New folder" row; Enter commits, Escape cancels without a
network call either way. A right-click on a row opens `GroupMenu.tsx`,
unchanged, with **Rename** and **Delete** (or **Delete N items** against
the current selection). Deleting a directory is one click: the menu item's
own `detail` line already says what is about to happen ("deletes the
folder and everything inside it") before the click, rather than a second
screen after it. The nav bar gets a small "new folder" icon next to
refresh, so creating one has a visible entry point and not only a
right-click on empty space (the same "a context menu is the convention and
a visible button is the thing somebody finds without being told the
convention" reasoning `SessionMenu.tsx`'s own doc comment already gives).
Applies to every pane, source and every destination slot alike, since
managing a pane's own files is a property of its endpoint, not of whether
that pane currently sends.

**Cost**: new local state per pane (which row, if any, is being edited, and
its current text), three new backend operations per endpoint kind, a new
short-lived error strip distinct from `pane.error` (that one still means
"the listing itself failed" and replaces the whole pane; an action failing
against a listing that loaded fine must not take the listing down with it).
**Forecloses**: nothing; a heavier flow can still be layered on top of the
same commands later if a specific case turns out to need it (a large tree
delete gaining its own progress reporting, say).

### Option B: Modal dialogs for every step

Reuse `SessionSurface` (the host-key and credential panel) to ask for a new
name and, separately, to confirm a delete, the same weight this
application already gives a changed host key or a missing credential.

**Cost**: two new full-panel surfaces for what is, in every other file
manager, a routine and frequent action; a heavier interruption for renaming
one file than for the credential prompt that only appears when something
is actually missing. **Forecloses**: nothing technically, but sets a
precedent that every future small edit reaches for the heaviest surface
this application has, which is the opposite of what `SessionSurface` is
for.

## Decision

Option A. A rename or a new folder is common enough that it should feel
like editing a spreadsheet cell, not opening a dialog; a modal for it would
be the interruption `SessionSurface`'s own doc comments already reserve for
questions with real weight (an unknown host key, a missing credential),
and using it here would blur that line for everything that reaches for it
next.

Delete stays one click, recursive, with the warning carried by the menu
item itself rather than a second confirmation screen, matching
`GroupMenu.tsx`'s own precedent for closing several tabs at once: the
information that makes the click safe to trust belongs on the control that
performs it, not behind it. Restricting delete to empty directories was
considered and rejected: it protects nothing an attacker could not already
reach some other way, and makes the feature useless against the one case
(a folder with something inside it) a person is most likely to actually
want to remove.

## Consequences

**Good**: the three most-asked-for gaps in #256's roadmap (new folder,
rename, delete) ship without a new dependency, a new IPC shape, or a new
UI surface; `GroupMenu.tsx` gets a second real caller instead of staying a
single-purpose component; every pane, not only the source, gets the same
capability for free since none of this is wired to `onSend`.

**Bad**: a recursive delete has no undo anywhere in this application, on
either side, and a person who deletes the wrong folder finds that out only
after it is gone. A name collision on `create_dir` or `rename` surfaces as
the same generic "the SFTP protocol failed" copy as any other unclassified
failure, not a specific "a file with that name already exists" message,
because SFTP v3 gives this client no way to tell the two apart.

**Follow-up**: if a future SFTP extension or a local-only fast path ever
distinguishes a name collision from a generic protocol failure, `SftpError`
gains a dedicated variant and `sftp.error.*` gains a specific string; until
then the generic message is what a collision actually looks like on the
wire, not a gap in this implementation. A tree large enough to make a
recursive delete take a noticeable amount of time has no progress reporting
of its own; revisit if that turns out to matter against a real fixture
rather than a hypothetical one.
