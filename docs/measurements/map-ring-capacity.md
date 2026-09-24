# How many things fit on the map's ring

Measured on 2026-09-24, on the maintainer's WSL2 machine, against the
`docs/map-ring-capacity-spike` branch. It answers the question issue #386
left open: ADR-0022 measured how many rectangles a *list* of sessions can
show (nine, before a grid reads better than a list); nothing measured how
many layers, visions and free components a *ring* on the map can hold before
the honeycomb it falls back to (`placeChildren`, `src/features/map/layout.ts`)
is the only way to read it.

## What was measured

Two things, one exact and one visual.

**The geometry.** `honeycombSlotPosition(slot, centre, step)` places
concentric hexagonal rings of 6, 12, 18, 24... slots around a centre, at
`HONEYCOMB_STEP = 118` map pixels. For each ring, the distance between two
adjacent slots was computed directly from that function (not from a
hand-derived formula) and checked against the 140px `max-w-[140px]` name
label every node sets (`ComponentNode.tsx`, `VisionNode.tsx`,
`MonolithNode.tsx`). This is now a regression test:
`tests/map-layout.test.ts`, `'spaces honeycomb neighbours closer than a
glyph label...'`.

**Three populations, screenshotted.** `gen-fixtures.mjs` seeds a synthetic
`workspace.json` and `sessions.json` (no component, vision or layer given a
`position`, so the map's own placement decides where everything lands) for
8, 14 and 20 items, split a quarter layers, a quarter visions, half free
components, matching ADR-0068's own "many layers and many loose components"
wording for what shares the ring. Each was opened in the built app on an
isolated Xvfb display and the Map workspace screenshotted at 100% zoom, no
interaction beyond opening it. 8 is `RING_MAX`, the last count that still
gets a plain ring; 14 is `RING_MAX` plus the first full honeycomb ring (6
slots); 20 is partway into the second honeycomb ring.

## Results

| population | layout | neighbour spacing | label track | verdict |
| --- | --- | --- | --- | --- |
| 1-8 | ring (`RING_MAX`) | radius-bound, not fixed: ~200px+ on a 1440x900 stage | 140px | clear |
| 9-14 | honeycomb ring 1 (6 slots) | 118.0px | 140px | overlapping |
| 15-26 | honeycomb ring 2 (12 slots) | 122.2px | 140px | overlapping |
| 27-44 | honeycomb ring 3 (18 slots) | 122.9px | 140px | overlapping |
| 45-68 | honeycomb ring 4 (24 slots) | 123.2px | 140px | overlapping |
| ... -> infinity | honeycomb ring k -> infinity | -> 123.6px (asymptote) | 140px | overlapping, never clears |

The screenshots agree with the numbers. At 8, every label sits clear of its
neighbours; the ring's radius scales with the stage, not with the count, so
eight items on a 1440x900 window space out to roughly 200px between
neighbours, well past the label track. At 14, `spike-host-3`'s label runs
into `spike-host-4`'s glyph and into the `Layer 2` box beside it; the boxes
themselves touch, since a layer monolith is 78-108px on a side and a
honeycomb ring's spacing at that point is 118 to 122px, close enough that
glyph and label collide together, not just label against label. At 20 the
picture is the same severity as 14, not worse: a `spike-host-9` label runs
into the `Vision 0` glyph beside it, but nothing about the second honeycomb
ring reads as more crowded than the first.

## What the numbers say

**The tightest spacing the honeycomb ever produces is at its very first
ring, and it equals `HONEYCOMB_STEP` exactly.** `honeycombSlotPosition`'s
neighbour distance at ring `k` is `2 * step * k * sin(pi / (6k))`, which
equals `step` itself at `k = 1` and increases monotonically toward
`step * pi/3` (about 4.7% more) as `k` grows without bound. There is no
ring, at any population, looser than the first one. That means the
honeycomb's crowding is not a function of how many things are on the map:
it is a single fixed comparison, `HONEYCOMB_STEP` against the label width,
decided the moment `RING_MAX` is exceeded and never revisited as the count
grows.

**Today's numbers land on the wrong side of that comparison from the first
honeycomb item on.** 118 is already less than 140, so item 9, the first one
ever placed off the ring, has its label crowded. Fourteen and twenty are
not worse cases than nine; they are the same case, checked twice.

**The glyphs collide too, not only the labels.** The 118-124px spacing is
close to or smaller than a layer monolith's own 78x108px box or a vision
aperture's 96px circle, so the shapes themselves press against each other
at the first honeycomb ring, visible in the 14- and 20-item screenshots.
The label overlap is the sharper number because it has an exact width to
measure against; the glyph overlap is the same underlying cause.

## What this decides for the map

* **ADR-0068's "Bad" consequence undersold the cost.** It reads "the
  honeycomb past eight," which describes a layout that degrades as a
  population grows. What was measured is a layout that is already crowded
  at population nine and stays at that same severity forever after; there
  is no larger population where it gets meaningfully worse, and no smaller
  honeycomb population where it is still clear.
* **The fix, if one is ever taken, is one number.** Because the tightest
  ring is always the first one and its spacing equals `HONEYCOMB_STEP`
  itself, raising `HONEYCOMB_STEP` to 140px or more (today: 118, about 19%
  higher) would keep every honeycomb ring's labels clear, forever, by the
  same monotonic argument that makes 118 crowded forever. A narrower label
  gets the same result from the other side. Neither is proposed here: per
  issue #386's own closing comment, this spike is the measurement ADR-0068
  already priced in as an accepted, revisit-if-it-bites tradeoff, not a
  decision to revisit it now.
* **The ring itself has no such number, because it doesn't need one.** Its
  radius scales with the stage, so it spaces out rather than crowding as
  the eight slots fill.

## What this does NOT establish

* **Nothing about zoom levels other than 100%.** `HONEYCOMB_STEP` is a
  map-space constant and the label lives in the same transformed stage, so
  the *ratio* between them should hold at any zoom, but that was not
  checked against a rendered screenshot at, say, 50%.
* **Nothing about a stage smaller than 1440x900.** The ring's radius is
  `min(width, height) * 0.32`; a narrow window could crowd the ring itself
  before the honeycomb ever starts. Not measured here.
* **Nothing about counts past 20 by screenshot.** The rings from 26 to 44
  and beyond are covered by the geometric formula only, not by a rendered
  image; the formula's own convergence is what stands in for the picture.
* **Nothing about whether the crowding is a usability problem worth
  fixing**, only that it exists and how large it is. That judgment, per
  issue #386, belongs to ADR-0068's own accepted tradeoff, not to this
  measurement.

## How to run it again

```sh
pnpm vitest run tests/map-layout.test.ts

pnpm tauri build --no-bundle
node docs/measurements/map-ring-capacity/gen-fixtures.mjs 14 <config-dir>
# <config-dir> becomes XDG_CONFIG_HOME/com.runicssh.client

Xvfb :95 -screen 0 1440x900x24 &
DISPLAY=:95 XDG_CONFIG_HOME=<dir holding config-dir> XDG_RUNTIME_DIR=<dir, mode 700> \
  WEBKIT_DISABLE_COMPOSITING_MODE=1 src-tauri/target/release/runic-ssh &
DISPLAY=:95 xdotool mousemove 245 54 click 1   # the Map tab
DISPLAY=:95 import -window root shot.png
```
