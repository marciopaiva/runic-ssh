# ADR-0021: Put the shape control in the top strip

* **Status**: Accepted
* **Date**: 2026-08-25

## Context

Dividing the main area is reachable only from the command palette. Somebody
driving with a pointer cannot split at all, which is a gap in a feature the
README lists and the design canvas draws.

ADR-0020 left it there without meaning to. The canvas draws three trailing
controls on a group's strip and #137 built two of them: the `+` and the menu.
The third is a split icon, and it was deliberately not built, because splitting
is global in this model and a button sitting on one group's strip reads as
*split this rectangle*. ADR-0019 chose fixed shapes rather than a tmux tree and
ADR-0020 kept that, so *split this rectangle* is the one thing the model cannot
express. Rule 6 of ADR-0020 says the layout may reserve room to think and may
not show interface that lies, so it was left out and #147 recorded the
question.

This is the answer to #147.

## Options considered

### Option A: a group's strip, labelled as global

Cheapest, and it matches the canvas as drawn. The placement still says *this
one*: a control repeated on four strips either means four things or means one
thing four times, and nothing on the strip can say which.

### Option B: the status bar

The bar already mixes measurement with control, since the button that turns off
a broadcast lives there. It is also the only control that would sit among
numbers, and a shape chooser reading as one more reading is a poor trade for
the room it saves.

### Option C: the rail

The most discoverable place in the window, and the one people look at first.
ADR-0020 gave the rail a meaning, which is activities: the thing the sidebar is
showing, plus the gear. Layout is not an activity, and the fourth slot would be
the first item there that is neither.

### Option D: the top strip, at the trailing edge

Global, in the one region that is already global, and far from any rectangle.
The strip has held the mark, drag surface and window controls since ADR-0020
took the tabs out of it, and this is the first thing to go back in.

## Decision

Option D.

The reason is that the top strip is the only surface in the window that belongs
to the window rather than to something inside it. A control that changes the
whole main area belongs to the same scope, and putting it anywhere else means
choosing which inhabitant to attach it to.

Four buttons and not a menu, because there are four shapes and the current one
is worth showing. The palette keeps its entries; nothing about this makes the
keyboard path worse.

### What this amends

**ADR-0020** said the top strip is 36px of mark, drag region and window
controls, and nothing else. It now carries the shape control between the drag
region and the window controls. Everything else in that document stands,
including the reason the tabs are not up there: a tab names something inside
the main area and a shape names the main area itself.

The rule that a mockup contradicting the anatomy does not get implemented as a
frame on its own is what produced this document rather than a button.

## Consequences

**Good**: the main area can be divided with a pointer. The canvas can stop
drawing a control on a group's strip that nothing will build. #121 gains an
obvious neighbour when the divider becomes draggable.

**Bad**:

1. The strip loses drag surface. Four buttons is around 112px of a bar whose
   remaining job is being dragged, and on a narrow window that is a real share
   of it. The mark and the label keep their end, so a window can still be moved
   by the left half.
2. The shape is now visible at all times, including on the screens where there
   is nothing to divide. Splitting with nothing open gives empty rectangles,
   which is a legitimate way to set up and reads as a mistake the first time.
3. It is a fifth thing to place on macOS, where ADR-0005's inset already moved
   the mark and #132 has still never seen the window on real hardware. This
   sits at the opposite edge from the traffic lights, which is the reason to
   expect it to be fine and not a reason to claim it is.
4. A shape control that does nothing per group is still a shape control next to
   a group. Rule 2 of ADR-0020 is about naming a rectangle rather than about
   changing them all, so this does not reopen it, and it is close enough to be
   worth writing down.

**Revisit this** if the divider in #121 lands and resizing wants to live beside
choosing, or if a window narrow enough to matter turns out to be common, in
which case the four buttons fold into one that opens the four.

**They folded** (ADR-0022). Not for width in the end, but for count: eight
shapes is around 224px of a bar whose remaining job is being dragged. The
control is one button showing the shape in use, which opens them all.

**And the reason took a second control with it, for a day.** The switch for
typing into every rectangle at once moved here from the status bar, on the
maintainer's reading that a bar of measurements is the wrong place for a
control. The argument seemed to be this document's own: that switch is about
the window, and the top strip is the only surface that is.

**It was wrong, and it moved again the next day.** The switch is now at the
trailing edge of every group's own strip, which is the placement this document
refused for the shape control. The two are not alike, and the difference is
the whole of it: **this control means something per rectangle.** Which of them
receive what you type is a real question about each one. Which shape the area
is divided into is not a question about any of them. A control repeated four
times that means one thing four times is what this document refused. Four
switches that each decide a different rectangle read as four switches because
that is what they are.

What is left of the move through the top strip is the correction to ADR-0020,
which listed the count **and the way off** as the status bar's job. The bar
keeps the count and the whole top edge turning warn. The way off is beside the
way on, on the strip of the rectangle it is about.

**Resolved on 2026-08-30.** Bad #2 above named the cost and accepted it:
"splitting with nothing open gives empty rectangles, which is a legitimate
way to set up." ADR-0029 later hid the control anyway, on nothing open, as a
guard against a different bug (a group showing settings). That guard is gone
(#226); the control is visible and fully enabled on an empty Sessions
workspace again, which is what this document already decided it should be.

**The shape control moved again on 2026-08-31** (ADR-0046), out of the
Titlebar itself and into a new toolbar row beneath it, once SFTP needed a
home for its own split control and the Titlebar turned out to be the wrong
place to ask a second workspace to share. This document's reasoning is not
overturned: the new toolbar is a second surface that "belongs to the
window rather than to something inside it," the same test this document
applied to the Titlebar. `SyncToggle`'s own placement, settled two
paragraphs above, is unaffected; ADR-0046 gives the toolbar a *second*,
global broadcast control alongside it rather than moving it again.
