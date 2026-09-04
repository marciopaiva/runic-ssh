# Brand and screenshots

`logo.png` is the source mark. `logo-dark.png` and `logo-light.png` are derived
from it by `generate-logo-variants.mjs`, and the application icons by
`generate-icons.mjs`. Neither derived set is edited by hand.

## Screenshots

`screenshot-*.png` are in the README. They are captures of the **packaged
application** connected to a real SSH server, not the design canvas and not a
mockup. A mockup in a README is a promise the product has not made.

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

`screenshot-hostbook-*.png` (v0.4.0) used the application's own theme picker
instead, now that one exists in every toolbar (ADR-0062): open the fold in
the top right and choose Light or Dark directly, rather than signalling the
desktop through `GTK_THEME`. Both paths land on the same `data-theme`
attribute; the picker is simply the more direct one now that it is there.

The fleet is staged to match the design canvas, so the artboards and the
screenshots show the same invented hosts: `web-01` and `db-01` under
`PRODUCTION`, `stg-app` under `STAGING`. They resolve to the test sshd through
temporary `/etc/hosts` entries, and the locale is set to `en` because the README
is in English. `screenshot-hostbook-*.png` instead uses this project's own
container fixtures directly (`docs/testing.md`), named for what they are:
`runic-bastion`, `runic-target-a`, `dev-web`.

Nothing in frame is a real address, a real host name or a real key of anyone's.
