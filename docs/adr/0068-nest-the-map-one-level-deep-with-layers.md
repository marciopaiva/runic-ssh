# ADR-0068: Nest the map one level deep with layers

* **Status**: Accepted
* **Date**: 2026-09-11

## Context

`docs/plans/map.md` names the layer as the fourth and last object of the
spatial interface ADR-0064 opened: a map inside the map. The component
(v0.6.0), the line (v0.7.0, ADR-0065) and the vision (ADR-0067) are built.
On 2026-09-11 the maintainer asked for the whole model before v0.8.0 opens,
so the layer moves up from v0.9.0 into the same release, and answered the two
questions the prototype left open: the map has **one level** of layers, and
**a line never crosses** one.

Most of the layer is already in the tree, waiting:

* `Layer` is `{ id, name }` in `config/workspace.rs` and `ipc/workspace.ts`,
  in a `layers` array declared empty from v0.6.0 so this release adds data
  and never migrates. `validate` checks the id and the name.
* `Component.layer` and `Vision.layer` already exist, optional, absent on the
  outermost map. `componentsOn(workspace, layer)`, `visionsOn`, `addComponent`
  and `addLocal` take a layer; `validate` keeps one local machine per layer
  (ADR-0065) and a vision on the same level as its members (ADR-0067).
* `MapStage` draws one level, hard-wired to `null`, and its toolbar already
  has a crumb that reads `Runic`.

What is missing is the layer as a thing on the map: how it is drawn closed,
what entering it means, what the level inside holds, how the crumb and
Escape return, and which references `validate` and `prune` must keep honest.
The prototype (`runic-proposta-modelo.html`) settled the shape: the layer is
a **monolith** on the ring; click enters, the stage clears, the crumb grows,
Escape returns; inside, the monolith stands where the rune stood and holds
what the rune holds (terminal, file browser, monitor, this machine, vision);
the rune is the layer with no name, where what was put in none lives.

## Options considered

### Option A: one level, the level as stage state, references checked

`Layer` stays `{ id, name }` plus an optional `position`, where its monolith
sits on the outermost ring, omitted when the map places it. The level in
view is state of the stage, `null` for the rune or a layer's id, never
written to the file: a fresh launch opens on the rune. Entering a layer
swaps the set of components and visions the stage lays out, and the hub
becomes the layer's monolith, with the rune's radial and menu. The crumb
shows `Runic › <name>`; the crumb's first segment and Escape return.

`validate` grows three rules: a `component.layer` or `vision.layer` names a
layer the file has; both ends of a link sit on one level; a layer's name is
unique among layers, since it is what the crumb shows. Removing a layer
moves what it held to the outermost map, positions dropped so the ring
places them; nothing is closed, since a session does not belong to a layer.
`prune` is unchanged: a layer has no host to lose.

A terminal mounted for a component on another level stays mounted and
hidden (ADR-0014), exactly as a collapsed window's is. Broadcast sets are
per level without a rule of their own, because a line never crosses one.

Costs: a fifth stage state, and every place that reads "the level" (the
picker's duplicate check, the local machine's one-per-level, the drop
targets, search) reads it from there rather than from a constant.

### Option B: layers inside layers

`Layer` gains `parent`, the crumb grows as deep as the nesting, and a line
may join components whose nearest common level allows it.

Costs: a path to resolve on every read, a crumb with no natural width, a
rule for lines that nobody has asked for, and a deletion that has to decide
what happens to grandchildren. The maintainer chose one level on
2026-09-11; a `parent` field is optional and would land without a migration
if that ever changes, which is why this option is recorded rather than
foreclosed.

### Option C: the layer is the host's `group`

Reuse `Session.group`, the tag ADR-0060 reduced it to, as the layer: a
component is on the level its host's group names.

Costs: a host with components on two levels is impossible, the map's
structure leaks back into `sessions.json`, which ADR-0064 keeps untouched,
and the group is already spoken for as Home's topology tag.

## Decision

Option A.

It beats Option B because one level answers the use the maintainer named
(environments, or clients, or anything) and costs one field and one state,
while nesting costs a rule for every object the map has. It beats Option C
because the layer is the map's own structure, and ADR-0064's whole point is
that the map's structure lives in the map's file.

The tradeoff accepted is that the level is not remembered between launches.
That is deliberate: the rune is the map's front door, and a launch that
opened three levels down would have to explain where it was.

Rules restated so the layer cannot loosen them:

* One level: a layer holds components and visions, never a layer. `Layer`
  has no parent.
* A line joins two components on one level (`validate` refuses the rest).
  ADR-0065's families and directions hold unchanged within it.
* One local machine per level (ADR-0065), a vision and its members on one
  level (ADR-0067).
* Entering or leaving a layer writes nothing. Removing a layer removes only
  the layer: its contents return to the outermost map.

## Consequences

**Good**: `workspace.json` grows one optional field, and the three arrays
ADR-0064 declared are now all in use, which closes the model the plan
opened in v0.6.0. Everything that already took a `layer` argument starts
being called with one. A layer is a place, so a person with two clients or
three environments stops seeing them on one ring.

**Bad**: a component or vision moves between levels only by its menu
(there is no region to drop it in), which is one more entry in a menu
already carrying membership. A layer's monolith is on the ring with the
components, so a map with many layers and many loose components shares one
ring between them, and the honeycomb past eight. Search finds only the
level in view.

**Follow-up**: a "Move to" that lists layers and the rune, on the component
and the vision menus, ships with this. If the preview's signal ever asks
for nesting, `parent` is the field and this record is the one to
supersede. The cut of the classic workspaces stays where ADR-0066 left it.
