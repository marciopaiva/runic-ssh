# ADR-0076: Give hosts a manager sidebar, matching the one macros already has

* **Status**: Accepted
* **Date**: 2026-09-20

## Context

Runic SSH has exactly two kinds of saved item with their own identity, that a
user creates, edits, deletes and later reuses from more than one workspace:
hosts and macros. They have grown two different shapes for that job, and
hosts alone have grown two shapes for it internally.

Macros (`MacrosSidebar.tsx`) are a single docked panel, 300px wide, a flex
sibling of the workspace's own main area rather than an overlay over it.
It is reached two ways, a toolbar toggle button (`MacrosButton`) and a
"Manage macros..." command palette entry, and both open the same panel,
never a different one. Inside: a header with a "new" button, a filter once
there is more than nothing to filter, and a scrollable list. Each row runs
the macro on a click of its name, edits it through a promoted full-size
modal (`MacroEditorDialog`, ADR-0070) reached by a pencil icon, and deletes
it inline through a two-click confirm on a trash icon, no separate dialog.
It is available in the Sessions and Map workspaces.

Hosts do not have this. What exists instead:

* In Home, `HostsSection.tsx` is a full-screen list-beside-a-form layout
  (ADR-0029, ADR-0052), not a docked panel. Its `detail` prop, meant to
  carry that form, is passed `null` at its only call site: ADR-0072 moved
  host editing into a global modal, `HostEditorDialog`, reached from
  anywhere, so drawing the same form a second time here would duplicate it.
  The list itself has no delete: deleting a host is a button inside
  `SessionWizard`'s own form, behind a confirmation panel drawn inline in
  the form, not a row action in any list.
* In Sessions and SFTP, the "+" host book palette (`hostBookCommands`,
  ADR-0072) places an already-saved host into a rectangle or a fan-out slot.
  It has no edit or delete of its own; issue #433 gave it a "New host" row
  that opens the same global modal, but the palette still cannot touch a
  host once saved.
* In Map, a new host is created through `HostPicker`'s own typed-name flow:
  type a name that matches nothing, and it offers to create one, again
  through the same global modal. There is no host list here at all.

A third apparent instance was checked and ruled out. `ForwardsFields.tsx`
looks like a similar list, but it is a form sub-field: its rows carry no id
of their own, and `onChange` always replaces the whole array. It belongs to
one host's draft, not to a registry a user reaches from several workspaces,
so it correctly does not follow whatever pattern this ADR settles on.

The maintainer's own framing, given directly, is that this keeps happening
because nothing states the shape once: every feature that needs "a list of
saved things, with add, edit, delete and quick use" has picked its own
answer, hosts twice. Fixing hosts alone would still leave the next such
feature free to invent a fourth one.

## Options considered

### Option A: Define the manager sidebar pattern, give hosts one, leave Home alone
State the shape macros already mostly follow as an explicit six-point
contract (below), build a hosts-manager sidebar to it for Sessions, SFTP and
Map, and leave Home's full-screen `HostsSection` as it is: the same entry
points and the same actions, at the larger scale ADR-0029 and ADR-0052
already gave Home on purpose. Costs one new component and its wiring; leaves
Home's own layout question, already settled twice, unopened.

### Option B: One component everywhere, Home included
Retire `HostsSection`'s full-screen split and mount the same 300px docked
sidebar in Home too, so there is exactly one hosts-manager component with no
exception. Maximizes literal sameness, at the cost of shrinking the one
screen that has room to spare down to a width the other three workspaces
need only because they have a workspace behind the panel to leave visible.

### Option C: Question whether Home should still exist
Once a hosts-manager sidebar covers list, create, edit and delete from
Sessions, SFTP and Map, and the "+" palette already covers connecting,
Home's remaining job is thin. Retiring it would be a reversal the size of
ADR-0075's map fold, decided on its own terms, not as a side effect of a
navigation-consistency pass. Out of scope here.

## Decision

Option A. The contract, stated once so the next similar feature has
something to check itself against instead of inventing again:

1. A docked panel, fixed width, a flex sibling of the workspace's main area,
   never an overlay over it, present in every workspace where the item type
   is used.
2. Exactly two entry points, both opening the same panel: a toolbar toggle
   button, and a "Manage &lt;items&gt;..." command palette entry.
3. Inside: a header naming the panel with a "new" action, a filter shown
   once there is more than nothing to filter, and a scrollable list.
4. Each row: the primary click uses the item; a pencil opens a promoted,
   full-size modal to edit it; a trash icon deletes it inline, a two-click
   confirm, no separate dialog or panel.
5. The create/edit form always lives in that modal, never inline in the
   docked panel.
6. A saved item may also get a quick-use companion inside the keyboard
   palette, for reaching it without opening the manager at all (macros'
   "Snippets" section, hosts' own "+" placement palette). That companion is
   for the "use" action only; it is not a second place to edit or delete.

Hosts get a manager sidebar built to this contract, for Sessions, SFTP and
Map: a new docked panel reusing `hostRows`/`hostSections`
(`features/sessions`) so the bastion-and-rider nesting ADR-0060 gave the
book is not lost, reusing the existing global `HostEditorDialog` for point
5 (already true today, no change needed there), and adding the row-level
delete point 4 asks for, calling the `deleteSession` IPC wrapper that
already exists. The "+" host book palette keeps its exact current job,
point 6's quick-use companion, unchanged.

Home is not asked to adopt the docked shape. It already offers every action
this contract requires, at a scale ADR-0029 and ADR-0052 gave it on
purpose; matching Sessions, SFTP and Map to Macros closes an actual gap,
and shrinking Home to match them besides would not.

## Consequences

**Good**: hosts and macros stop being two unrelated answers to the same
question. Deleting a saved host stops being something only the edit form
can do. The contract above is now something to hold a fifth feature to,
not just a description of what macros happened to end up looking like.

**Bad**: hosts keep two shapes rather than one, Home's full screen and the
new docked panel elsewhere, which is a smaller inconsistency than the one
this ADR closes but is not nothing. `HostsSection.tsx` and the new sidebar
will share row logic but not the panel chrome around it, so a future visual
change to "how a manager sidebar looks" has two places to land instead of
one for hosts (three counting macros).

**Follow-up**: whether Home should keep existing as its own workspace once
Sessions, SFTP and Map can manage hosts directly is Option C's question,
deliberately not decided here. Implementing the hosts-manager sidebar
itself, the toolbar button, the "Manage hosts..." command, and the
row-level delete is Phase 3/4's work, tracked against issue #433.

## Addendum: 2026-09-21

The Context section's description of Map, "a new host is created through
`HostPicker`'s own typed-name flow", describes a state that no longer
exists. `HostPicker` was removed: Map now resolves a host, new or existing,
through the same "+" host book palette Sessions and SFTP already use,
carrying the kind and, for an existing component, which one is changing,
into the palette rather than opening a second overlay for the same job. The
maintainer's reason was navigation consistency, the same complaint this ADR
itself already names in its own Context ("nothing states the shape once").
Nothing else in this ADR's decision, contract or Consequences changes: the
hosts-manager sidebar this ADR actually decides is still unbuilt, still
tracked against #433.
