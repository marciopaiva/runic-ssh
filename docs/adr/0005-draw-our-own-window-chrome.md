# ADR-0005: Draw our own window chrome, keeping native controls on macOS

* **Status**: Accepted
* **Date**: 2026-08-22

## Context

The approved visual direction puts the session tabs in the titlebar, in the
manner of Windows Terminal and VS Code. That is not a styling choice that can be
applied later: the tab strip, the window controls and the drag region occupy the
same 38 pixels, so whether we own that strip decides the top-level layout of
every screen.

Tauri exposes the choice as `decorations` in `tauri.conf.json`, plus
`data-tauri-drag-region` for marking draggable areas. Turning decorations off
hands us the whole title area, and with it everything the OS was doing there.

What the OS does there differs per platform, and this is the part that decides
the ADR:

* **Windows 11** attaches Snap Layouts to the maximize button. The shell finds
  that button by hit-testing the non-client area, so a button drawn in HTML gets
  no snap flyout unless we answer the hit test ourselves.
* **macOS** places the traffic lights at a fixed inset and users expect them
  there, along with double-click-to-zoom on the title area. The platform offers
  a middle path: an overlay titlebar that keeps the native buttons over our
  content.
* **Linux** has no single answer. Client-side decorations are the GNOME norm and
  server-side decorations the KDE one; resize borders and window shadows behave
  differently under X11 and Wayland, and tiling window managers ignore most of
  it.

Also relevant: window controls are a place screen readers and keyboard users
expect the system menu, `Alt+Space` on Windows included. Anything we draw, we
also have to make reachable.

## Options considered

### Option A: Keep native decorations

The OS draws the titlebar; our tab strip sits underneath it. Zero platform work,
Snap Layouts and traffic lights and the window menu all behave correctly for
free, and accessibility is the system's problem rather than ours.

The cost is the design. Roughly 38 pixels of vertical space go to a bar showing
a title the user does not need, on an app whose pitch is that it looks modern.
It reads as a generic Tauri window, which is the specific outcome the visual
direction exists to avoid.

### Option B: `decorations: false` on all three platforms

We draw everything: tabs, minimize, maximize, close, drag regions, resize edges.
Complete control and one code path for the chrome, identical on every platform.

The cost is that we inherit every behavior we removed. Snap Layouts needs hit
testing on Windows. macOS users lose the traffic lights they expect, or we
redraw them and get the details subtly wrong. Linux resize borders and shadows
become ours to tune per compositor.

### Option C: Custom chrome on Windows and Linux, overlay titlebar on macOS

Windows and Linux run `decorations: false` with our own controls. macOS uses the
overlay titlebar style, so the native traffic lights stay where users expect
them and our tab strip flows behind them with a left inset.

Two code paths for the chrome, and a macOS-specific inset that has to track
Apple's button placement. In exchange the platform-native expectation that users
feel most strongly, the traffic lights on macOS, is met by the platform itself.

## Decision

Option C. Accepted on 2026-08-22.

The deciding factor is that the two platforms differ in what the user considers
non-negotiable. On Windows the strong expectation is Snap Layouts, which we can
satisfy from our own chrome by answering the hit test. On macOS the strong
expectation is the traffic lights themselves, which we would be reimplementing
rather than supporting, and reimplemented traffic lights look wrong to a macOS
user in a way that is hard to name and easy to notice.

The tradeoff accepted is two chrome implementations and a per-platform layout
inset, in a surface that is purely cosmetic and therefore easy to under-test.

## Consequences

**Good**: the tab strip lands in the titlebar as designed, and the vertical
space a native titlebar would have taken goes to the terminal. macOS keeps
correct traffic lights without us drawing them. Theme tokens reach the window
chrome, so a custom theme colors the whole window rather than stopping at an
OS-drawn bar.

**Bad**: window management edge cases become our bugs. Snap Layouts, double
click to maximize, `Alt+Space`, drag-to-unmaximize, resize borders under
Wayland. The test matrix for a decorative surface triples. A Linux compositor
that handles undecorated windows badly leaves the user with a window they cannot
resize, and we will hear about it as a crash-level complaint. Keyboard and
screen reader access to the window controls has to be built and verified by
hand, where Option A would have given it to us.

**Bad, specifically**: this is a `tauri.conf.json` change with per-platform
configuration, which is exactly the kind of divergence `docs/architecture.md`
otherwise avoids by choosing `russh` over an external binary.

**Follow-up**: verify Snap Layouts on Windows 11 before v0.1.0 ships, since that
is the one behavior most likely to be silently missing (#28). Revisit this
decision if Tauri ships a first-class overlay titlebar API for all three
platforms, which would collapse the two code paths back into one.

**Done, 2026-08-23**: the escape hatch this ADR asked for exists (#29). It is a
command in the palette and a `nativeDecorations` line in `settings.json`,
default off, applied to the live window and stored for the next launch.

Two things it taught, both recorded where the code is rather than only here.
The title area turned out to have three arrangements and not two. A natively
decorated window and a macOS overlay window both let the system draw the
controls, and only one of them has anything floating over our bar, so the
`bool` that described it became `TitleArea`, and the frontend is told which
arrangement it is in rather than inferring it from a pair of fields that happen
to coincide. And the setting is deliberately ignored on macOS: honouring it
there would remove the traffic lights, which is the opposite of an escape
hatch.
