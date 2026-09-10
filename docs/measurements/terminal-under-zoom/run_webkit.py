"""Drive the spike page inside WebKit2GTK on a virtual display.

Runs the benchmark matrix, reads the results back through JavaScript, then
takes screenshots at the zoom levels that matter for legibility.
"""
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

SHOTS = [
    ("scale", 1, 4, "scale-100"),
    ("scale", 0.75, 4, "scale-75"),
    ("scale", 0.5, 4, "scale-50"),
    ("refit", 0.75, 4, "refit-75"),
    ("refit", 0.5, 4, "refit-50"),
    ("scale", 1, 9, "scale-100-9"),
]

win = Gtk.Window()
win.set_default_size(1440, 900)
view = WebKit2.WebView()
settings = view.get_settings()
settings.set_enable_developer_extras(True)
win.add(view)
win.show_all()

state = {"phase": "matrix", "shot": 0, "results": None, "t0": time.time()}


def js(script, cb=None):
    def done(v, res):
        try:
            r = v.run_javascript_finish(res)
            val = r.get_js_value().to_string() if r else None
        except Exception as e:  # noqa: BLE001
            val = None
            print("js error:", e, file=sys.stderr)
        if cb:
            cb(val)

    view.run_javascript(script, None, done)


def shot(name):
    subprocess.run(["import", "-window", "root", os.path.join(OUT, name + ".png")], check=False)


def poll():
    if state["phase"] == "matrix":
        def got(val):
            if val is None:
                return
            try:
                data = json.loads(val)
            except Exception:  # noqa: BLE001
                return
            n = data["n"]
            print(f"[{time.time()-state['t0']:5.1f}s] results: {n}/18", flush=True)
            if n >= 18:
                state["results"] = data["r"]
                json.dump(data["r"], open(os.path.join(OUT, "results.json"), "w"), indent=1)
                js("spike.setLoad(0)")
                state["phase"] = "shots"
        js("JSON.stringify({n:spike.results.length,r:spike.results})", got)
        return True
    if state["phase"] == "shots":
        i = state["shot"]
        if i >= len(SHOTS):
            print("done", flush=True)
            Gtk.main_quit()
            return False
        mode, zoom, n, name = SHOTS[i]
        state["phase"] = "waiting"
        js(f"spike.setMode('{mode}');spike.setN({n});spike.setZoom({zoom});'ok'")

        def take():
            shot(name)
            print("shot", name, flush=True)
            state["shot"] = i + 1
            state["phase"] = "shots"
            return False

        GLib.timeout_add(1500, take)
        return True
    return True


def start():
    view.load_uri(PAGE + "?auto=1")
    GLib.timeout_add(2000, poll)
    return False


GLib.timeout_add(500, start)
GLib.timeout_add(240000, Gtk.main_quit)
Gtk.main()
