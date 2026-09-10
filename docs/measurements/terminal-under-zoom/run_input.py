"""Type into the spike's first terminal under each zoom, through the real
input path (xdotool on the X display), and read the terminal buffer back."""
import json
import os
import subprocess
import sys
import time

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("WebKit2", "4.1")
from gi.repository import GLib, Gtk, WebKit2  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = "file://" + os.path.join(HERE, "xterm-sob-zoom.html")
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

CASES = [("scale", 1.0), ("scale", 0.75), ("scale", 1.25), ("refit", 0.75), ("refit", 1.25), ("scale", 0.5), ("refit", 0.5)]

win = Gtk.Window(title="xterm under zoom")
win.set_default_size(1440, 900)
view = WebKit2.WebView()
win.add(view)
win.show_all()

state = {"i": 0, "results": []}


def js(script, cb):
    def done(v, res):
        try:
            r = v.run_javascript_finish(res)
            cb(r.get_js_value().to_string() if r else None)
        except Exception as e:  # noqa: BLE001
            print("js error:", repr(e), file=sys.stderr, flush=True)
            cb(None)

    view.run_javascript(script, None, done)


def xdo(*args):
    subprocess.run(["xdotool", *args], check=False)


def origin():
    _, x, y = win.get_window().get_origin()
    return x, y


READ = """(()=>{try{const b=spike.terms[0].term.buffer.active;const out=[];for(let i=0;i<b.length;i++){const l=b.getLine(i);const s=l?l.translateToString(true):'';if(s.trim())out.push(s);}return JSON.stringify({ok:true,lines:out.slice(-4),cols:spike.terms[0].term.cols,rows:spike.terms[0].term.rows});}catch(e){return JSON.stringify({ok:false,err:String(e)});}})()"""
CENTER = """(()=>{const r=spike.terms[0].xt.getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});})()"""


def run_case():
    i = state["i"]
    if i >= len(CASES):
        json.dump(state["results"], open(os.path.join(OUT, "input.json"), "w"), indent=1)
        print("done", flush=True)
        Gtk.main_quit()
        return False
    mode, zoom = CASES[i]
    marker = f"zoom-{mode}-{int(zoom*100)}"
    js(f"spike.setMode('{mode}');spike.setN(4);spike.setZoom({zoom});'ok'", lambda _: None)

    def act():
        def at(val):
            c = json.loads(val)
            ox, oy = origin()
            x, y = int(ox + c["x"]), int(oy + c["y"])
            xdo("mousemove", str(x), str(y), "click", "1")
            time.sleep(0.7)
            t0 = time.time()
            xdo("type", "--delay", "40", f"echo {marker}")
            xdo("key", "Return")
            typed_ms = (time.time() - t0) * 1000

            def read():
                def got(v):
                    d = json.loads(v) if v else {"ok": False, "err": "no value"}
                    lines = d.get("lines", [])
                    echoed = any(f"echo {marker}" in ln for ln in lines)
                    prompted = sum(1 for ln in lines if ln.rstrip().endswith("$")) >= 2
                    r = {"mode": mode, "zoom": zoom, "click": [x - ox, y - oy], "echoed": echoed, "promptAgain": prompted, "typedMs": round(typed_ms), "grid": f"{d.get('cols')}x{d.get('rows')}", "tail": [ln.rstrip() for ln in lines][-2:], **({"err": d["err"]} if not d.get("ok") else {})}
                    state["results"].append(r)
                    print(json.dumps(r, ensure_ascii=False), flush=True)
                    subprocess.run(["import", "-window", "root", os.path.join(OUT, f"input-{mode}-{int(zoom*100)}.png")], check=False)
                    state["i"] = i + 1
                    GLib.timeout_add(300, run_case)

                js(READ, got)
                return False

            GLib.timeout_add(700, read)

        js(CENTER, at)
        return False

    GLib.timeout_add(900, act)
    return False


def start():
    view.load_uri(PAGE)
    GLib.timeout_add(2500, run_case)
    return False


GLib.timeout_add(500, start)
GLib.timeout_add(120000, Gtk.main_quit)
Gtk.main()
