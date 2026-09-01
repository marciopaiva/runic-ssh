# ADR-0049: Let a folder be copied recursively

* **Status**: Accepted
* **Date**: 2026-09-01

## Context

Every send this workspace has ever dispatched, upload, download, and the
remote-to-remote transfer ADR-0045 added, has been exactly one file. A
directory has never been sendable: `SftpPane.tsx` excludes any `entry.isDir`
row from the checkbox, from Ctrl+A, and from drag; `sendToDestinations`/
`sendEntriesToDestination` in `use-fanout.ts` skip a directory outright.
#256's roadmap named "copy one or more directories" as a want from the
start; Phases 1 through 3 (selection, drag, and ADR-0048's create/rename/
delete) built everything a folder copy now needs without building the copy
itself.

Two things make this newly cheap rather than newly hard. First, ADR-0048
gave both `sftp::session` and `sftp::local` a `create_dir`, so a
destination subdirectory can be created before anything is written into
it; before that ADR the only way to make a remote directory did not exist
in this codebase at all. Second, `sftp::session::list`/`sftp::local::list`
already work against any directory on either endpoint kind, so walking a
tree costs nothing new on the Rust side, only more calls to functions that
already exist.

`Transfers`, the Rust-side registry (`src-tauri/src/sftp/transfer.rs`),
tracks every transfer as an independent `TransferHandle` with no group
concept; its own doc comment says "several [transfers] may run on one
session at once." ADR-0045's fan-out to up to four destinations already
established that grouping several independent handles into one thing a
person looks at is the frontend's job: N destinations became N handles,
grouped for display, never a new registry-level primitive. A folder copy
is the same shape from the registry's point of view: some number of files,
each its own handle.

What does not already exist: a directory has no size SFTP or a local
`stat` reports the way a file's does, so there is no byte total to show
progress against the way `TransferState` already does per file. Nothing in
the transfers list today expresses "this one thing is actually several
files, and some of them might fail while others succeed."

## Options considered

### Option A: Unify with the existing file flow

A directory becomes selectable, checkable, included in Ctrl+A, and
draggable, exactly like a file. Checking a folder and pressing Send, or
dragging its row onto a destination, walks it: list, create the matching
subdirectory at the destination, then for each child either transfer a
file or recurse, all through the transfer functions a single file already
uses. `TransfersBar` gains a second kind of row, aggregating every file
inside one folder copy into one line showing "N of M files."

**Cost**: every place `entry.isDir` currently guards selection or drag
loses that guard, six call sites in `SftpPane.tsx` alone;
`browser.ts`'s `selectionRange`, which today filters directories out of a
shift-click range specifically because "only a source pane's own files
are selectable," needs both the filter and the comment corrected, since
that reasoning no longer holds once a directory is selectable too. A new,
count-based progress state, since bytes are not available for a folder up
front. **Forecloses**: nothing; a file continues to work exactly as it
does today.

### Option B: Drag-only

Checkbox selection, Ctrl+A, and Send stay file-only, unchanged. Only
dragging a directory's own row onto a destination starts a recursive copy,
since a drag was already the one path a directory's row never had a
reason to take before now.

**Cost**: two paths to "send something" that behave differently depending
on what is selected. Checking a folder and pressing Send, which every
other item in the same list already does, would silently do nothing,
which is the shape of gap most likely to be reported as broken rather than
understood as a boundary. **Forecloses**: nothing technically, but commits
the interface to "folders are dragged, files are sent" as a real
distinction with no reason behind it beyond which one shipped first.

## Decision

Option A. A person marking three files and a folder together and pressing
Send once is the expected shape once a folder is sendable at all; Option
B's inconsistency is not a smaller version of Option A, it is a different,
harder-to-explain rule.

Two further decisions, made the same way as the selection question, by
choosing directly between named alternatives rather than by default:

**The walk is depth-first and top-down**, and **sequential rather than
concurrent**: one file transfers at a time within a single folder copy.
Firing every file in the tree at once was considered and set aside for
being harder to reason about, for progress and for cancellation, for a
gain that only matters once a tree is large enough to make the difference
visible. `MAX_DESTINATIONS` in ADR-0045 was also a starting number rather
than a settled one; this is the same kind of choice, revisited if a real
large tree, not a hypothetical one, shows it mattering.

**A failure in one file does not stop the rest of the folder.** The copy
continues past it and reports how many files failed once it finishes,
rather than aborting on the first error. A transient permission failure on
one file stopping every file after it in the same tree is a worse outcome
than finishing the copy and saying plainly what did not make it.

## Consequences

**Good**: the workspace's file-sending gains its first multi-file,
tree-shaped operation without a new Rust primitive, a new IPC command, or
a new registry concept; a folder is now a first-class thing to select,
drag, and send, not a second kind of citizen in the same list a file lives
in.

**Bad**: sequential per-file transfer is simpler to reason about than
concurrent, and slower for a large tree than it has to be; this is a
deferred cost, not an unnoticed one, and the condition for revisiting it
is a real folder copy that is slow enough in practice to matter, not a
theoretical one. A folder's own progress is a file count, not bytes, so
"7 of 20 files" can look nearly finished while the twenty files remaining
carry most of the tree's actual weight, or the reverse; this is the
honest number this application has, not a smoothed one. Cancelling mid-walk
can leave a destination with a subdirectory that was created but never
filled, or filled only partway: nothing here rolls that back, the same way
nothing on either end of this application has ever offered a trash to
undo a delete into (ADR-0048).

**Follow-up**: if a partially-copied destination tree ever turns out to
confuse people who cancel mid-copy, a cleanup pass (removing an empty or
partially-filled destination subdirectory on cancel) is the natural next
ADR, not a silent addition to this one. If SFTP ever exposes a size for a
directory this client can cheaply ask for, byte-based progress for a
folder copy becomes possible without changing the shape decided here.
