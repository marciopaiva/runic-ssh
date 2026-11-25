# Brand and screenshots

`logo.png` is the source mark. `logo-dark.png` and `logo-light.png` are derived
from it by `generate-logo-variants.mjs`, and the application icons by
`generate-icons.mjs`. Neither derived set is edited by hand.

## Screenshots

`tour-*.gif` is in the README. They are captures of the running
application connected to a real SSH server, not the design canvas and not a
mockup. A mockup in a README is a promise the product has not made.

Which build was in frame is recorded per file below, because it is not the
same claim for all of them: `screenshot-hostkey-*` and `tour-*` came off a
packaged release build.

Each screen has a `-dark` and a `-light` file, and the pair **must be the same
size**: the README serves them through `<picture>` with `prefers-color-scheme`,
and a mismatch shifts the page when a reader's theme changes.

### `tour-*.gif` (v0.9.0)

One 880x548 clip of 534 frames at 12 a second, 45 seconds, looping, about 1.1 MB
in the light take and 1.4 MB in the dark one. It walks the screens in one continuous recording of one window: the Hall,
the Bar (`@` twice for two hosts, `>` for the macro, then the held press and the
grouped answer), two sessions side by side, Monitor under load, SFTP with a
file in flight, and the Logbook. The pair must stay the same size.

Taken on 2026-11-25 on `:94` from the packaged build, on a
fresh `XDG_CONFIG_HOME` (one Production Space, the two
fixtures, two script macros). The window is 1400x873 and the whole of it is
recorded with `ffmpeg -f x11grab` at 15 frames a second, then cut to 12 and
scaled with a per-clip palette (`palettegen` at 128 colours,
`stats_mode=diff`, `paletteuse` with `diff_mode=rectangle`), which is what keeps
a mostly still clip small.

It is scripted, because a take that is not will not match its pair. Two
scripts did it: one prepared a clean state, and one ran the gestures with
fixed waits and recorded. The preparation removed the Logbook directory so the
clip shows only what the take wrote, connected both hosts, moved the second tab
to a second group, and opened both SFTP panes. Things that were not obvious:

* The Bar adds a host to the scope with Return and keeps the `@` row list for
  the next one; Tab leaves the field and the next Return does nothing.
* SFTP drag between the panes never fired with `xdotool`. Selecting the file
  and pressing Send does the same job and shows the transfer bar.
* For something to send, one 300 MB file of zeros was written in the home
  directory of the first fixture, and removed from both after the takes.
* Monitor reports a host's counters, and a fixture container reports its
  host's, so twelve busy loops started in a third fixture with a 12 second
  timeout moved the CPU ring of the first. Nothing ran on the developer's
  machine outside the containers.
* A stale recording is worse than none. Retake the whole clip when any screen
  in it changes, and both themes together.

### They go stale, and that is the point of this note

A screenshot is a promise about what somebody sees when they open the
application. The navigation model changed four times in the four days before
these were taken. Regenerate them whenever the main window's layout changes:
the sidebar, the tab strip, the status bar, or the host key screen. Treat a
README showing a window that no longer exists as a bug rather than as
untidiness.

### How these were taken

On an isolated X display, so nothing of the developer's desktop is in frame:

```sh
Xvfb :99 -screen 0 1600x1000x24 -nolisten tcp &
DISPLAY=:99 openbox &
env -u WAYLAND_DISPLAY DISPLAY=:99 GDK_BACKEND=x11 runic-ssh          # light
env -u WAYLAND_DISPLAY DISPLAY=:99 GDK_BACKEND=x11 \
  GTK_THEME=Adwaita:dark runic-ssh                                     # dark
```

`env -u WAYLAND_DISPLAY` is load-bearing under WSL. See `docs/testing.md`.

Since ADR-0062 put a theme picker in every toolbar, the dark and light pairs
are taken from the same run by opening that fold in the top right and
choosing Dark, then Light, rather than signalling the desktop through
`GTK_THEME`. Both paths land on the same `data-theme` attribute; the picker
is simply the more direct one now that it is there.
