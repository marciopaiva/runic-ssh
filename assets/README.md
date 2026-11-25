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

### `hold-to-confirm-*.gif` (v0.9.0)

One 940x350 clip, 4.9 seconds at 20 frames a second, looping: the fleet dialog
for the saved macro `uptime` on two connected hosts of a Production Space, the
pointer pressing "Hold to send to 2 hosts", the fill crossing the button in
800ms, then the grouped answer. It is the one thing in the README a still image
cannot show. Dark and light are the same size and come from two takes with the
same script, the theme switched in the toolbar between them.

Taken on 2026-11-25 on `:93`, from the packaged build (`src-tauri/target/release/runic-ssh`),
on a fresh `XDG_CONFIG_HOME` seeded with one Production Space, two hosts
(`deploy@127.0.0.1:2222` and `:2223`, the fixtures) and two script macros.
Each host was connected once through its own host key prompt, with its password
typed into the editor's Access column. The recording is `ffmpeg -f x11grab`
over the dialog's rectangle, with the pointer drawn, and the script ran
`xdotool mousedown 1`, a one second wait and `mouseup 1`. The palette is made
per clip (`palettegen`, 128 colours) and the file stays under 250 KB.

Two things to know when repeating it:

* The fleet dialog is reached from the Bar, by the arrow-to-many icon on a macro
  row. It lists only hosts that are connected, so connect both first.
* Do not match `pkill -f` on the display name from a command line that also
  contains it: the pattern matches the shell that runs it. Kill by pid.

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

### `screenshot-grid-*.png` (v0.9.0)

One 1444x1356 image, six 720x450 captures tiled 2x3 by ImageMagick's
`montage` with a 1px gutter: the Hall, the Bar, Sessions, Monitor, SFTP and a
Logbook, in that reading order. Each quadrant is a 1438x873 window capture
scaled to 720x450, so every one carries its own title bar and toolbar; that is
the cost of six real windows rather than one composed picture, and it was
taken on purpose.

Taken on 2026-11-24 on `:91` from `pnpm tauri dev`, on a fresh
`XDG_CONFIG_HOME` seeded with four saved hosts and two Spaces (`Lab`, and
`Production`, which carries the red band). All four hosts are in Production:
`runic-bastion` (`jump@127.0.0.1:2226`), `runic-target-a` reached through it
(`deploy@target.internal:2222`), `runic-web-01` (`deploy@127.0.0.1:2222`) and
`runic-web-02` (`deploy@127.0.0.1:2223`), all of them this project's own
fixtures from `docs/testing.md`. Two were connected live, each through its own
unknown-host-key prompt and its own credential typed into the editor's Access
column. The three macros in the Bar are script macros written into the scratch
`macros.json` for the picture. The Logbook is what the two connections wrote,
with nothing added by hand.

The window was captured with `import -window root` and cropped to the window,
because the virtual screen is larger than the window. Two things to know when
repeating it:

* The theme picker's third option sits under the tooltip of the one you hover
  last. Move to another option first, then onto it, or the click lands on the
  tooltip.
* A terminal that was mounted again (a switch of workspace or of layout) did
  not paint its last line, the prompt, until something redrew it, on this
  software-rendered display. Pressing Enter in each pane before the capture is
  what is in the Sessions quadrant. This was seen once, headless, without a
  window manager's compositor or a GPU, and has not been confirmed on a real
  desktop, so it is a note here and not an issue.

The monitor charts are flat because the fixtures are idle. The CPU model and the
kernel string in the Monitor quadrant are those of the machine the containers
ran on, since a container reports its host's.

The source captures are not kept: the grid is the artifact, and the recipe
above regenerates it. To retake one quadrant, retake all six, since a grid
mixing two sessions of the application shows two clocks in its status bars.

Nothing in frame is a real address, a real host name or a real key of anyone's.
