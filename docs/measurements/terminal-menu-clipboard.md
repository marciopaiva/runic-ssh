# The clipboard from a menu

Measured on 2026-09-10, on the maintainer's WSL2 machine, in the dev build
inside WebKit2GTK 4.1 on a private `Xvfb` display with `openbox`, driven
with `xdotool` and `xclip`, with a screenshot after every step. The question
is #115's hard half: whether a menu entry can paste, when the only thing
ADR-0018 lets touch the clipboard is the browser's own `copy` and `paste`
event, raised by a keystroke. A menu has no keystroke, so the entry calls
`document.execCommand('paste')` from its click, which is a user gesture, and
the browser either raises the same `paste` event or refuses.

This is a spike on one platform, not a CI measurement.

## What was measured

The map's terminal window (`feat/map-terminal-menu`), with `web-01` on
fixture 2222 open and its shell at a prompt. `useTerminal` gained a
`clipboard` with `copy()` and `paste()`, each focusing xterm and calling
`document.execCommand`; the window's right-button menu calls them. The
clipboard was set from outside with `xclip -i -selection clipboard` so that
the paste half could be judged on its own, and read back with `xclip -o`.

| Do this | What happened |
| --- | --- |
| `xclip` sets the clipboard; Ctrl-Shift-V in the terminal | the text appeared at the prompt: the keyboard path ADR-0018 shipped works here |
| `xclip` sets the clipboard; right-click, Paste | nothing appeared; the menu closed and the terminal took focus back |
| `xclip` sets two lines; right-click, Paste | nothing appeared and no confirmation opened, so no `paste` event reached the container's capturing listener either |
| Select `Runic SSH` by dragging; right-click, Copy | the entry was enabled (the selection is read from xterm); the selection stayed highlighted afterwards, so the container's `copy` listener, which clears it, did not run |
| Select the same; Ctrl-Shift-C | the selection stayed highlighted too, and `xclip -o` found no owner of the clipboard at all, before and after |

## What the numbers say

`document.execCommand('paste')` from a click does nothing in WebKit2GTK 4.1:
no `paste` event, no text. That is WebKit's rule rather than this
application's: programmatic paste is refused unless the embedder turns on
the `javascript-can-access-clipboard` setting on the web view, which Runic
does not, and which ADR-0018 would have to weigh, since it is the same
widening that document declined when it refused the clipboard plugin.

Copy could not be judged on this display. The keyboard copy that has
shipped since v0.1.1 left no owner on the X clipboard either, so the
display, not the code, is what failed to show it; `xclip` reading the
primary selection found the dragged text, which is xterm's own doing. What
the copy entry does on a real desktop is not established here, and neither
is anything on WebView2.

## What this decides for the map

The menu ships with Copy and Paste, and each entry names its shortcut in
the detail beside it, which is the discoverability #115 asked for in the
first place: a person who opens the menu learns that Ctrl-Shift-C and
Ctrl-Shift-V exist. Copy calls `execCommand('copy')`, which every browser
allows from a gesture and which this display could not observe. Paste
calls `execCommand('paste')`, which does nothing on WebKitGTK today, so on
Linux the entry is the shortcut's signpost and no more. That is written in
`docs/testing.md` and in the changelog's known limitations rather than
hidden.

## What these numbers do NOT establish

* Whether `execCommand('copy')` from the menu fills the clipboard on a real
  desktop. The maintainer's machine can answer that in one right-click.
* Anything about WebView2. Windows may allow programmatic paste from a
  gesture; it has to be tried there, the way `docs/measurements/` already
  owes WebView2 the zoom measurement.
* Whether the `javascript-can-access-clipboard` setting is worth its cost.
  It would make Paste work on Linux and would let any script in the page
  read the clipboard, which is the widening ADR-0018 refused. A decision,
  not a default.

## How to run it again

Start the app on a private `Xvfb` display with `openbox` (`docs/testing.md`,
"What synthetic input can and cannot drive"), open a terminal window on the
map, then:

```sh
printf 'text' | xclip -i -selection clipboard   # stays resident to serve it
xdotool key ctrl+shift+v                          # the keyboard path
# right-click inside the terminal, pick Paste     # the menu path
import -window root shot.png
```

A paste that worked is text at the prompt; a two-line paste that worked is
the confirmation dialog.
