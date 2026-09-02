# ADR-0050: Select SFTP rows like a file manager

* **Status**: Accepted
* **Date**: 2026-09-01

## Context

Every SFTP artboard drawn so far, and the code behind it, treats a row's
selection as something built for one purpose at a time rather than as
what a person already knows from every other file manager they use.
`Row` (`SftpPane.tsx`) opens a directory on a plain click and only lets
Shift or Ctrl/Cmd change what is selected; a checkbox is a second,
separate way into the same `selected` set, one that never moves the
shift-range anchor (`RowProps`' own doc comment). ADR-0049 made a
directory selectable at all, but left navigating it as the plain click's
job, since at the time selection existed only to feed `sendToDestinations`
and only in a source pane: `onSelectClick`, `onToggleSelect` and Ctrl+A
(`SftpPane.tsx:703`) are all `null` or gated on `onSend !== null`, so a
destination pane, or a source pane's own rename and delete, have never had
a plain click's worth of selection to work with. Rename and delete
themselves are reachable only by right-clicking one row at a time
(`menuItemsFor`); nothing today answers to F2 or Delete, and nothing
deletes without immediately calling `pane.removeEntries`, with no
confirmation, on either end of a protocol that has no Recycle Bin.

Separately, ADR-0042 gave the workspace a native "choose a file" dialog,
wired today as one icon in `SftpPane.tsx`'s identity bar
(`onUploadFromDialog`), aimed at a remote destination slot directly so a
file can be sent there without a local source pane open at all
(`use-fanout.ts`'s `uploadFromDialogTo`). It is the only caller of
`tauri-plugin-dialog`'s `open()` in the tree; `save()`, also granted by
that ADR, has never been called by anything.

Two artboards were drawn against this, iterated live with the maintainer
rather than settled in one pass: `design/canvas/SftpSelectionProposal.dc.html`
and `design/canvas/SftpDeleteConfirmProposal.dc.html`. The first went
through three shapes before landing: a checkbox-plus-icon-bar version, a
version that folded the identity row and the navigation row into one bar,
and the version below, which keeps three bars but moves rename and delete
into the middle one.

## Options considered

### Option A: Source panes only

Only change what a directory's plain click does, and only in a source
pane, where a selection already exists. Destination panes keep navigating
on a plain click, unchanged. Rename and delete gain icons only in the
source pane's own selection bar.

**Cost**: small, surgical. **Forecloses**: nothing technically, but leaves
the exact inconsistency the maintainer asked to remove: a destination pane
would still behave like today's tree while a source pane behaves like a
file manager, in the same window, side by side.

### Option B: Full parity across every pane

Selection stops being a source-pane-only, Send-shaped concept and becomes
a per-pane primitive: a plain click always selects (replacing the
selection), Shift extends a range from the last plainly-clicked row,
Ctrl/Cmd toggles one row without touching the rest, and double-click is
what opens a directory now, in every pane, source or destination. Ctrl+A
selects everything in whichever pane has focus, also in every pane.
Rename and delete get a visible, hoverable pair of icons, present in every
pane's navigation bar, not only reachable through the right-click menu.

**Cost**: promotes `selected`/`selectAnchor` from "what `SendBar` reads"
to state every `SftpPane` instance owns regardless of whether `onSend` is
given; touches `SftpPane.tsx` broadly rather than at one call site;
removes the checkbox column entirely, since Ctrl-click already does
exactly what its own "toggle without touching the anchor" doc comment
describes, once the anchor a checkbox click never moved is no longer the
thing protecting a plain click's old meaning. **Forecloses**: nothing;
this is the shape the other two are smaller or incomplete versions of.

### Option C: Keyboard and menu parity only, no new icons

Fix the click semantics and add F2/Delete, exactly like Option B, but draw
no new icon: rename and delete stay reachable only through the right-click
menu and the two keys.

**Cost**: cheapest to build. **Forecloses**: nothing technically, but
contradicts the maintainer's own stated want directly ("quero que tenha o
mesmos comportamentos de icones para renomear, excluir etc.") and is named
here mainly to be set aside, not as a real contender.

## Decision

Option B. A person who has used any other file manager already knows what
a plain click, a double-click, Shift and Ctrl/Cmd do; making this
workspace agree with that, in every pane rather than only the one that
happened to grow a selection first, costs a real but bounded amount of
`SftpPane.tsx` and removes a column rather than adding one.

Five further decisions, settled directly against the two artboards rather
than assumed:

**The checkbox column is gone**, not repositioned. `selected`/
`selectAnchor` are driven by click and keyboard alone.

**Rename and delete are drawn in the navigation bar, next to new folder
and refresh, not in the selection bar at the bottom.** A first cut of
`SftpSelectionProposal.dc.html` put them in the selection bar instead,
next to Clear and Send; the maintainer asked for them to sit beside
"criar pasta" instead, since new folder, rename and delete are the same
kind of thing, a file-management action always present in the bar,
sometimes unable to run, while the selection bar stays what it already
was: the count, and what happens to it. Rename lights only at exactly one
selected row, delete at one or more, both dim rather than gone otherwise,
the same "always there, not always able" convention `canGoBack`/`canGoUp`
already draw for the arrows beside them.

**The identity bar, the navigation bar and the selection bar stay three
separate bars**, not folded into one. An earlier pass in the same session
tried a single unified bar and reverted it directly: merged, the
breadcrumb had to share its row with back, up, new folder, refresh and a
destination's own receiving toggle and clear-slot icon, which is exactly
the row a long remote path most needs width in. The identity bar keeps
label, host identity, and now the receiving toggle and clear-slot (moved
onto it, see below); the navigation bar keeps back, up, breadcrumb, new
folder, refresh, and now rename/delete; the selection bar is unchanged in
shape, only lighter, now that rename/delete no longer live in it.

**The upload-from-dialog icon (ADR-0042) is retired, not moved.**
Confirmed directly: picking a file through a native dialog stopped
pulling its own weight once a source pane's drag and the checkbox-free
selection above cover sending a file to a destination just as directly.
Since it was the only caller of `tauri-plugin-dialog`'s `open()`, and
`save()` was never called by anything, this removes the plugin's only
reason to be registered at all. ADR-0042 is marked **Superseded by
ADR-0050**.

**Deleting asks first, once, regardless of which of the three ways
triggered it** (the new icon, the existing right-click menu, or the
Delete key this ADR also adds). Neither SFTP nor a local filesystem
offers a Recycle Bin on either end of this application, so a mistaken
multi- or folder-delete has no undo today. `SftpDeleteConfirmProposal.dc.html`
draws the question in the same danger-tinted card shape
`HostKeyChanged.dc.html` already uses for a blocking decision, body text
built from exactly what `menuItemsFor`'s own `detail` line already knows
(how many items, whether one is a folder), routed through one
`requestDelete(targets)` so all three triggers ask the same question
rather than three copies of it.

## Consequences

**Good**: SFTP's own selection stops being a special case a person has to
learn on top of what they already know from every other file manager.
Destination panes, which could not be organized without a right-click
before, gain the same rename/delete affordances a source pane has always
had access to, without inventing a second interaction model for them. The
identity bar loses an icon that had quietly become the only reason a
whole native-dialog plugin was still linked in.

**Bad**: `SftpPane.tsx` grows a real amount of state it did not carry
before (a destination pane's own selection, previously nothing), and
every one of `selected`/`onSelectClick`/`onToggleSelect`/Ctrl+A's current
call sites needs the `onSend !== null` guard removed at the same time
the checkbox column is removed, which is more surface than either change
alone. A directory's plain click changes meaning for anyone who already
learned today's shipped behavior (open on plain click); this is a
deliberate, disclosed break with what shipped before, not an oversight.
Retiring `tauri-plugin-dialog` removes a working, real shortcut (send one
file to a destination with no local pane open) for the sake of
consistency; if that shortcut turns out to be missed, restoring it is
its own ADR, not a silent revival of ADR-0042.

**Follow-up**: implementation is Phase 4 of this decision, not yet done.
It touches `src/components/SftpPane.tsx` (selection promoted to every
pane, checkbox removed, rename/delete icons and a `requestDelete`
confirmation gate added, F2/Delete wired), `src/App.tsx` (`onUploadFromDialog`
wiring removed), `src/features/sftp/use-fanout.ts` (`uploadFromDialogTo`
and `chooseUploadSource` removed), `src-tauri/Cargo.toml`
(`tauri-plugin-dialog` removed), `capabilities/default.json`
(`dialog:allow-open`/`dialog:allow-save` removed), `src-tauri/src/lib.rs`
(`.plugin(tauri_plugin_dialog::init())` removed), and `src/locales/*.json`
(`sftp.uploadFromDialog` removed, a new confirmation title/body added).
`design/canvas/gen.py`'s two exploratory functions
(`build_sftp_selection_proposal`, `build_sftp_delete_confirm_proposal`)
get promoted into real artboards and added to `canvas.json` once the
implementation matches them, the same way ADR-0048 promoted
`SftpFileOps.dc.html`.
