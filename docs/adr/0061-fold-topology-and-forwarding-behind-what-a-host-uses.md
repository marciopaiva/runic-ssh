# ADR-0061: Fold Topology and Forwarding behind what a host actually uses

* **Status**: Accepted
* **Date**: 2026-09-03

## Context

Following ADR-0060's own precedent of drawing real, fully worked
alternatives rather than arguing from description, the maintainer asked
whether the host editor's own layout (`SessionWizard.tsx`, ADR-0056)
deserved the same look, not only the sidebar beside it. Today's shape: two
columns, General and Topology (440px) on the left, Access and Forwarding
(340px) on the right, each of the four sections always fully drawn
regardless of whether the host being edited actually uses it. Topology's
own Kind picker and "reached through" select (`HostTopologyFields.tsx`)
render for every host, including the common case ADR-0060's own Context
already established: a plain direct host, no bastion, is most of the
book. Forwarding's own bordered section (`ForwardsFields.tsx`) renders
even when the list is empty.

## Options considered

Explored as three independent, fully worked mockups
(`form-proposal-linear.html`, `form-proposal-progressive.html`,
`form-proposal-regrouped.html`, not committed: throwaway static HTML
built by three separate agents, each briefed on the real components
(`HostGeneralFields.tsx`, `HostTopologyFields.tsx`,
`CredentialAccessFields.tsx`, `ForwardsFields.tsx`, `FormSection.tsx`) and
the real ADR-0056/0057/0058 constraints, told nothing about the other
two), rather than argued from description alone.

### Option A: Single column, linear

Remove the two-column split. General, Topology, Access and Forwarding
stack top to bottom, full width, in the order the components already
mount today.

**Cost**: on the exact fixture used to judge all three (a host reached
through a bastion, one saved forward), Save already sits below the fold
of the app's own 900px window height, something the two-column layout
avoided by spreading width instead of height. Loses the two-column's free
"host data versus connection data" grouping at a glance; a reader has to
read four section headings to reconstruct what used to be positional.

**Forecloses**: showing General/Topology and Access/Forwarding side by
side, e.g. checking a host's own port while typing a forward's target
port without scrolling.

### Option B: Regroup by task ("Where" / "Who-how")

Keep two columns, but cut the same eight fields differently: left is
everything about the network path to the target (Host, Port, Kind,
Reached-through, and Forwarding, on the reasoning that a forward is
itself a path); right is everything about identity and authentication
(Name, User, Group, Access).

**Cost**: Name and Group, which open the form today, move to the second
column, a real loss of orientation in a book of similar internal
hostnames that depend on the name to tell them apart at a glance, not
only a cosmetic reorder. Forwarding filed under the same column as
Topology stops reading as a peer of Access, foreclosing ever treating a
forward's own authentication as something Access-shaped.

**Forecloses**: a column that is purely "prove who I am," since Group
sits there unrelated to the actual proof.

### Option C: Progressive disclosure, staged for the common case

General and Access stay exactly as they are today, drawn in full: ADR-0057
already put the credential field where it is because it is the thing Save
reads, and General is what every host needs regardless of shape. Topology
and Forwarding each fold to a minimal line when a host's own data says it
is not using them, expanding automatically the instant it is.

**Cost**: a new user who has never used a bastion will not see the Kind
picker or the "reached through" concept anywhere near General's own
fields until noticing a "Change" link exists at all. Discovering the
feature depends on reading a one-line summary as an invitation rather
than seeing three kind pills already in view.

**Forecloses**: a form whose visual weight is the same regardless of what
a host needs (which the two-column layout still has today); easy
side-by-side scanning of topology across many open editors, a job this
form was never the right surface for once ADR-0060 gave the host list
itself that view.

## Decision

Option C, chosen directly after reviewing all three rendered mockups
against the real components. Concretely:

- **What actually triggers each fold to open.** Topology opens when
  `values.kind !== 'direct'`, or `values.proxyJump !== ''`, or the host
  already carries another one (`carried.length > 0`,
  `HostTopologyFields`'s own existing prop). That third condition is
  added here, beyond what the reviewed mockup checked, for the same
  reason ADR-0060 named for the host list: a host whose manual `kind`
  disagrees with what it actually carries is the computed truth
  outranking a stale manual field, not a case to leave folded shut.
  Forwarding opens when `values.forwards.length > 0`. Neither ever keys
  off create-versus-edit, matching ADR-0056's own no-special-casing rule
  directly: a brand-new draft and an existing plain host fold exactly the
  same way, driven by the same fields.
- **The manual override.** A "Change" link on Topology's own collapsed
  line opens the full Kind picker without touching any data. Component-
  local state (a plain `useState`, the same shape `proving`/`attempted`
  already take in this component), not persisted: closing the editor and
  reopening it re-evaluates strictly from data, so a host looked at and
  left `direct` folds again next time. Forwarding needs no equivalent:
  "+ Add forward" is already `ForwardsFields`'s own trailing control.
- **What actually collapses versus what already collapses for free.**
  `ForwardsFields` already renders nothing but the "+ Add forward" link
  for an empty list; the only change there is whether `FormSection`'s
  bordered heading wraps it at all, not a new empty state inside the
  component. Topology needs a real new collapsed view that does not exist
  today: one line (the host's own `HostKindIcon` glyph, the kind's label,
  "via {bastion}" when ridden) plus "Change," standing in for
  `HostTopologyFields` until opened.

Scope: `SessionWizard.tsx` and one new small collapsed-Topology-summary
piece. `HostGeneralFields.tsx`, `CredentialAccessFields.tsx`,
`HostKindPicker.tsx`, `ForwardsFields.tsx`'s own internals, and every
ADR-0056/0057/0058 banner placement rule are untouched.

## Consequences

**Good**: the common case, a plain direct host with no forwards, draws
two sections instead of four, with nothing hidden that the host actually
has. A bastion-routed host or one with forwards pays nothing extra: its
own data keeps the relevant section open from the moment the editor
mounts, whether that mount is a fresh draft mid-setup or a host reopened
for the fiftieth time.

**Bad**: the discovery cost named in Option C's own description above is
accepted, not solved here. A person auditing topology across many saved
hosts by opening each editor in turn is worse served by this than by a
flat view, but that job belongs to the host list itself (ADR-0060), not
to this form, so it is not treated as a regression this document owes an
answer for.

**Follow-up**: draw the collapsed and expanded Topology states, and the
now-borderless empty Forwarding state, into `design/canvas/gen.py`'s
existing `host_detail_panel()` before implementing, per the canvas-first
rule. The exact collapsed-line copy for a manually-tagged
jumpServer/target host that carries nothing and rides nothing (kind alone
triggers the open state, per the Decision above, so this line is never
actually shown folded, only worth naming as a case the copy has to still
make sense for if that rule is ever revisited) is a Phase 3 detail, not
fully specified here.
