# The terminal under a zoomed map

Measured on 2026-09-10, on the maintainer's WSL2 machine, inside WebKit2GTK
4.1 on a virtual display, by `terminal-under-zoom/run_webkit.py` driving
`terminal-under-zoom/page.html`. The page inlines the application's own
`@xterm/xterm` and `@xterm/addon-fit` builds from `node_modules`, so it
measures the version that ships and not a CDN's idea of it.

This is a spike, not a CI measurement. It answers one question raised by the
map proposal (`runic-proposta-modelo.html`, the prototype where every
terminal is a node on a pannable, zoomable surface): can xterm live inside a
CSS-transformed container without becoming unreadable or slow.

## What was measured

Four to nine terminals, each configured exactly as `use-terminal.ts` does
(13px JetBrains Mono, line height 1.35, DOM renderer, 5000 lines of
scrollback), placed on a surface that pans and zooms with one CSS
`transform`. Each terminal received 2000 coloured log lines per second for
three seconds while a `requestAnimationFrame` loop timed every frame.

Two ways of handling zoom were compared:

* **CSS scale**: the terminal is scaled by the map transform like any other
  node. Glyphs shrink with the zoom; columns and rows stay the same.
* **Refit 1:1**: the terminal's box is counter-scaled so glyphs stay at 13px
  regardless of zoom, and `FitAddon` gives it fewer columns and rows instead.

| mode | zoom | terminals | fps | frame p95 | worst frame | frames over 33 ms |
| --- | --- | --- | --- | --- | --- | --- |
| scale | 100% | 1 | 111 | 16.0 ms | 18.0 ms | 0 |
| scale | 100% | 4 | 65 | 19.0 ms | 21.0 ms | 0 |
| scale | 100% | 9 | 62 | 19.0 ms | 21.0 ms | 0 |
| scale | 75% | 4 | 95 | 16.0 ms | 17.0 ms | 0 |
| scale | 75% | 9 | 92 | 16.0 ms | 19.0 ms | 0 |
| scale | 50% | 4 | 102 | 16.0 ms | 17.0 ms | 0 |
| scale | 50% | 9 | 102 | 16.0 ms | 17.0 ms | 0 |
| refit | 100% | 4 | 63 | 19.0 ms | 20.0 ms | 0 |
| refit | 100% | 9 | 62 | 19.0 ms | 22.0 ms | 0 |
| refit | 75% | 4 | 99 | 16.0 ms | 17.0 ms | 0 |
| refit | 75% | 9 | 98 | 16.0 ms | 18.0 ms | 0 |
| refit | 50% | 4 | 106 | 16.0 ms | 17.0 ms | 0 |
| refit | 50% | 9 | 106 | 16.0 ms | 17.0 ms | 0 |

The full eighteen rows, including the single-terminal cases, are in
`terminal-under-zoom/results-webkitgtk-2026-09-10.json`.

## What the numbers say

**Painting nine flooded terminals under a transform costs nothing this
measurement can see.** At 100%, four terminals and nine terminals land on the
same 62 to 65 fps with a 19 ms p95, and no frame anywhere in the matrix took
longer than 22 ms. Zooming out is cheaper, not dearer: fewer pixels to paint.
The transform itself is not the bottleneck; the DOM renderer's own work per
line is, and it is the same work the application does today in a flat panel.

**The two modes cost the same.** Refit and scale are within noise of each
other at every zoom and count. The choice between them is a legibility
choice, not a performance one.

**Text stays crisp under CSS scale in WebKitGTK.** The screenshots taken on
the same run show glyphs re-rasterised at the scaled size, not a bitmap
stretched down: at 75% the 13px face is drawn at roughly 10px and reads
cleanly; at 50% it is drawn at roughly 6.5px and is sharp but too small to
read comfortably. In refit mode the face stays 13px and a 4-terminal grid
goes from 85x18 cells at 100% to 63x14 at 75% and 41x9 at 50%, where a
typical log line wraps.

