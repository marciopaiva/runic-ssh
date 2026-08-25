# ADR-0020: Put the tabs in groups and the activities in a rail

* **Status**: Accepted
* **Date**: 2026-08-24

## Context

The interface has been decided one surface at a time. ADR-0005 chose to draw our
own window chrome and put the session tabs in it. ADR-0015 said a session's
surface renders flat in that session's panel. ADR-0017 gave every host form its
own tab. ADR-0019 divided the panel into panes and let typing reach all of them.
Each of those is sound on its own and none of them describes the window.

The cost of that shows up as four descriptions of the visual system with no
authority between them: the twenty-two artboards under `design/canvas/`, the
token file and its guard, a proposal document on `feat/visual-improvements`
which declares itself the source of truth for that branch, and the mockups the
maintainer works from. When they disagree, whoever is implementing decides, and
the decision is not recorded anywhere.

Two things force this now rather than later. SFTP has no code yet (#127) and
therefore no home, and `ProxyJump` (#133) adds a second kind of thing a session
can be doing. Both land in v0.2.0 and v0.3.0. A surface built before the anatomy
is written is a surface that has to be rebuilt.

There is also a defect the current arrangement produced and cannot see.
ADR-0019 gave each pane a 28px header naming its session, while the tab strip in
the titlebar names every session. Two mechanisms answer the same question, they
can disagree, and nothing fails when they do.

## Options considered

### Option A: keep the anatomy and extend it

Tabs stay in the titlebar. Panes keep their headers. SFTP arrives as another
kind of tab, and the pane model grows whatever it needs.

Cheapest by a wide margin, and it breaks nothing. It also keeps the duplication
above, and it has no answer for more sessions than panes: a layout of slots
holding one session each cannot express six sessions in four rectangles, which
is an ordinary thing to want when watching a pool.

### Option B: a rail for activities, one tab strip for everything

An activity rail on the left switches the sidebar between sessions, SFTP and
settings. The tab strip stays global, above the main area, and panes remain
slots.

Gives SFTP a home and keeps `layout.ts` almost as it is. It also keeps both
mechanisms, and the global strip becomes actively misleading once the panel is
split: it lists every session while only some are on screen, and nothing on it
says which.

### Option C: a rail for activities, and groups that own their tabs

The main area is a grid of groups. A group is a 28px strip of tabs plus the body
of the active one. Everything opened is a tab in some group: a terminal, an SFTP
browser, a host form, settings. The rail switches what the sidebar shows. The
top strip keeps the mark, the drag region and the window controls, and nothing
else.

This is the model of every editor the target user already has open, which is not
a small thing for a tool whose pitch is that it should be obvious.

## Decision

Option C.

The reason that decides it is not the rail. It is that a group makes the tab
strip and the pane header the same object, so the question "which session is
this rectangle" stops having two answers that can drift. Six sessions in four
rectangles becomes expressible, and the 28px a pane header used to cost is now
where the tabs live rather than an addition to them.

The tradeoff accepted is that this is not a CSS change. ADR-0019 models a layout
as slots holding at most one session each; groups hold a list and an active
index, so `src/features/terminal/layout.ts` is rewritten rather than extended
and the thirty-three tests in `tests/terminal-layout.test.ts` are rewritten with
it. That is paid now, while the only caller is the terminal, rather than after
SFTP adds a second kind of tab to the same structure.

### What this amends

* **ADR-0005** keeps its decision that Runic draws its own window chrome, and
  loses the part that put the session tabs inside the titlebar. The top strip
  is 36px of mark, drag region and window controls. The tabs live in groups.
  The strip is 4px shorter than the titlebar it replaces, so the rail is paid
  for in 48px of width and not in height. On macOS, where ADR-0005 chose the
  overlay titlebar so the native traffic lights stay where they belong, the
  mark moves right by that inset; the rail begins below the top strip on every
  platform, so it never sits under them.
* **ADR-0015** holds with one word moved. A session's surface renders in the
  group whose active tab that session is, rather than in that session's panel.
  A host key prompt therefore appears inside one rectangle while the terminals
  around it stay readable, which is what that rule was always for.
* **ADR-0017** is untouched. A host form is a tab and settings is a tab, which
  is what the rail's gear opens. The gear is an action rather than a view, so it
  takes no selection marker and does not change the sidebar.
* **ADR-0019** keeps its safety argument and loses its data model. Splitting is
  still fixed shapes rather than a tmux tree, typing into every pane is still
  off by default and still disarms itself, and the reasons in its Bad section
  all still hold.

### The rules a surface has to satisfy

1. **One chrome, always.** Top strip, rail and status bar exist on every working
   screen. Splitting, broadcasting and a host key prompt never swap the window
   for a different product.
2. **A group owns its tabs.** Every rectangle in the main area is a strip plus
   the body of its active tab. There is no second mechanism naming a rectangle.
3. **Everything opened is a tab.** A surface belonging to a session renders in
   the group whose active tab it is.
4. **The sidebar closes, the rail does not.** Closing the sidebar gives its
   280px to the terminal. The rail stays, so the way back is the icon that
   closed it.
5. **State is shape first, colour second.** Connection state is carried by a
   marker whose shape says it. Colour is the second signal, never the only one.
6. **Nothing on screen the backend does not have.** No tags, no global search,
   no health line, no shortcut that is not bound. The layout may reserve room to
   think. It may not show interface that lies.
7. **Safety outranks tidiness.** The markers below are not decoration and are
   not negotiable per screen.

A mockup that contradicts these does not get implemented as a frame on its own.
This document changes first, or it does not change.

### What armed broadcast means under groups

Typing reaches the **active tab of each group**. A session sitting behind
another in the same group is connected and is not receiving, which is new and is
the rule most likely to be got wrong.

While it is armed:

* the rail is pinned to the sessions view and the other activities are inert,
  marked with a lock, because switching to a file tree mid-command is not a
  thing to allow;
* every receiving tab carries a checked square, and every receiving group a warn
  border;
* the entire top edge of the status bar turns warn, and carries the count and
  the way off;
* the sidebar marks each receiving host and labels the held-out ones `SPARED`.

The sidebar may still be closed while armed. Every receiving host has a tab
naming it, so the markers survive; the sidebar answers a second question, which
connected sessions are *not* receiving, and that is worth having rather than
required.

## Consequences

**Good**: one anatomy, written down, that a new surface inherits instead of
re-deciding. SFTP and `ProxyJump` arrive into a shape that already exists. Six
sessions in four rectangles becomes expressible. The duplication between the tab
strip and the pane header is gone, and with it a class of disagreement nothing
tested for. Chrome above the terminal drops from 40px to 36px. The `design/`
canvas gets a single record to be rebuilt from, and `docs/design/` stops being a
second one.

**Bad**:

1. `layout.ts` is rewritten, not extended, and `tests/terminal-layout.test.ts`
   goes with it. Thirty-three passing tests are deleted and replaced. Some of
   what they proved will be re-proved and some will be lost without anyone
   noticing which.
2. The broadcast rule changed shape. "Every pane on screen" was checkable by
   looking; "the active tab of each group" hides a connected session behind
   another one. It is defensible and it is a new way to be surprised.
3. The rail costs 48px of width on every screen forever, including the ones with
   nothing to switch to. On a small laptop that is real.
4. A group's strip is a new place for state to drift from the sidebar, which is
   the same class of defect this decision removes elsewhere. It is one strip
   rather than two mechanisms, so it is smaller, not absent.
5. **The macOS inset is now load-bearing for two things.** ADR-0005 already
   accepted it, and accepted that it has to track the platform. It now also
   decides where the mark starts, and it sits directly above the rail. Nobody
   has opened this application on macOS (#132), so the one arrangement that
   cannot be checked by reasoning is the one nobody has seen.
6. The anatomy on `feat/visual-improvements` is superseded. That branch had the
   right instincts, including the rule about not drawing what the backend does
   not have, and part of its work does not land in the shape it was written in.

**Follow-up**:

* Rebuild `design/canvas/` from the accepted artboards and delete the
  proposal document on the branch, so there is one record rather than four.
* #132 gains a line: the top strip and the inset above the rail are the first
  thing to look at on a Mac, because ADR-0005's inset now carries the mark too.
* #122 (keyboard shortcuts) is worth more under this model, because moving
  between groups is now a thing to move between.
* #121 (draggable divider) becomes resizing groups.
* `main.tsx` pins `data-theme` to dark on the branch, which makes the light
  theme unreachable while its tokens still exist. Rule 5 and the settings
  surface here assume that pin is undone and replaced with a real control.
  `tests/design-tokens.test.ts` cannot catch the pin, and should learn to.

**Revisit this** if a person driving four groups on a 13 inch screen finds the
rail is the thing they want back, or if #123 measures four terminals painting
badly enough that the pane limit drops to two, which would make groups
expensive machinery for a shape nobody can use.
