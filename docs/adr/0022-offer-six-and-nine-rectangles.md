# ADR-0022: Offer six and nine rectangles

* **Status**: Accepted
* **Date**: 2026-08-25

## Context

ADR-0019 divided the panel into at most four panes and said plainly that the
number was the shape of the layout rather than a measurement. Its `Revisit
this` was specific:

> Revisit the four-pane limit when somebody measures four terminals painting at
> once, and lower it to two if the measurement says so rather than raising it
> because nothing has broken yet.

Somebody measured (#123). Four terminals held a 16 ms median gap between frames
with the worst at 24 ms, so four was justified rather than merely chosen. The
same measurement showed the margin was thinner than the one-terminal figure
implied: headroom fell from about seven times to about two to three, and
ADR-0019 recorded that it was no longer the kind that could absorb a raise
without being measured again.

ADR-0020 then took the chrome off the terminal. The rail costs 48px of width
once, the top strip is 4px shorter than the titlebar it replaced, and a pane
header stopped being an addition to the tab strip. The maintainer's reading of
the result was that the window had gained usable area and could carry more
rectangles.

So the question is the one ADR-0019 parked, asked from the other direction.

## What the measurement says

Measured again on 2026-08-25 at six and nine terminals, recorded in
`docs/measurements/terminal-throughput.md`. The four-terminal row reproduces
the earlier run, which is what makes the new rows comparable.

Nothing stutters. The worst frame gap anywhere is 61 ms against the 100 ms
where a keystroke starts to look dropped.

What changes is throughput. Fed at the rate a session actually delivers, four
terminals take the full 11.9 MB/s each on offer, six take 10.4, and nine take
8.1. The ceiling is the aggregate, about 120 MB/s whatever the count, so nine
sessions each asking 9 to 15 MB/s want 81 to 137 from a number that does not
grow. **The headroom ADR-0019 was protecting is spent somewhere between six and
nine terminals all busy at once.**

The other limit is arithmetic and no renderer moves it. Every row of groups
costs 48px of chrome, so three rows of them cost nine lines of terminal at
1440x900 and twelve at 1920x1080. `top` wants twenty-four.

## Options considered

### Option A: keep four

Defensible on the measurement alone, and it ignores that the two shapes at six
are not the same shape. Three columns by two rows gives 43x15, which is the
same fifteen lines four rectangles give today with two more rectangles. Nothing
in the measurement argues against that one.

### Option B: six only, in both arrangements

Three columns by two rows, and two by three. Stays inside the throughput the
renderer sustains, and 2x3's nine lines are a shape the person choosing it can
see for themselves.

### Option C: six and nine

Both arrangements of six, and 3x3.

## Decision

Option C, with the reason for nine written down rather than assumed.

Nine rectangles is not nine hosts streaming. It is the shape somebody reaches
for to restart a service across a fleet and watch nine hosts answer: short
commands, a few hundred bytes each, and the broadcast switch armed. That load
is nowhere near the pacing this was measured against, and nine lines is enough
to read `active (running)`.

The measurement is what tells us which activity nine rectangles is for. It does
not forbid the shape; it says the shape is wrong for a different activity, and
the person choosing it is the one who knows which they are doing.

That is a weaker justification than four had and it is the honest one. Four is
justified by measurement. Nine is offered on a stated assumption about how it
gets used, and this document is where that assumption is written so that the
next person can find it and disagree.

### What this amends

**ADR-0019** loses its four-pane limit and keeps everything else: fixed shapes
rather than a tmux tree, typing into every rectangle off by default and
disarming itself, and the whole of its Bad section. Its `Revisit this` is
answered, in the direction it warned against, with the measurement it asked for.

**ADR-0021** said four buttons in the top strip and its own `Revisit this` said
they fold into one that opens the four if the width ever mattered. The count is
that trigger: eight buttons is around 224px of a bar whose remaining job is
being dragged. The control is now one button showing the shape in use, which
opens them all.

### The names changed with it

`Grid` was `single`, `columns`, `rows` and `grid`. `columns` meant two of them
and stopped being a usable name the moment there were three, so the shapes are
named for their dimensions, columns by rows. The list is the source and the
type is derived from it, so a shape added there is a shape every caller sees,
including the test that walks every shape and used to walk a hand written four.

`3x1` joined the day after this was accepted, on the maintainer's ask, and the
cost of adding it is the evidence for that sentence: one entry in the list, one
message in three catalogues, and a glyph that draws itself from the name. It is
also the shape with the most rows of any that divides the area, 43x34 against
the 43x15 of three columns by two, which is the same point the table above
makes about rows being where the chrome is paid.

## Consequences

**Good**: 3x2 is six rectangles at the same fifteen lines four give today, which
is the shape the extra area actually bought. The broadcast switch reaches nine
hosts. Adding a shape is one entry in one list.

**Bad**:

1. **Nine is offered on an assumption rather than on a measurement**, and the
   assumption is about how somebody works. If a person opens nine hosts that
   stream, the renderer will not keep up and nothing on screen will say why.
   The measurement says where the edge is; the interface does not.
2. **2x3 gives nine lines** and is offered anyway, because which of the two
   arrangements of six suits the work is not something this document can know.
   Somebody will pick it once, find it cramped, and pick the other.
3. Every shape behind one button is one more click than four shapes in the
   open. The shape in use is still readable without opening it, which was the
   reason for buttons in the first place.
4. The rename touches forty-three call sites in one pass. Nothing persists a
   layout, so there is no migration, and that is the only reason it was cheap.

**Revisit this** if somebody drives nine streaming hosts and finds the
throughput ceiling in anger, in which case the answer is not a smaller grid but
telling them what happened. Or if the divider in #121 lands, which makes the
fixed shapes a starting point rather than the whole vocabulary.
