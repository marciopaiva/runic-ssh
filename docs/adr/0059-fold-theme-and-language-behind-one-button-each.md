# ADR-0059: Fold theme and language behind one button each

* **Status**: Accepted
* **Date**: 2026-09-03

## Context

ADR-0052 moved theme and language into Home's own toolbar, inline, citing
`SftpSplitControl`/`SftpSelectAllButton` as the reason not to hide them
behind a gear icon: "a small, fixed set of choices belongs visible in the
bar, not behind a click invented to hide it." What shipped from that
reasoning was seven small square buttons drawn flat, three for theme
(system/light/dark) and four for language (system plus each offered
locale), separated by a divider.

Found during a pre-v0.4.0 visual pass, comparing the shipped toolbar
directly against `SftpSplitControl` and `ShapeControl`, the two controls
ADR-0052 named as the precedent: neither of them draws its own choices
flat. Both fold every choice behind one button that keeps showing which
one is current, opening the rest only on click, `role="menu"` with
`role="menuitemradio"` items. `SftpSplitControl`'s own doc comment already
states the reason: "one button that opens the choices, not four shown at
once... a bare row of four buttons here and a single folded button there
read as two rules rather than one." ADR-0052 cited the right components
for the wrong property. "Undisguised" meant "in the toolbar, not behind a
gear," never "every choice drawn flat." The toolbar's own actual rule,
already established by the two controls it names, is the fold.

## Options considered

### Option A: Leave it as flat chips

Keep seven buttons in a row. Consistent with a literal reading of "visible
in the bar," inconsistent with what the two named precedents actually do.

**Cost**: keeps the toolbar the one surface in the app that answers "how
many things is this" with a flat row instead of a fold, for no reason
tied to theme or language being different in kind from the number of SFTP
destination rows or the terminal grid shape.

### Option B: Fold theme and language behind one shared button

One icon opens a single popover offering both settings together.

**Cost**: reopens the exact question ADR-0052 already answered against
this shape ("set once and forget... duplicating them... would add
permanent chrome") from the other direction: one shared control merging
two unrelated settings is the same complaint ADR-0052's own first cut
drew, a gear icon standing for more than one thing at once, just with the
gear redrawn as something else.

### Option C: Fold theme and language behind one button each

Two separate fold controls, each following `SftpSplitControl`'s own
shape exactly: a trigger showing the current choice's glyph (the theme
icon in use, or the current locale's flag), a `menu` of `menuitemradio`
options on click, closed by a click outside or Escape.

**Cost**: two small components with the same click-outside/Escape
handling `ShapeControl`/`SftpSplitControl` already each carry, a third and
fourth copy of it rather than a shared one; not extracted here since a
generic fold component was not the question this pass was scoped to
answer, and forcing one out under time pressure risks getting the
abstraction wrong for whichever caller comes third for real reasons
rather than this one's four.

## Decision

Option C. Two toolbar buttons instead of seven, each showing what is
currently chosen without opening anything, matching the fold every other
"which one of several" control in this toolbar already uses.
`ThemeLanguageControls.tsx` keeps its own doc comment naming the
correction directly, the same way a superseded ADR states what changed
rather than leaving the reader to infer it from a diff.

## Consequences

**Good**: the toolbar now answers "how many things can this be" the same
way everywhere in it: fold behind one button, not a name change to what
the fold rule catches. Seven pieces of chrome become two; the two that
remain still show, at a glance, which theme and which language are
active, the property ADR-0052 actually wanted.

**Bad**: two more copies of the click-outside/menu-popover mechanism
`ShapeControl`/`SftpSplitControl` already carry, unshared. A fourth
occurrence should not be added the same way without asking whether that is
finally the point to extract a shared `FoldControl`.

**Follow-up**: no canvas artboard drew the flat seven-chip toolbar
specifically (`HomeHosts.dc.html` draws the toolbar without zooming in on
this control), so there is nothing there to retire; worth a close look if
Home's own toolbar is redrawn for another reason.
