# Brand and screenshots

`logo.png` is the source mark. `logo-dark.png` and `logo-light.png` are derived
from it by `generate-logo-variants.mjs`, and the application icons by
`generate-icons.mjs`. Neither derived set is edited by hand.

## Screenshots

`screenshot-*.png` are in the README. They are captures of the running
application connected to a real SSH server, not the design canvas and not a
mockup. A mockup in a README is a promise the product has not made.

Which build was in frame is recorded per file below, because it is not the
same claim for all of them: `screenshot-hostkey-*` came off a packaged
release build; `screenshot-grid-*` came off `pnpm tauri dev`, the same
frontend and the same core served from Vite rather than embedded, which
changes nothing a screenshot can show and is said here so nobody has to
guess.

Each screen has a `-dark` and a `-light` file, and the pair **must be the same
size**: the README serves them through `<picture>` with `prefers-color-scheme`,
and a mismatch shifts the page when a reader's theme changes.

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

### `screenshot-grid-*.png` (v0.5.0)

One 1448x908 image, four 720x450 captures tiled 2x2 by ImageMagick's
`montage` with a 2px gutter: the host book, Monitor, Sessions and SFTP, in
that reading order. Each quadrant is a full 1440x900 window capture scaled
by half, so every one carries its own title bar and toolbar; that is the
cost of four real windows rather than one composed picture, and it was
taken on purpose.

Taken on 2026-09-08 on `:95` from `pnpm tauri dev`, on a fresh
`XDG_CONFIG_HOME` seeded with three saved hosts, all of them this project's
own fixtures from `docs/testing.md`, named for what they are:
`runic-bastion` (`jump@127.0.0.1:2226`), `runic-target-a` reached through
it (`deploy@target.internal:2222`), and `runic-web-01`
(`deploy@127.0.0.1:2222`). Two of the three were connected live, each
through its own unknown-host-key prompt and its own credential typed into
the editor's Access column, before the Sessions and Monitor quadrants were
captured; SFTP browses `runic-web-01`'s home. The MOTD in the Sessions
quadrant is the plain-dash art from #350.

The eight source captures are not kept: the grid is the artifact, and the
recipe above regenerates it. To retake one quadrant, retake all four, since
a grid mixing two sessions of the application shows two clocks in its
status bars.

Nothing in frame is a real address, a real host name or a real key of anyone's.