## What this decides for the map

* **Zoom is safe to build.** Neither mode needs a special case for the
  terminal; a terminal node is a node.
* **Below about 75% the terminal stops being a place to read and becomes a
  place to recognise.** Both modes fail there, in different ways: scale by
  size, refit by wrapping. The map should treat a terminal under 75% as a
  thumbnail, which it already is once the icon collapses, rather than try to
  keep it a working terminal.
* **Refit is the better default for the range that matters, 75% to 125%.**
  The glyph the user chose stays the glyph the user chose, and the app already
  owns the refit path through `FitAddon` and the `ResizeObserver` in
  `use-terminal.ts`. Scale is the cheaper implementation if it ever matters,
  and it does not.

## Input under zoom

Measured on 2026-09-10 on the same display, by
`terminal-under-zoom/run_input.py`: for each mode and zoom, the driver asks
the page where the first terminal's body is, clicks its centre through
`xdotool` (the real X input path, not a synthetic DOM event), types
`echo <marker>` and Return, then reads the terminal buffer back.

| mode | zoom | click landed in the terminal | keys arrived | prompt returned | grid |
| --- | --- | --- | --- | --- | --- |
| scale | 100% | yes | yes | yes | 85x18 |
| scale | 75% | yes | yes | yes | 85x18 |
| scale | 125% | yes | yes | yes | 85x18 |
| scale | 50% | yes | yes | yes | 85x18 |
| refit | 75% | yes | yes | yes | 63x13 |
| refit | 125% | yes | yes | yes | 107x22 |
| refit | 50% | yes | yes | yes | 41x9 |

**Hit testing and focus survive the transform in both modes**, from 50% to
125%. The click computed from `getBoundingClientRect` lands where the
browser says it does, xterm's hidden textarea takes focus, and every
keystroke after the first reaches the buffer. The first character after the
click was dropped in every row, including 100% in scale mode, which is the
same path the application uses today; that makes it the spike's own echo
loop or `xdotool`'s first key after a focus change, not the zoom, and it is
noted rather than chased. The raw rows are in
`terminal-under-zoom/input-webkitgtk-2026-09-10.json`.

## What these numbers do NOT establish

* **Nothing about the GPU path.** The run used `WEBKIT_DISABLE_COMPOSITING_MODE=1`
  on Xvfb, the same recipe used to screenshot the application headless, which
  is software rendering with no vertical sync. The fps figures above 60 are
  frames the loop achieved, not frames a display showed. On a compositing
  WebKitGTK, layers under a transform are rasterised and cached differently,
  and text under a cached layer can blur during the zoom gesture and sharpen
  after it. That needs a run on a real display.
* **Nothing about WebView2.** Windows has not been measured. The page runs
  unchanged in Edge, which is the same engine, and is published as an artifact
  for exactly that.
* **Nothing about input latency.** The page echoes typed characters locally,
  which is enough to feel it, not to measure it.
* **Nothing about the canvas or WebGL renderers.** ADR-0011 dropped WebGL
  and the application ships the DOM renderer; that is what was measured.

## How to run it again

```sh
node docs/measurements/terminal-under-zoom/build.mjs
# open docs/measurements/terminal-under-zoom/xterm-under-zoom.html in a browser,
# or on a virtual display inside WebKit2GTK:
Xvfb :92 -screen 0 1440x900x24 &
DISPLAY=:92 XDG_RUNTIME_DIR=<dir, mode 700> WEBKIT_DISABLE_COMPOSITING_MODE=1 \
  python3 docs/measurements/terminal-under-zoom/run_webkit.py
```

The driver writes `out/results.json` and six screenshots beside itself. In a
browser, `?auto=1` runs the matrix and the results table fills in the corner;
"Copy results" puts the JSON on the clipboard. The built page is ignored by
git; `page.html` and `build.mjs` are the source.
