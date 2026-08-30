"""Generates every surface artboard from one skeleton, so the system is a system."""
import pathlib, textwrap

OUT = pathlib.Path(__file__).parent

# ---- palette, lifted verbatim from src/styles/tokens.css on feat/visual-improvements
T = dict(
    base="#070e18", panel="#0c1522", chrome="#0a121e", raised="#152536",
    overlay="#0e1a2a", terminal="#060c14", input="#0e1b2c",
    line="#1a2a40", line2="#2a4060",
    ink="#e8f0fa", ink2="#c5d4e8", muted="#8b9fb8", faint="#5a6f88", off="#3a4f6a",
    accent="#22b4ef", accent2="#5ec8f5", accentsoft="#0e2a3c",
    bstart="#2bb0e8", bend="#b961e6", brune="#dbe7f5",
    ok="#2fc49e", oksoft="#0e1c18", warn="#e8b04a", warnsoft="#241c0e",
    danger="#ff5f6b", dangertext="#ff8a92", dangersoft="#24141a",
)

# The same token names with the values swapped, straight from the light blocks
# of tokens.css. Light is not a second design and this file proves it: the
# artboard is generated from the same code, only T changes.
LIGHT = dict(
    base="#e8edf5", panel="#f4f7fb", chrome="#e2e8f2", raised="#dce6f4",
    overlay="#ffffff", terminal="#fafbfd", input="#ffffff",
    line="#d0dae8", line2="#b4c2d6",
    ink="#0c1624", ink2="#1e3044", muted="#4e6078", faint="#64788f", off="#92a0b4",
    accent="#0b7eb8", accent2="#0a6a9c", accentsoft="#d0eaf6",
    bstart="#1f9fd4", bend="#a04fd0", brune="#1a2735",
    ok="#12855f", oksoft="#e4f5ee", warn="#8a5e08", warnsoft="#faf0dc",
    danger="#c91e2c", dangertext="#9e101c", dangersoft="#fceaea",
)

import sys
LIGHT_MODE = "--light" in sys.argv
if LIGHT_MODE:
    T.update(LIGHT)

HEAD = """<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap">
  <style>
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; font-family: "Manrope", "Segoe UI", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }}
    a {{ color: {accent}; text-decoration: none; }}
    a:hover {{ color: {accent2}; }}
    .mono {{ font-family: "JetBrains Mono", "Cascadia Mono", "SF Mono", ui-monospace, monospace; }}
    .ic {{ width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; flex: none; }}
    .rail-ic {{ width: 21px; height: 21px; stroke: currentColor; fill: none; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }}
    .win {{ width: 42px; display: flex; align-items: center; justify-content: center; color: {muted}; }}
    .grp {{ background: {terminal}; display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; }}
    .strip {{ height: 28px; flex: none; display: flex; align-items: stretch; background: {chrome}; border-bottom: 1px solid {line}; }}
    .tab {{ display: flex; align-items: center; gap: 7px; padding: 0 11px; border-right: 1px solid {line}; min-width: 0; }}
    .term {{ flex: 1; padding: 10px 13px; font-size: 12px; line-height: 1.62; color: {ink2}; white-space: pre; overflow: hidden; }}
    .dot {{ width: 6px; height: 6px; border-radius: 50%; flex: none; }}
    .row {{ display: flex; align-items: center; gap: 8px; height: 28px; padding: 0 8px; }}
    .cap {{ font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 10.5px; color: {ink2}; background: {raised}; border: 1px solid {line2}; border-bottom-width: 2px; border-radius: 4px; padding: 2px 7px; }}
    .grpname {{ font-size: 10px; font-weight: 700; letter-spacing: 0.1em; }}
    .cur {{ background: {ink2}; color: {terminal}; }}
  </style>
</helmet>
""".format(**T)

FOOT = "</x-dc>\n</body>\n</html>\n"

MARK = f"""<svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="9.5" cy="12" r="7" stroke="{T['bstart']}" stroke-width="1.4"></circle>
        <circle cx="14.5" cy="12" r="7" stroke="{T['bend']}" stroke-width="1.4"></circle>
        <path d="M12 6.5v11M12 10l3-2.5M12 14l3 2.5M12 12l-2.6-2.2" stroke="{T['brune']}" stroke-width="1.4" stroke-linecap="round"></path>
      </svg>"""

ICON = dict(
    ssh='<path d="M4 17l5-5-5-5M12 19h8"></path>',
    sftp='<path d="M4 6.5h6l1.6 2H20v9.5H4z"></path><path d="M12 11.5v4M10 13.5l2-2 2 2"></path>',
    gear='<circle cx="12" cy="12" r="3.1"></circle><path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4L6 18M18 18l-1.6-1.6M7.6 7.6L6 6"></path>',
    plus='<path d="M12 5v14M5 12h14"></path>',
    close='<path d="M6 6l12 12M18 6L6 18"></path>',
    dots='<circle cx="5.5" cy="12" r="1.1" fill="currentColor" stroke="none"></circle><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"></circle><circle cx="18.5" cy="12" r="1.1" fill="currentColor" stroke="none"></circle>',
    newsession='<rect x="3.5" y="5.5" width="12" height="13" rx="2"></rect><path d="M6.5 10l2.5 2.5-2.5 2.5M19 5v6M22 8h-6"></path>',
    newgroup='<path d="M3.5 6.5h5.5l1.5 2h6.5"></path><path d="M3.5 6.5v11h11"></path><path d="M19 12v6M22 15h-6"></path>',
    collapse='<path d="M5 9l4-4 4 4M5 19l4-4 4 4M16 7h4M16 17h4"></path>',
    search='<circle cx="10.5" cy="10.5" r="6"></circle><path d="M15 15l4.5 4.5"></path>',
    chev='<path d="M9 6l6 6-6 6"></path>',
    check='<path d="M20 6L9 17l-5-5"></path>',
    lock='<rect x="5" y="11" width="14" height="9.5" rx="1.6"></rect><path d="M8 11V7.6a4 4 0 018 0V11"></path>',
    shape_single='<rect x="3.5" y="5.5" width="17" height="13" rx="2"></rect>',
    shape_columns='<rect x="3.5" y="5.5" width="17" height="13" rx="2"></rect><path d="M12 5.5v13"></path>',
    shape_rows='<rect x="3.5" y="5.5" width="17" height="13" rx="2"></rect><path d="M3.5 12h17"></path>',
    shape_grid='<rect x="3.5" y="5.5" width="17" height="13" rx="2"></rect><path d="M12 5.5v13M3.5 12h17"></path>',
    shield='<path d="M12 3.5l7 3v5.5c0 4.2-2.9 7.3-7 8.5-4.1-1.2-7-4.3-7-8.5V6.5z"></path>',
    # ADR-0029's own rail icon, path copied verbatim from ActivityRail.tsx
    # rather than invented for the mockup.
    home='<path d="M4 11.5 12 4l8 7.5M6 10v9.5h5V14h2v5.5h5V10"></path>',
)

def ic(name, size=14, color=None, cls="ic", extra=""):
    st = f"width: {size}px; height: {size}px;"
    if color: st += f" color: {color};"
    return f'<svg class="{cls}" viewBox="0 0 24 24" style="{st}{extra}">{ICON[name]}</svg>'

# ADR-0031's four glyphs, paths copied verbatim from HostKindIcon.tsx (16x16
# viewBox, not 24x24 like ICON above) so the canvas draws the same shape the
# tree does rather than a second one invented for the mockup. 'other' has no
# entry: it draws nothing in the sidebar (ADR-0031's Resolved note, 2026-08-30).
KIND_ICON = dict(
    jumpServer='<rect x="3" y="3" width="10" height="4" rx="1"></rect><rect x="3" y="9" width="10" height="4" rx="1"></rect><circle cx="5.2" cy="5" r="0.6" fill="currentColor" stroke="none"></circle><circle cx="5.2" cy="11" r="0.6" fill="currentColor" stroke="none"></circle>',
    database='<ellipse cx="8" cy="4" rx="5" ry="2"></ellipse><path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4"></path><path d="M3 8c0 1.1 2.2 2 5 2s5-.9 5-2"></path>',
    web='<circle cx="8" cy="8" r="5.6"></circle><path d="M2.4 8h11.2M8 2.4c1.6 1.6 2.4 3.6 2.4 5.6s-.8 4-2.4 5.6c-1.6-1.6-2.4-3.6-2.4-5.6S6.4 4 8 2.4z"></path>',
)

def kind_ic(kind, color=None):
    if kind is None:
        return ''
    st = "width: 12px; height: 12px; flex: none;"
    if color: st += f" color: {color};"
    return (f'<svg viewBox="0 0 16 16" style="{st}" fill="none" stroke="currentColor" '
            f'stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">{KIND_ICON[kind]}</svg>')

def shapes(active="single"):
    """ADR-0021: the shape control lives here, and not on a group's strip. It
    changes the whole main area, and the top strip is the only surface in the
    window that belongs to the window rather than to something inside it."""
    out = []
    for key in ("single", "columns", "rows", "grid"):
        on = key == active
        bg = f'background: {T["raised"]};' if on else ''
        color = T['accent'] if on else T['faint']
        out.append(f'<div style="width: 28px; height: 24px; border-radius: 4px; {bg}'
                   f' display: flex; align-items: center; justify-content: center; color: {color};">'
                   f'{ic("shape_" + key, 16)}</div>')
    return ('<div style="flex: none; display: flex; align-items: center; gap: 2px; padding-right: 8px;">'
            + "".join(out) + '</div>')

def top_strip(active_shape="single", show_shapes=True):
    """ADR-0029: the shape control only means anything over a pool of
    terminals, so it is absent whenever Home is the workspace showing,
    `Titlebar.tsx`'s own `showShapeControl` rather than something this file
    decided on its own."""
    return f"""  <div style="height: 36px; flex: none; display: flex; align-items: stretch; background: {T['chrome']}; border-bottom: 1px solid {T['line']};">
    <div style="width: 48px; flex: none; display: flex; align-items: center; justify-content: center; border-right: 1px solid {T['line']};">{MARK}</div>
    <div style="flex: 1; min-width: 0; display: flex; align-items: center; padding-left: 14px;">
      <span style="font-size: 11.5px; font-weight: 700; letter-spacing: 0.13em; color: {T['faint']};">RUNIC SSH</span>
    </div>
    {shapes(active_shape) if show_shapes else ''}
    <div style="flex: none; display: flex; align-items: stretch; border-left: 1px solid {T['line']};">
      <div class="win"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.1"><path d="M1.5 5h7"></path></svg></div>
      <div class="win"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.1"><rect x="1.5" y="1.5" width="7" height="7"></rect></svg></div>
      <div class="win"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.1"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7"></path></svg></div>
    </div>
  </div>"""

def rail(active="ssh", badge=None, locked=False, gear_pressed=False, sftp_off=False, accent=None):
    a = accent or T['accent']
    def slot(key, on, dim=False, lock=False, bad=None):
        color = T['ink'] if on else (T['off'] if dim else T['faint'])
        bar = f'<div style="position: absolute; left: 0; top: 8px; bottom: 8px; width: 2px; background: {a}; border-radius: 0 2px 2px 0;"></div>' if on else ''
        badge_html = ''
        if bad:
            badge_html = (f'<span class="mono" style="position: absolute; right: 6px; bottom: 7px; min-width: 15px; height: 15px;'
                          f' border-radius: 8px; background: {a}; color: {T["base"]}; font-size: 9.5px; font-weight: 700;'
                          f' display: flex; align-items: center; justify-content: center; padding: 0 4px;">{bad}</span>')
        lock_html = ''
        if lock:
            lock_html = (f'<svg viewBox="0 0 24 24" fill="none" stroke="{T["warn"]}" stroke-width="2" style="width: 10px; height: 10px;'
                         f' position: absolute; right: 7px; bottom: 8px;">{ICON["lock"]}</svg>')
        return (f'<div style="width: 100%; height: 44px; display: flex; align-items: center; justify-content: center;'
                f' position: relative; color: {color};">{bar}{ic(key, 21, cls="rail-ic")}{badge_html}{lock_html}</div>')

    gear = (f'<div style="width: 34px; height: 34px; border-radius: 7px; background: {T["raised"]};'
            f' display: flex; align-items: center; justify-content: center; color: {T["ink"]}; margin-bottom: 5px;">'
            f'{ic("gear", 21, cls="rail-ic")}</div>') if gear_pressed else slot("gear", False, dim=locked)

    return f"""    <div style="width: 48px; flex: none; background: {T['chrome']}; border-right: 1px solid {T['line']}; display: flex; flex-direction: column; align-items: center; padding: 6px 0;">
      {slot('ssh', active == 'ssh', bad=badge)}
      {slot('sftp', active == 'sftp', dim=locked or sftp_off, lock=locked)}
      <div style="flex: 1;"></div>
      {gear}
    </div>"""

def tab(name, sub=None, state="idle", dot="ok", icon=None, close=True, accent=None, dirty=False):
    a = accent or T['accent']
    on = state == "on"
    style = f'background: {T["terminal"]}; border-top: 2px solid {a}; margin-top: -1px;' if on else ''
    color = T['ink'] if on else T['muted']
    weight = 'font-weight: 600;' if on else ''
    if dot == "ok":
        d = f'<span class="dot" style="background: {T["ok"]};"></span>'
    elif dot == "warn":
        d = f'<span class="dot" style="border: 1.5px solid {T["warn"]}; box-sizing: border-box;"></span>'
    elif dot == "danger":
        d = f'<span class="dot" style="background: {T["danger"]};"></span>'
    elif dot == "saved":
        d = f'<span class="dot" style="border: 1.5px solid {T["off"]}; box-sizing: border-box;"></span>'
    elif dot == "check":
        d = f'<svg viewBox="0 0 24 24" fill="none" stroke="{T["warn"]}" stroke-width="2.4" style="width: 12px; height: 12px; flex: none;"><rect x="3.5" y="3.5" width="17" height="17" rx="4"></rect><path d="M8 12l3 3 5-6"></path></svg>'
    elif icon:
        d = ic(icon, 13, a if on else T['faint'])
    else:
        d = ''
    subhtml = f'<span class="mono" style="font-size: 10.5px; color: {T["faint"] if on else T["off"]};">{sub}</span>' if sub else ''
    if dirty:
        endcap = f'<span class="dot" style="background: {T["muted"]};"></span>'
    elif close:
        endcap = ic('close', 11, T['faint'] if on else T['off'])
    else:
        endcap = ''
    return (f'<div class="tab" style="{style}">'
            f'{d}<span style="font-size: 11.5px; color: {color}; {weight}">{name}</span>{subhtml}{endcap}</div>')

def strip(tabs, actions=True, extra=""):
    acts = ""
    if actions:
        # Two, not three. The split icon this used to draw moved to the top
        # strip in ADR-0021: splitting is global, and a control on one group's
        # strip reads as splitting that rectangle.
        acts = (f'<div style="display: flex; align-items: center; padding-right: 8px; gap: 7px; color: {T["faint"]};">'
                f'{ic("plus", 12)}{ic("dots", 12)}</div>')
    return f'<div class="strip">{"".join(tabs)}<div style="flex: 1;"></div>{extra}{acts}</div>'

def group(strip_html, body_html, border=None):
    b = f'border: 2px solid {border}; border-radius: 6px;' if border else ''
    return f'<div class="grp" style="{b}">{strip_html}{body_html}</div>'

def term(lines):
    return f'<div class="term mono">{lines}</div>'

def prompt(user, host, cmd=""):
    return f'<span style="color: {T["ok"]};">{user}@{host}</span>:<span style="color: {T["accent"]};">~</span>$ {cmd}'

CURSOR = '<span class="cur"> </span>'

def sidebar_shell(header, body, width=280):
    return f"""    <div style="width: {width}px; flex: none; background: {T['panel']}; border-right: 1px solid {T['line']}; display: flex; flex-direction: column;">
{header}
      <div style="flex: 1; padding: 8px; display: flex; flex-direction: column; gap: 4px; overflow: hidden;">
{body}
      </div>
    </div>"""

def sessions_header(badge=None, plus_lit=False):
    lit = (f'<span style="width: 20px; height: 20px; border-radius: 4px; background: {T["raised"]};'
           f' display: flex; align-items: center; justify-content: center; color: {T["accent"]};">{ic("newsession")}</span>'
           ) if plus_lit else ic("newsession")
    right = badge or (f'<div style="display: flex; align-items: center; gap: 9px; color: {T["muted"]};">'
                      f'{lit}{ic("newgroup")}{ic("collapse")}{ic("dots")}</div>')
    return f"""      <div style="padding: 12px; display: flex; flex-direction: column; gap: 10px; border-bottom: 1px solid {T['line']};">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span style="font-size: 10px; font-weight: 700; letter-spacing: 0.12em; color: {T['faint']};">SESSIONS</span>
          {right}
        </div>
        <div style="height: 32px; background: {T['input']}; border: 1px solid {T['line']}; border-radius: 6px; display: flex; align-items: center; gap: 8px; padding: 0 10px;">
          {ic('search', 14, T['faint'])}<span style="font-size: 12px; color: {T['faint']};">Filter sessions</span>
        </div>
      </div>"""

def group_row(label, count):
    return (f'<div style="display: flex; align-items: center; gap: 6px; padding: 4px 6px; color: {T["muted"]};">'
            f'{ic("chev", 11)}<span class="grpname">{label}</span>'
            f'<span class="mono" style="margin-left: auto; font-size: 9.5px; color: {T["off"]};'
            f' background: {T["raised"]}; border-radius: 4px; padding: 1px 6px;">{count}</span></div>')

def host_row(name, who, state="saved", active=False, mark=None, edge=None, kind=None, via=None, depth=0):
    """One line: dot, kind icon (rare, 'other' draws none), indent for a
    rider nested under its bastion (jump.ts's orderChain), name, then
    whichever one thing the trailing slot has room for: the reached tick,
    SPARED, a bastion's name when riding one costs no address, or user@host.
    Single line since 2026-08-30 (see design/canvas/README.md): the sidebar
    row shipped at this density for a hundred saved hosts before the canvas
    caught up to it.
    """
    dots = {"ok": f'background: {T["ok"]};', "saved": f'border: 1.5px solid {T["off"]}; box-sizing: border-box;',
            "warn": f'border: 1.5px solid {T["warn"]}; box-sizing: border-box;'}
    bg = f'background: {T["raised"]}; border-radius: 6px;' if active else ''
    if edge:
        bg += f' border-left: 2px solid {edge};'
        if not active:
            bg += f' background: #101c2b; border-radius: 6px;'
    tail = ''
    if mark == "check":
        tail = f'<svg viewBox="0 0 24 24" fill="none" stroke="{T["warn"]}" stroke-width="2.4" style="width: 13px; height: 13px; flex: none; margin-left: auto;">{ICON["check"]}</svg>'
    elif mark == "spared":
        tail = f'<span style="font-size: 9px; font-weight: 700; letter-spacing: 0.08em; color: {T["faint"]}; flex: none; margin-left: auto;">SPARED</span>'
    else:
        shown = f'via {via}' if via else who
        tail = (f'<span class="mono" style="font-size: 10.5px; color: {T["off"]}; flex: none; margin-left: auto;'
                f' max-width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{shown}</span>')
    name_color = T['ink'] if active else T['ink2']
    weight = 'font-weight: 600;' if active else ''
    indent = ''.join(
        f'<span style="width: 12px; height: 100%; flex: none; display: flex; justify-content: center;">'
        f'<span style="width: 1px; background: {T["off"]}; opacity: 0.35;"></span></span>'
        for _ in range(depth)
    )
    return (f'<div class="row" style="{bg}">'
            f'{indent}'
            f'<span class="dot" style="{dots[state]}"></span>'
            f'{kind_ic(kind, T["faint"])}'
            f'<span style="font-size: 12.5px; color: {name_color}; {weight} min-width: 0; overflow: hidden;'
            f' text-overflow: ellipsis; white-space: nowrap;">{name}</span>'
            f'{tail}</div>')

def status(left, right):
    return f"""  <div style="height: 32px; flex: none; display: flex; align-items: center; gap: 15px; padding: 0 12px; background: {T['chrome']}; border-top: 1px solid {T['line']};">
{left}
    <div style="flex: 1;"></div>
{right}
  </div>"""

def status_warn(left, right):
    return f"""  <div style="height: 32px; flex: none; display: flex; align-items: center; gap: 14px; padding: 0 12px; background: {T['chrome']}; border-top: 2px solid {T['warn']};">
{left}
    <div style="flex: 1;"></div>
{right}
  </div>"""

def stat_session(who):
    return (f'    <div style="display: flex; align-items: center; gap: 7px;">'
            f'<span class="dot" style="background: {T["ok"]};"></span>'
            f'<span class="mono" style="font-size: 11px; color: {T["ink2"]};">{who}</span></div>')

def stat_text(s, color=None, mono=True):
    c = color or T['muted']
    cls = ' class="mono"' if mono else ''
    return f'    <span{cls} style="font-size: 11px; color: {c};">{s}</span>'

def sep():
    return f'    <span style="width: 1px; height: 14px; background: {T["line"]};"></span>'

def page(body, sidebar_html=None, rail_html=None, status_html=None, shape="single", show_shapes=True):
    mid = (rail_html or rail()) + ("\n" + sidebar_html if sidebar_html else "") + f"""
    <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; background: {T['base']};">
{body}
    </div>"""
    return (HEAD +
            f"""
<div style="width: 1440px; height: 900px; display: flex; flex-direction: column; background: {T['base']}; color: {T['ink']}; overflow: hidden; font-size: 13px;">
{top_strip(shape, show_shapes)}
  <div style="flex: 1; min-height: 0; display: flex; align-items: stretch;">
{mid}
  </div>
{status_html or status(stat_text('No session', T['faint'], mono=False), '')}
</div>
""" + FOOT)

def write(name, content):
    (OUT / name).write_text(content)
    print("  ", name)

# ============================================================ SURFACES

PROD = [("web-01", "deploy@10.4.1.20"), ("web-02", "deploy@10.4.1.21"), ("db-prod", "postgres@10.4.1.31")]

PROD_KIND = {"db-prod": "database"}

def sessions_sidebar(active=None, states=None, marks=None, edges=None, header=None, staging=True):
    states = states or {}
    marks = marks or {}
    edges = edges or {}
    rows = [group_row("PRODUCTION", 3)]
    for n, w in PROD:
        rows.append(host_row(n, w, states.get(n, "saved"), active == n, marks.get(n), edges.get(n), kind=PROD_KIND.get(n)))
    if staging:
        rows.append('<div style="height: 8px;"></div>')
        rows.append(group_row("STAGING", 2))
        rows.append(host_row("stg-app", "deploy@10.9.0.5", states.get("stg-app", "saved"), active == "stg-app"))
        rows.append(host_row("stg-db", "postgres@10.9.0.6", states.get("stg-db", "saved"), active == "stg-db", kind="database"))
    return sidebar_shell(header or sessions_header(), "\n".join(rows))

# ---------- 1. nothing open
def kv(label, keys=None, hint=None, lead=False):
    if keys:
        caps = f'<span style="color: {T["off"]}; font-size: 11px;">+</span>'.join(f'<span class="cap">{k}</span>' for k in keys)
        right = f'<span style="display: flex; align-items: center; gap: 4px;">{caps}</span>'
    else:
        right = (f'<span style="display: flex; align-items: center; gap: 7px; font-size: 12px; color: {T["muted"]};">'
                 f'<svg class="ic" viewBox="0 0 24 24" style="width: 13px; height: 13px; color: {T["accent"]};">'
                 f'<path d="M19 12H5M11 6l-6 6 6 6"></path></svg>{hint}</span>')
    size = "13.5px" if lead else "13px"
    color = T['ink2'] if lead else T['muted']
    weight = "font-weight: 600;" if lead else ""
    return (f'<div style="display: flex; align-items: center; justify-content: space-between; gap: 44px;">'
            f'<span style="font-size: {size}; color: {color}; {weight}">{ "Connect to a host" if lead else "" }</span>'
            f'{right}</div>') if lead else None

def build_empty():
    body = f"""      <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 46px; padding: 40px;">
        <svg width="190" height="190" viewBox="0 0 24 24" fill="none" style="opacity: 0.085;">
          <circle cx="9.5" cy="12" r="7" stroke="{T['bstart']}" stroke-width="1.1"></circle>
          <circle cx="14.5" cy="12" r="7" stroke="{T['bend']}" stroke-width="1.1"></circle>
          <path d="M12 6.5v11M12 10l3-2.5M12 14l3 2.5M12 12l-2.6-2.2" stroke="{T['brune']}" stroke-width="1.1" stroke-linecap="round"></path>
        </svg>
        <div style="display: flex; flex-direction: column; gap: 13px; min-width: 348px;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 44px;">
            <span style="font-size: 13.5px; color: {T['ink2']}; font-weight: 600;">Connect to a host</span>
            <span style="display: flex; align-items: center; gap: 7px; font-size: 12px; color: {T['muted']};">
              <svg class="ic" viewBox="0 0 24 24" style="width: 13px; height: 13px; color: {T['accent']};"><path d="M19 12H5M11 6l-6 6 6 6"></path></svg>pick one on the left</span>
          </div>
          <div style="height: 1px; background: {T['line']}; margin: 3px 0;"></div>
          {rowkeys('Show all commands', ['Ctrl', '&#8679;', 'P'])}
          {rowkeys('Copy from the terminal', ['Ctrl', '&#8679;', 'C'])}
          {rowkeys('Paste into the terminal', ['Ctrl', '&#8679;', 'V'])}
        </div>
      </div>"""
    st = status(f'    <div style="display: flex; align-items: center; gap: 7px;"><span class="dot" style="border: 1.5px solid {T["off"]}; box-sizing: border-box;"></span><span style="font-size: 11px; color: {T["faint"]};">No session</span></div>',
                stat_text("5 hosts saved", T['faint']))
    write("Empty.dc.html", page(body, sessions_sidebar(), rail(sftp_off=True), st))

def rowkeys(label, keys):
    caps = f'<span style="color: {T["off"]}; font-size: 11px;">+</span>'.join(f'<span class="cap">{k}</span>' for k in keys)
    return (f'<div style="display: flex; align-items: center; justify-content: space-between; gap: 44px;">'
            f'<span style="font-size: 13px; color: {T["muted"]};">{label}</span>'
            f'<span style="display: flex; align-items: center; gap: 4px;">{caps}</span></div>')

# ---------- 2. one group
def build_main():
    s = strip([tab("web-01", "deploy@10.4.1.20", "on"), tab("db-prod", dot="ok"), tab("cache-01", dot="warn")])
    body = term(
        prompt("deploy", "web-01", "systemctl status nginx") + "\n"
        + f'<span style="color: {T["ok"]};">&#9679;</span> nginx.service - A high performance web server\n'
        + f'     Loaded: loaded (/lib/systemd/system/nginx.service; enabled)\n'
        + f'     Active: <span style="color: {T["ok"]};">active (running)</span> since Mon 2026-08-24 09:12:04 UTC\n'
        + '   Main PID: 1841 (nginx)\n      Tasks: 5 (limit: 4915)\n     Memory: 12.4M\n\n'
        + prompt("deploy", "web-01", "tail -n 3 /var/log/nginx/access.log") + "\n"
        + '10.4.1.7 - - [24/Aug/2026:09:41:02] "GET /health HTTP/1.1" 200 2\n'
        + '10.4.1.7 - - [24/Aug/2026:09:41:12] "GET /health HTTP/1.1" 200 2\n'
        + '10.4.1.9 - - [24/Aug/2026:09:41:15] "POST /api/v2/jobs HTTP/1.1" 201 148\n\n'
        + prompt("deploy", "web-01") + CURSOR)
    st = status(stat_session("deploy@10.4.1.20") + "\n" + sep() + "\n" + stat_text("198 x 42") + "\n" + stat_text("14 ms") + "\n" + stat_text("2,4 MB"),
                stat_text("SYNC OFF", T['faint'], mono=False) + "\n" + sep() + "\n" + stat_text("UTF-8", T['faint']))
    write("Main.dc.html", page(f'      <div style="flex: 1; min-height: 0; display: flex;">{group(s, body)}</div>',
                               sessions_sidebar(active="web-01", states={"web-01": "ok", "db-prod": "ok"}),
                               rail(badge="3"), st))

# ---------- 3. four groups, six sessions
def build_groups():
    g1 = group(strip([tab("web-01", state="on"), tab("web-02")]),
               term(prompt("deploy", "web-01", "systemctl is-active nginx") + "\nactive\n"
                    + prompt("deploy", "web-01", "uptime") + "\n 09:41:02 up 12 days,  3:18,  load 0.14\n"
                    + prompt("deploy", "web-01") + CURSOR))
    g2 = group(strip([tab("db-prod", state="on")]),
               term(prompt("postgres", "db-prod", 'psql -c "select count(*) from jobs"') + "\n count\n-------\n  8812\n(1 row)\n\n"
                    + prompt("postgres", "db-prod") + CURSOR))
    g3 = group(strip([tab("cache-01"), tab("stg-app", state="on")]),
               term(prompt("deploy", "stg-app", "git log --oneline -3") + "\n"
                    "8c53455 docs: give SFTP a release of its own\n"
                    "d73d55a docs: put jump hosts where the import was\n"
                    "023d08d docs: name the boundary of what zeroize promises\n"
                    + prompt("deploy", "stg-app") + CURSOR))
    g4 = group(strip([tab("log-01", state="on", dot="warn")]),
               f'<div class="term mono" style="color: {T["muted"]};">'
               f'<span style="color: {T["warn"]};">Connecting to log-01</span>\n'
               f'  <span style="color: {T["faint"]};">10.4.1.60:22</span>\n\n'
               f'  <span style="color: {T["ok"]};">&#10003;</span> Host key verified\n'
               f'  <span style="color: {T["warn"]};">&#9679;</span> Waiting for the credential\n</div>')
    grid = (f'      <div style="flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));'
            f' grid-template-rows: repeat(2, minmax(0, 1fr)); gap: 1px; background: {T["line"]};">{g1}{g2}{g3}{g4}</div>')
    st = status(stat_session("deploy@10.4.1.20") + "\n" + sep() + "\n" + stat_text("114 x 20") + "\n" + stat_text("14 ms"),
                stat_text("6 sessions in 4 groups", T['faint']) + "\n" + sep() + "\n" + stat_text("SYNC OFF", T['faint'], mono=False))
    write("Groups.dc.html", page(grid, None, rail(badge="6"), st, shape="grid"))

# ---------- 4. sidebar closed
def build_collapsed():
    s = strip([tab("web-01", "deploy@10.4.1.20", "on"), tab("db-prod", "postgres@10.4.1.31")])
    body = term(
        prompt("deploy", "web-01", "docker compose ps") + "\n"
        "NAME                 IMAGE                     STATUS         PORTS\n"
        "site-web-1           ghcr.io/acme/site:2.14    Up 4 hours     0.0.0.0:8080-&gt;80/tcp\n"
        "site-worker-1        ghcr.io/acme/worker:2.14  Up 4 hours\n"
        "site-cache-1         redis:7-alpine            Up 4 hours     6379/tcp\n\n"
        + prompt("deploy", "web-01", 'journalctl -u site-web --since "10 min ago" --no-pager | tail -5') + "\n"
        "Aug 24 09:36:11 web-01 site-web[1841]: GET  /health              200   1.9ms\n"
        "Aug 24 09:36:21 web-01 site-web[1841]: GET  /health              200   2.1ms\n"
        "Aug 24 09:36:24 web-01 site-web[1841]: POST /api/v2/jobs         201  148.0ms\n"
        "Aug 24 09:36:31 web-01 site-web[1841]: GET  /health              200   1.8ms\n"
        "Aug 24 09:36:38 web-01 site-web[1841]: GET  /api/v2/jobs/8812    200   14.2ms\n\n"
        + prompt("deploy", "web-01", "df -h /var/lib/docker") + "\n"
        "Filesystem      Size  Used Avail Use% Mounted on\n"
        "/dev/nvme0n1p2  194G   88G   97G  48% /\n\n"
        + prompt("deploy", "web-01") + CURSOR)
    st = status(stat_session("deploy@10.4.1.20") + "\n" + sep() + "\n" + stat_text("232 x 42") + "\n" + stat_text("14 ms") + "\n" + stat_text("2,4 MB"),
                stat_text("SYNC OFF", T['faint'], mono=False) + "\n" + sep() + "\n" + stat_text("UTF-8", T['faint']))
    write("Collapsed.dc.html", page(f'      <div style="flex: 1; min-height: 0; display: flex;">{group(s, body)}</div>',
                                    None, rail(active=None, badge="2"), st))

# ---------- 5. broadcast armed
def build_broadcast():
    a = T['warn']
    g1 = group(strip([tab("web-01", "deploy@10.4.1.20", "on", dot="check", accent=a), tab("web-02", dot="ok")], actions=False),
               term(prompt("deploy", "web-01", "systemctl restart nginx") + "\n"
                    + prompt("deploy", "web-01", "systemctl is-active nginx") + "\nactive\n"
                    + prompt("deploy", "web-01") + CURSOR), border=a)
    g2 = group(strip([tab("web-03", "deploy@10.4.1.22", "on", dot="check", accent=a)], actions=False),
               term(prompt("deploy", "web-03", "systemctl restart nginx") + "\n"
                    + prompt("deploy", "web-03", "systemctl is-active nginx") + "\nactive\n"
                    + prompt("deploy", "web-03") + CURSOR), border=a)
    g3 = group(strip([tab("db-prod", "postgres@10.4.1.31", "on", dot="ok")], actions=False),
               term(prompt("postgres", "db-prod", "") + CURSOR))
    grid = (f'      <div style="flex: 1; min-height: 0; padding: 8px; display: grid;'
            f' grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px;">{g1}{g2}{g3}</div>')
    hdr = f"""      <div style="padding: 12px; border-bottom: 1px solid {T['line']}; display: flex; align-items: center; justify-content: space-between;">
        <span style="font-size: 10px; font-weight: 700; letter-spacing: 0.12em; color: {T['faint']};">SESSIONS</span>
        <span style="font-size: 9.5px; font-weight: 700; letter-spacing: 0.1em; color: {T['warn']}; background: {T['warnsoft']}; border: 1px solid {T['warn']}; border-radius: 4px; padding: 2px 7px;">2 RECEIVING</span>
      </div>"""
    rows = "\n".join([group_row("PRODUCTION", 4),
                      host_row("web-01", "deploy@10.4.1.20", "ok", True, "check", T['warn']),
                      host_row("web-03", "deploy@10.4.1.22", "ok", False, "check", T['warn']),
                      host_row("db-prod", "postgres@10.4.1.31", "ok", False, "spared", kind="database"),
                      host_row("cache-01", "redis@10.4.1.44", "saved")])
    sb = sidebar_shell(hdr, rows)
    st = status_warn(stat_session("deploy@10.4.1.20") + "\n" + sep() + "\n" + stat_text("74 x 42") + "\n" + stat_text("14 ms"),
                     f'    <span style="font-size: 10.5px; font-weight: 700; letter-spacing: 0.1em; color: {T["warnsoft"]}; background: {T["warn"]}; border-radius: 4px; padding: 4px 10px;">TYPING INTO 2 HOSTS</span>\n'
                     f'    <span style="font-size: 11px; color: {T["warn"]}; border: 1px solid {T["warn"]}; border-radius: 4px; padding: 3px 10px;">Turn off</span>')
    write("Broadcast.dc.html", page(grid, sb, rail(locked=True, badge="4", accent=T['warn']), st, shape="columns"))

# ---------- 6. unknown host key, inside the group that asked
# A real picture, from `ssh-keygen -lv` on the key whose fingerprint is
# pinned in tests/randomart.test.ts. The one drawn here before was invented,
# and it put the hash label on the top border where OpenSSH puts the key
# type. An artboard of a screen whose whole job is comparing by eye should
# not be the one thing on it that was drawn from memory.
RANDOMART = [
    "+--[ED25519 256]--+",
    "|             ..o |",
    "|   + .        = +|",
    "|  + = +      . B |",
    "|   + * . .    + .|",
    "|    o = S o o o=o|",
    "|     . = o o B.==|",
    "|      o . o + Bo.|",
    "|     .   .   = ++|",
    "|          .oo E.+|",
    "+----[SHA256]-----+",
]

def build_hostkey():
    art = "\n".join(RANDOMART)
    card = f"""        <div style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 30px;">
          <div style="width: 660px; background: {T['overlay']}; border: 1px solid {T['line2']}; border-radius: 10px; overflow: hidden;">
            <div style="display: flex; align-items: center; gap: 11px; padding: 16px 22px; border-bottom: 1px solid {T['line']};">
              <svg class="ic" viewBox="0 0 24 24" style="width: 17px; height: 17px; color: {T['warn']};">{ICON['shield']}</svg>
              <span style="font-size: 15px; font-weight: 700;">Unknown host key</span>
            </div>
            <div style="padding: 20px 22px;">
              <div style="font-size: 12.5px; color: {T['ink2']}; line-height: 1.6;">Runic SSH has never connected to log-01 before. Confirm the fingerprint through a channel you already trust, not through this connection.</div>
              <div style="display: flex; gap: 22px; margin-top: 20px;">
                <div style="flex: 1; display: flex; flex-direction: column; gap: 14px;">
                  <div><div style="font-size: 9.5px; font-weight: 700; letter-spacing: 0.11em; color: {T['faint']};">HOST</div>
                  <div class="mono" style="font-size: 12.5px; color: {T['ink']}; margin-top: 5px;">log-01 &#183; 10.4.1.60:22</div></div>
                  <div><div style="font-size: 9.5px; font-weight: 700; letter-spacing: 0.11em; color: {T['faint']};">KEY TYPE</div>
                  <div class="mono" style="font-size: 12.5px; color: {T['ink']}; margin-top: 5px;">ssh-ed25519</div></div>
                  <div><div style="font-size: 9.5px; font-weight: 700; letter-spacing: 0.11em; color: {T['faint']};">SHA256 FINGERPRINT</div>
                  <div class="mono" style="font-size: 12.5px; color: {T['accent2']}; margin-top: 5px; word-break: break-all;">SHA256:9pJk2vQr7Xf1mNbT4wLd8sYcE0hGuA3iZoRxV6nKqMs</div></div>
                </div>
                <div>
                  <div style="font-size: 9.5px; font-weight: 700; letter-spacing: 0.11em; color: {T['faint']};">RANDOMART</div>
                  <pre class="mono" style="margin: 5px 0 0; font-size: 10px; line-height: 1.25; color: {T['muted']}; background: {T['terminal']}; border: 1px solid {T['line']}; border-radius: 6px; padding: 8px 10px;">{art}</pre>
                </div>
              </div>
              <div style="display: flex; align-items: flex-start; gap: 11px; margin-top: 20px; padding: 13px 15px; background: {T['base']}; border: 1px solid {T['line']}; border-radius: 8px;">
                <span style="width: 15px; height: 15px; border: 1.5px solid {T['line2']}; border-radius: 4px; flex: none; margin-top: 1px;"></span>
                <div><div style="font-size: 12.5px; color: {T['ink2']}; font-weight: 600;">I verified this fingerprint out of band</div>
                <div style="font-size: 11.5px; color: {T['faint']}; margin-top: 4px;">From the provider console, a configuration repository, or someone who runs the host.</div></div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px; padding: 15px 22px; border-top: 1px solid {T['line']}; background: {T['base']};">
              <span style="font-size: 11.5px; color: {T['faint']};">Saved to known_hosts</span>
              <div style="flex: 1;"></div>
              <span style="font-size: 12.5px; color: {T['muted']}; border: 1px solid {T['line']}; border-radius: 6px; padding: 8px 20px;">Cancel</span>
              <span style="font-size: 12.5px; font-weight: 600; color: {T['off']}; background: {T['raised']}; border-radius: 6px; padding: 8px 20px;">Trust and connect</span>
            </div>
          </div>
        </div>"""
    g1 = group(strip([tab("web-01", state="on")]),
               term(prompt("deploy", "web-01", "tail -f /var/log/syslog") + "\n"
                    "Aug 24 09:41:02 web-01 systemd[1]: Started Session 4812\n"
                    "Aug 24 09:41:15 web-01 site-web[1841]: job 8812 queued\n"
                    + CURSOR))
    g2 = group(strip([tab("log-01", state="on", dot="warn")], actions=False), card)
    grid = (f'      <div style="flex: 1; min-height: 0; display: grid; grid-template-columns: 380px minmax(0, 1fr);'
            f' gap: 1px; background: {T["line"]};">{g1}{g2}</div>')
    st = status(f'    <div style="display: flex; align-items: center; gap: 7px;"><span class="dot" style="border: 1.5px solid {T["warn"]}; box-sizing: border-box;"></span><span style="font-size: 11px; color: {T["warn"]};">Waiting on you</span></div>'
                + "\n" + sep() + "\n" + stat_text("log-01 &#183; key not yet trusted", T['muted'], mono=False),
                stat_text("SYNC OFF", T['faint'], mono=False))
    write("HostKey.dc.html", page(grid, sessions_sidebar(active="web-01", states={"web-01": "ok"}), rail(badge="2"), st))

# ---------- 7. sftp
def build_sftp():
    def frow(name, size, when, icon="file", sel=False, dim=False):
        i = ic("sftp", 13, T['faint']) if icon == "dir" else f'<svg class="ic" viewBox="0 0 24 24" style="width: 13px; height: 13px; color: {T["accent"] if sel else T["faint"]};"><path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v4h4"></path></svg>'
        bg = f'background: {T["accentsoft"]}; border-radius: 5px;' if sel else ''
        return (f'<div style="display: flex; align-items: center; gap: 10px; padding: 7px 10px; {bg}">{i}'
                f'<span class="mono" style="flex: 1; font-size: 12px; color: {T["ink"] if sel else T["ink2"]};">{name}</span>'
                f'<span class="mono" style="width: 74px; text-align: right; font-size: 11.5px; color: {T["muted"] if not dim else T["faint"]};">{size}</span>'
                f'<span class="mono" style="width: 96px; text-align: right; font-size: 11.5px; color: {T["faint"]};">{when}</span></div>')
    head = (f'<div style="display: flex; align-items: center; gap: 10px; padding: 6px 10px; color: {T["muted"]};'
            f' font-size: 10px; font-weight: 700; letter-spacing: 0.08em;"><span style="flex: 1;">NAME</span>'
            f'<span style="width: 74px; text-align: right;">SIZE</span><span style="width: 96px; text-align: right;">MODIFIED</span></div>')
    local = head + frow("index.html", "4,2 kB", "24 Aug 09:38", sel=True) + frow("assets", "&#8212;", "24 Aug 09:38", "dir", dim=True) + frow("app.2f9c.js", "318 kB", "24 Aug 09:38") + frow("app.8b1e.css", "41 kB", "24 Aug 09:38")
    remote = head + frow("index.html", "4,0 kB", "23 Aug 18:02") + frow("releases", "&#8212;", "23 Aug 18:02", "dir", dim=True) + frow("shared", "&#8212;", "12 Aug 11:20", "dir", dim=True)
    panes = f"""          <div style="height: 32px; flex: none; display: flex; align-items: center; gap: 10px; padding: 0 14px; background: {T['chrome']}; border-bottom: 1px solid {T['line']};">
            <span style="font-size: 10px; font-weight: 700; letter-spacing: 0.1em; color: {T['faint']};">LOCAL</span>
            <span class="mono" style="font-size: 11.5px; color: {T['muted']};">~/projects/site/dist</span>
            <div style="flex: 1;"></div>
            <span style="font-size: 10px; font-weight: 700; letter-spacing: 0.1em; color: {T['faint']};">REMOTE</span>
            <span class="mono" style="font-size: 11.5px; color: {T['muted']};">/var/www</span>
          </div>
          <div style="flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); background: {T['base']};">
            <div style="border-right: 1px solid {T['line']}; padding: 6px;">{local}</div>
            <div style="padding: 6px;">{remote}</div>
          </div>
          <div style="height: 88px; flex: none; border-top: 1px solid {T['line']}; background: {T['panel']}; padding: 10px 14px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 10px; font-weight: 700; letter-spacing: 0.1em; color: {T['faint']};">TRANSFERS</span>
              <span class="mono" style="font-size: 9.5px; color: {T['off']}; background: {T['raised']}; border-radius: 4px; padding: 1px 6px;">1</span>
            </div>
            <div style="display: flex; align-items: center; gap: 12px; margin-top: 10px;">
              <svg class="ic" viewBox="0 0 24 24" style="color: {T['accent']};"><path d="M12 4v11M8 11l4 4 4-4M5 20h14"></path></svg>
              <span class="mono" style="font-size: 12px; color: {T['ink']}; width: 140px;">app.2f9c.js</span>
              <div style="flex: 1; height: 4px; background: {T['raised']}; border-radius: 2px; overflow: hidden;"><div style="width: 62%; height: 100%; background: {T['accent']};"></div></div>
              <span class="mono" style="font-size: 11.5px; color: {T['muted']}; width: 116px; text-align: right;">197 / 318 kB</span>
              <span class="mono" style="font-size: 11.5px; color: {T['faint']}; width: 70px; text-align: right;">1,4 MB/s</span>
            </div>
          </div>"""
    g = group(strip([tab("web-01", dot="ok"), tab("web-01", "/var/www", "on", icon="sftp", dot=None)]),
              f'<div style="flex: 1; min-height: 0; display: flex; flex-direction: column;">{panes}</div>')
    tree = "\n".join([
        f'<div style="display: flex; align-items: center; gap: 7px; padding: 5px 8px; color: {T["muted"]};">{ic("chev", 11, extra=" transform: rotate(90deg);")}{ic("sftp", 13, T["faint"])}<span class="mono" style="font-size: 11.5px;">/</span></div>',
        f'<div style="display: flex; align-items: center; gap: 7px; padding: 5px 8px 5px 20px; color: {T["muted"]};">{ic("chev", 11, extra=" transform: rotate(90deg);")}{ic("sftp", 13, T["faint"])}<span class="mono" style="font-size: 11.5px;">var</span></div>',
        f'<div style="display: flex; align-items: center; gap: 7px; padding: 5px 8px 5px 34px; background: {T["raised"]}; border-radius: 5px; color: {T["ink"]};">{ic("chev", 11, extra=" transform: rotate(90deg);")}{ic("sftp", 13, T["accent"])}<span class="mono" style="font-size: 11.5px;">www</span></div>',
        f'<div style="display: flex; align-items: center; gap: 7px; padding: 5px 8px 5px 66px; color: {T["muted"]};">{ic("sftp", 13, T["faint"])}<span class="mono" style="font-size: 11.5px;">releases</span></div>',
        f'<div style="display: flex; align-items: center; gap: 7px; padding: 5px 8px 5px 66px; color: {T["muted"]};">{ic("sftp", 13, T["faint"])}<span class="mono" style="font-size: 11.5px;">shared</span></div>',
        f'<div style="display: flex; align-items: center; gap: 7px; padding: 5px 8px 5px 20px; color: {T["muted"]};">{ic("chev", 11)}{ic("sftp", 13, T["faint"])}<span class="mono" style="font-size: 11.5px;">etc</span></div>'])
    hdr = f"""      <div style="padding: 12px; display: flex; flex-direction: column; gap: 9px; border-bottom: 1px solid {T['line']};">
        <span style="font-size: 10px; font-weight: 700; letter-spacing: 0.12em; color: {T['faint']};">REMOTE</span>
        <div style="display: flex; align-items: center; gap: 7px;"><span class="dot" style="background: {T['ok']};"></span>
        <span class="mono" style="font-size: 11.5px; color: {T['ink2']};">deploy@10.4.1.20</span></div>
      </div>"""
    st = status(stat_session("deploy@10.4.1.20") + "\n" + sep() + "\n" + stat_text("SFTP v3") + "\n" + stat_text("1 transferring"),
                stat_text("SYNC OFF", T['faint'], mono=False))
    write("Sftp.dc.html", page(f'      <div style="flex: 1; min-height: 0; display: flex;">{g}</div>',
                               sidebar_shell(hdr, tree), rail(active="sftp", badge="2"), st))

# ---------- 8. the + opens a host form
def build_newsession():
    def fld(v, mono=True, chev=False):
        c = ' class="mono"' if mono else ''
        tail = ic("chev", 14, T['faint']) if chev else ''
        just = 'justify-content: space-between;' if chev else ''
        return (f'<div style="height: 34px; background: {T["input"]}; border: 1px solid {T["line"]}; border-radius: 6px;'
                f' display: flex; align-items: center; {just} padding: 0 11px;">'
                f'<span{c} style="font-size: 12.5px; color: {T["ink"]};">{v}</span>{tail}</div>')
    def lab(s): return f'<span style="font-size: 11.5px; font-weight: 600; color: {T["ink2"]}; display: block; margin-bottom: 6px;">{s}</span>'
    def hint(s): return f'<span style="font-size: 11px; color: {T["faint"]}; margin-top: 6px; display: block;">{s}</span>'
    form = f"""        <div style="flex: 1; padding: 28px 38px; overflow: hidden;">
          <div style="max-width: 620px;">
            <div style="font-size: 19px; font-weight: 700;">New session</div>
            <div style="font-size: 12.5px; color: {T['muted']}; margin-top: 6px;">A saved host. Connecting to it comes later, and asks for the credential then.</div>
            <div style="margin-top: 24px; display: flex; flex-direction: column; gap: 19px;">
              <div>{lab('Name')}{fld('web-04', mono=False)}{hint('Leave empty to use the host')}</div>
              <div style="display: flex; gap: 16px;">
                <div style="flex: 1;">{lab('Host')}{fld('10.4.1.23')}</div>
                <div style="width: 128px;">{lab('Port')}{fld('22')}</div>
              </div>
              <div style="display: flex; gap: 16px;">
                <div style="flex: 1;">{lab('User')}{fld('deploy')}</div>
                <div style="flex: 1;">{lab('Group')}{fld('Production', mono=False, chev=True)}{hint('Optional. Sessions are listed under it.')}</div>
              </div>
              <div style="display: flex; align-items: flex-start; gap: 11px; background: {T['overlay']}; border: 1px solid {T['line']}; border-radius: 7px; padding: 13px 15px;">
                <svg class="ic" viewBox="0 0 24 24" style="color: {T['accent']}; margin-top: 1px;">{ICON['lock']}</svg>
                <span style="font-size: 12px; color: {T['muted']}; line-height: 1.55;">No password is stored here. You are asked for one when you connect, in a window of its own.</span>
              </div>
              <div style="display: flex; gap: 10px; margin-top: 3px;">
                <span style="font-size: 12.5px; font-weight: 600; color: {T['base']}; background: {T['accent']}; border-radius: 6px; padding: 8px 20px;">Save</span>
                <span style="font-size: 12.5px; color: {T['muted']}; border: 1px solid {T['line']}; border-radius: 6px; padding: 8px 20px;">Cancel</span>
              </div>
            </div>
          </div>
        </div>"""
    g = group(strip([tab("web-01", dot="ok"), tab("New session", state="on", icon="newsession", dot=None, dirty=True)]),
              f'<div style="flex: 1; min-height: 0; display: flex; background: {T["base"]};">{form}</div>')
    rows = "\n".join([group_row("PRODUCTION", 3),
                      host_row("web-01", "deploy@10.4.1.20", "ok"),
                      host_row("web-02", "deploy@10.4.1.21", "saved"),
                      host_row("db-prod", "postgres@10.4.1.31", "saved", kind="database"),
                      f'<div class="row" style="border: 1px dashed {T["line2"]}; border-radius: 6px; margin-top: 2px; align-items: center;">'
                      f'<span class="dot" style="border: 1.5px dashed {T["off"]}; box-sizing: border-box;"></span>'
                      f'<span style="font-size: 12px; color: {T["faint"]}; font-style: italic;">unsaved, in the tab</span></div>'])
    st = status(stat_text("New session", T['muted'], mono=False) + "\n" + sep() + "\n" + stat_text("Unsaved changes", T['warn'], mono=False),
                stat_text("SYNC OFF", T['faint'], mono=False))
    write("NewSession.dc.html", page(f'      <div style="flex: 1; min-height: 0; display: flex;">{g}</div>',
                                     sidebar_shell(sessions_header(plus_lit=True), rows), rail(badge="1"), st))

# ---------- 9. settings
def build_settings():
    def opt(s, on=False):
        if on:
            return f'<span style="padding: 7px 16px; border-radius: 6px; border: 1px solid {T["accent"]}; background: {T["accentsoft"]}; color: {T["ink"]}; font-size: 12.5px; font-weight: 600;">{s}</span>'
        return f'<span style="padding: 7px 16px; border-radius: 6px; border: 1px solid {T["line"]}; color: {T["muted"]}; font-size: 12.5px;">{s}</span>'
    panel = f"""        <div style="flex: 1; min-height: 0; display: flex;">
          <div style="width: 186px; flex: none; padding: 20px 12px; border-right: 1px solid {T['line']}; display: flex; flex-direction: column; gap: 3px;">
            <div style="padding: 8px 12px; border-radius: 6px; color: {T['muted']}; font-size: 12.5px;">Sessions</div>
            <div style="padding: 8px 12px; border-radius: 6px; background: {T['raised']}; color: {T['ink']}; font-size: 12.5px; font-weight: 600;">Appearance</div>
          </div>
          <div style="flex: 1; min-width: 0; padding: 26px 34px; overflow: hidden;">
            <div style="font-size: 19px; font-weight: 700;">Appearance</div>
            <div style="font-size: 12.5px; color: {T['muted']}; margin-top: 6px;">How the window looks, and which language it speaks.</div>
            <div style="margin-top: 26px; max-width: 560px; display: flex; flex-direction: column; gap: 22px;">
              <div>
                <div style="font-size: 12.5px; font-weight: 600; color: {T['ink2']};">Theme</div>
                <div style="font-size: 11.5px; color: {T['faint']}; margin-top: 4px;">The palette is composed in dark. Light is the same tokens with the values swapped.</div>
                <div style="display: flex; gap: 8px; margin-top: 11px;">{opt('Follow system')}{opt('Light')}{opt('Dark', True)}</div>
              </div>
              <div>
                <div style="font-size: 12.5px; font-weight: 600; color: {T['ink2']};">Language</div>
                <div style="margin-top: 11px; height: 34px; max-width: 250px; background: {T['input']}; border: 1px solid {T['line']}; border-radius: 6px; display: flex; align-items: center; justify-content: space-between; padding: 0 12px;">
                  <span style="font-size: 12.5px; color: {T['ink']};">English</span>{ic('chev', 14, T['faint'], extra=' transform: rotate(90deg);')}</div>
                <div style="font-size: 11.5px; color: {T['faint']}; margin-top: 8px;">Spanish is translated and held back until a native speaker reviews its security copy.</div>
              </div>
              <div style="display: flex; align-items: flex-start; gap: 12px;">
                <div style="width: 34px; height: 19px; border-radius: 10px; background: {T['raised']}; border: 1px solid {T['line2']}; flex: none; display: flex; align-items: center; padding: 0 2px; margin-top: 2px;">
                  <span style="width: 13px; height: 13px; border-radius: 50%; background: {T['faint']};"></span></div>
                <div><div style="font-size: 12.5px; font-weight: 600; color: {T['ink2']};">Let the system draw the window frame</div>
                <div style="font-size: 11.5px; color: {T['faint']}; margin-top: 4px;">Off by default. Runic draws its own chrome, so the mark, the rail and the window controls share one row.</div></div>
              </div>
            </div>
          </div>
        </div>"""
    g = group(strip([tab("web-01", dot="ok"), tab("Settings", state="on", icon="gear", dot=None)]),
              f'<div style="flex: 1; min-height: 0; display: flex; background: {T["base"]};">{panel}</div>')
    rows = "\n".join([group_row("PRODUCTION", 3), host_row("web-01", "deploy@10.4.1.20", "ok"),
                      host_row("web-02", "deploy@10.4.1.21", "saved"), host_row("db-prod", "postgres@10.4.1.31", "saved", kind="database")])
    st = status(stat_text("Settings", T['muted'], mono=False), stat_text("SYNC OFF", T['faint'], mono=False))
    write("Settings.dc.html", page(f'      <div style="flex: 1; min-height: 0; display: flex;">{g}</div>',
                                   sidebar_shell(sessions_header(), rows), rail(gear_pressed=True, badge="1"), st))

# ---------- 10. Home: the rail, the nav, and the wizard's own breadcrumb
# Exploratory. Drawn 2026-08-30 against the maintainer's own complaint that
# the wizard "não mostra onde você está" once Access hands off to its
# automatic phase (#233, #234). Two things here are proposed rather than
# shipped: the third breadcrumb item `wizard_breadcrumb` can draw, and the
# copy on it. Everything else, the rail, HomeNav, HostFields, the stored/kept
# block, the missing-credential notice, is the real, current shape.

def home_rail(workspace="home"):
    """ADR-0029's rail: two peer workspaces, not three slots inside one.
    No gear (moved to a Home card), no SFTP (#127, no code yet, and never a
    slot *inside* this rail even once built). See #234: every other
    artboard's rail still draws the pre-ADR-0029 three-slot shape; this is
    the first one that does not."""
    def slot(icon, on):
        bar = (f'<div style="position: absolute; left: 0; top: 8px; bottom: 8px; width: 2px;'
               f' background: {T["accent"]}; border-radius: 0 2px 2px 0;"></div>') if on else ''
        color = T['ink'] if on else T['faint']
        return (f'<div style="width: 100%; height: 44px; display: flex; align-items: center; justify-content: center;'
                f' position: relative; color: {color};">{bar}{ic(icon, 21, cls="rail-ic")}</div>')
    return f"""    <div style="width: 48px; flex: none; background: {T['chrome']}; border-right: 1px solid {T['line']}; display: flex; flex-direction: column; align-items: center; padding: 6px 0;">
      {slot('home', workspace == 'home')}
      {slot('ssh', workspace == 'sessions')}
    </div>"""

def home_nav(section="hosts"):
    """`HomeNav.tsx`: a breadcrumb, not a tab strip, because neither
    Dashboard nor Hosts is a document somebody is mid-edit on the way
    between."""
    def btn(label, on):
        style = f'background: {T["raised"]}; color: {T["ink"]};' if on else f'color: {T["muted"]};'
        return (f'<span style="{style} border-radius: 6px; padding: 5px 10px; font-size: 12px;'
                f' font-weight: 500;">{label}</span>')
    return f"""    <div style="height: 32px; flex: none; display: flex; align-items: center; gap: 4px; padding: 0 8px;
      background: {T['chrome']}; border-bottom: 1px solid {T['line']};">
      {btn('Home', section == 'dashboard')}
      {btn('Hosts', section == 'hosts')}
    </div>"""

def kind_picker(active="other"):
    """`HostKindPicker.tsx`'s four pills, ADR-0031. 'other' draws no icon,
    same as the sidebar row: KIND_ICON has no entry for it on purpose."""
    kinds = [("jumpServer", "Jump server"), ("database", "Database"), ("web", "Web"), ("other", "Other")]
    out = []
    for key, label in kinds:
        on = key == active
        border = T['accent'] if on else T['line']
        bg = f'background: {T["accentsoft"]};' if on else ''
        color = T['ink'] if on else T['ink2']
        icon = kind_ic(key, T['accent'] if on else T['ink2']) if key != 'other' else ''
        out.append(f'<span style="display: inline-flex; align-items: center; gap: 6px; border: 1px solid {border};'
                    f' {bg} border-radius: 5px; padding: 5px 9px; font-size: 11.5px; color: {color};">{icon}{label}</span>')
    return f'<div style="display: flex; flex-wrap: wrap; gap: 6px;">{"".join(out)}</div>'

def wizard_breadcrumb(step=2, phase=None):
    """Host / Access, `SessionWizard.tsx`'s own two real, navigable steps
    (lines ~197-220) — plus a third item, proposed here, that only ever
    labels the automatic phase Access hands off to once there is nothing
    left to choose (ADR-0034: "not a third step... it runs itself"). Not
    clickable, not part of `step`, not yet in any locale catalogue: the
    point of drawing it is to ask whether it should exist, not to claim it
    already does."""
    items = [("Host", step == 1)]
    items.append(("Access", step == 2 and phase is None))
    if phase:
        items.append((phase, True))
    lis = []
    for i, (label, current) in enumerate(items):
        arrow = f'<span style="color: {T["faint"]};">&#8594;</span>' if i > 0 else ''
        color = T['ink'] if current else T['ink2']
        weight = 'font-weight: 600;' if current else ''
        lis.append(f'<li style="display: flex; align-items: center; gap: 8px;">{arrow}'
                    f'<span style="font-size: 11px; color: {color}; {weight}">{label}</span></li>')
    return f'<ol style="display: flex; align-items: center; gap: 8px; list-style: none; margin: 0; padding: 0;">{"".join(lis)}</ol>'

def hosts_header(creating_new=False):
    plus = (f'<span style="width: 20px; height: 20px; border-radius: 4px; background: {T["raised"]};'
            f' display: flex; align-items: center; justify-content: center; color: {T["accent"]};">{ic("plus")}</span>'
            ) if creating_new else ic('plus', 14, T['muted'])
    return f"""      <div style="display: flex; align-items: center; gap: 8px; padding: 14px 14px 10px;">
        <span style="font-size: 10.5px; font-weight: 700; letter-spacing: 0.1em; color: {T['faint']};">HOSTS</span>
        <div style="flex: 1;"></div>
        {plus}
      </div>"""

def hosts_shell(rows_html, panel_html, creating_new=False):
    """`HostsSection.tsx`: a 280px list beside one form, not a tab per open
    host, because a CRUD screen is exactly that shape."""
    left = f"""    <div style="width: 280px; flex: none; background: {T['panel']}; border-right: 1px solid {T['line']}; display: flex; flex-direction: column;">
{hosts_header(creating_new)}
      <div style="flex: 1; padding: 0 8px 8px; display: flex; flex-direction: column; gap: 2px; overflow: hidden;">
{rows_html}
      </div>
    </div>"""
    return f"""    <div style="flex: 1; min-height: 0; display: flex;">
{left}
      <div style="flex: 1; min-width: 0; overflow: hidden;">{panel_html}</div>
    </div>"""

def wizard_panel(title, step=2, phase=None, notice=False, content=""):
    notice_html = ""
    if notice:
        notice_html = f"""
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; max-width: 440px;
            background: {T['accentsoft']}; border-left: 2px solid {T['accent']}; border-radius: 0 6px 6px 0; padding: 8px 12px;">
            <span style="font-size: 12.5px; color: {T['ink']}; line-height: 1.5;">This opened because Sessions needs to authenticate with this host before it can connect.</span>
            <span style="font-size: 12px; color: {T['muted']}; flex: none;">Dismiss</span>
          </div>"""
    return f"""      <div style="height: 100%; padding: 28px; display: flex; flex-direction: column; gap: 18px; overflow: hidden;">
        <span style="font-size: 15px; font-weight: 600;">{title}</span>
        {wizard_breadcrumb(step, phase)}{notice_html}
{content}
      </div>"""

def wizard_field(v, mono=True, chev=False, placeholder=False):
    c = ' class="mono"' if mono else ''
    color = T['faint'] if placeholder else T['ink']
    tail = ic("chev", 14, T['faint']) if chev else ''
    just = 'justify-content: space-between;' if chev else ''
    return (f'<div style="height: 32px; background: {T["input"]}; border: 1px solid {T["line"]}; border-radius: 6px;'
            f' display: flex; align-items: center; {just} padding: 0 10px;">'
            f'<span{c} style="font-size: 12px; color: {color};">{v}</span>{tail}</div>')

def wizard_label(s):
    return f'<span style="font-size: 11px; font-weight: 600; color: {T["ink2"]}; display: block; margin-bottom: 5px;">{s}</span>'

def wizard_hint(s):
    return f'<span style="font-size: 10.5px; color: {T["faint"]}; margin-top: 5px; display: block;">{s}</span>'

def wizard_actions(*items):
    """items: (label, primary) pairs, first left-aligned, rest packed right."""
    out = []
    for i, (label, primary) in enumerate(items):
        if i == 1:
            out.append('<div style="flex: 1;"></div>')
        if primary:
            out.append(f'<span style="font-size: 12px; font-weight: 600; color: {T["base"]}; background: {T["accent"]};'
                        f' border-radius: 6px; padding: 7px 16px;">{label}</span>')
        else:
            out.append(f'<span style="font-size: 12px; color: {T["muted"]};">{label}</span>')
    return f'<div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">{"".join(out)}</div>'

def build_hosts_host():
    """Host step, redrawn against the real `HostFields.tsx`: kind picker
    (ADR-0031), jump host selector, group with suggestions (#221) — none of
    which the old `NewSession.dc.html` (pre-ADR-0029, pre-wizard) drew.
    See #233."""
    fields = f"""<div style="max-width: 440px; display: flex; flex-direction: column; gap: 14px;">
      <div>{wizard_label('Host')}{wizard_field('target.internal')}</div>
      <div style="display: flex; gap: 12px;">
        <div style="flex: 1;">{wizard_label('User')}{wizard_field('deploy')}</div>
        <div style="width: 90px;">{wizard_label('Port')}{wizard_field('2222')}</div>
      </div>
      <div>{wizard_label('Name')}{wizard_field('Leave empty to use the host', mono=False, placeholder=True)}</div>
      <div>{wizard_label('Group')}{wizard_field('PRODUCTION', mono=False, chev=True)}{wizard_hint('Optional. Sessions are listed under it.')}</div>
      <div>{wizard_label('Kind')}{kind_picker('other')}</div>
      <div>{wizard_label('Reached through')}{wizard_field('bastion', mono=False, chev=True)}
        {wizard_hint("Another saved host to reach this one through. Its key is verified and its saved credential is used, and neither is ever sent to this host.")}</div>
      {wizard_actions(('Cancel', False), ('Next', True))}
    </div>"""
    rows = "\n".join([host_row("bastion", "jump@127.0.0.1", "saved", kind="jumpServer"),
                      host_row("target.internal", "deploy@target.internal", "saved", active=True, via="bastion", depth=1)])
    panel = wizard_panel("target.internal", step=1, content=fields)
    body = home_nav("hosts") + hosts_shell(rows, panel)
    st = status(stat_text("target.internal", T['muted'], mono=False), stat_text("2 hosts", T['faint']))
    write("HostsHost.dc.html", page(body, None, home_rail(), st, show_shapes=False))

def build_hosts_access():
    """Access step, not yet proving. The missing-credential notice (ADR-0039)
    shown here is the state that reaches this screen without a click on it:
    Sessions sent the user here, so there is a note saying why."""
    fields = f"""<div style="max-width: 440px; display: flex; flex-direction: column; gap: 14px;">
      <div role="radiogroup" style="display: flex; gap: 3px; background: {T['input']}; border: 1px solid {T['line']}; border-radius: 8px; padding: 3px; max-width: 260px;">
        <span style="flex: 1; text-align: center; font-size: 11.5px; font-weight: 600; color: {T['ink']}; background: {T['raised']}; border-radius: 6px; padding: 6px 0;">Password</span>
        <span style="flex: 1; text-align: center; font-size: 11.5px; color: {T['muted']}; padding: 6px 0;">Private key</span>
      </div>
      {wizard_actions(('Cancel', False), ('Back', False), ('Next', True))}
    </div>"""
    rows = "\n".join([host_row("bastion", "jump@127.0.0.1", "saved", kind="jumpServer"),
                      host_row("target.internal", "deploy@target.internal", "saved", active=True, via="bastion", depth=1)])
    panel = wizard_panel("target.internal", step=2, notice=True, content=fields)
    body = home_nav("hosts") + hosts_shell(rows, panel)
    st = status(stat_text("target.internal", T['muted'], mono=False), stat_text("2 hosts", T['faint']))
    write("HostsAccess.dc.html", page(body, None, home_rail(), st, show_shapes=False))

def build_hosts_phase():
    """Access, proving, the bastion's own inline credential (ADR-0033) —
    picked as the example because it is the sub-phase the maintainer's
    complaint names most directly: today nothing on screen says *whose*
    password this is beyond the banner text. The proposed third breadcrumb
    item is what this artboard exists to show."""
    fields = f"""<div style="max-width: 440px; display: flex; flex-direction: column; gap: 14px;">
      <div style="display: flex; align-items: flex-start; gap: 10px; background: {T['warnsoft']}; border-left: 2px solid {T['warn']}; border-radius: 0 6px 6px 0; padding: 9px 12px;">
        <span style="font-size: 12px; color: {T['ink2']}; line-height: 1.5;">This password is for the jump host, not for the host you asked for. Runic SSH reaches target.internal through this one, so this credential is used first.</span>
      </div>
      <div>{wizard_label('Password')}{wizard_field('', mono=False)}</div>
      <div>
        <span style="font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; color: {T['faint']}; display: block; margin-bottom: 6px;">KEEP THIS CREDENTIAL</span>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <span style="font-size: 11.5px; color: {T['ink2']};">&#9679; Until Runic SSH closes, in memory only</span>
          <span style="font-size: 11.5px; color: {T['muted']};">&#9675; In the system keychain, until I remove it</span>
        </div>
      </div>
      {wizard_actions(('Cancel', False), ('Authenticate', True))}
    </div>"""
    rows = "\n".join([host_row("bastion", "jump@127.0.0.1", "saved", active=True, kind="jumpServer"),
                      host_row("target.internal", "deploy@target.internal", "saved", via="bastion", depth=1)])
    panel = wizard_panel("bastion", step=2, phase="Bastion", notice=True, content=fields)
    body = home_nav("hosts") + hosts_shell(rows, panel)
    st = status(stat_text("bastion", T['muted'], mono=False), stat_text("2 hosts", T['faint']))
    write("HostsPhase.dc.html", page(body, None, home_rail(), st, show_shapes=False))

# ============================================================ SYSTEM SHEETS

def sheet(title, sub, body, h=900):
    return (HEAD + f"""
<div style="width: 1440px; height: {h}px; background: {T['base']}; color: {T['ink']}; padding: 40px 46px; overflow: hidden; font-size: 13px;">
  <div style="display: flex; align-items: baseline; gap: 14px;">
    <span style="font-size: 22px; font-weight: 700; letter-spacing: -0.01em;">{title}</span>
    <span style="font-size: 12.5px; color: {T['muted']};">{sub}</span>
  </div>
  <div style="height: 1px; background: {T['line']}; margin: 18px 0 26px;"></div>
{body}
</div>
""" + FOOT)

def build_anatomy():
    def reg(label, w, h, bg, color, note, border=None):
        b = f'border: 1px solid {border};' if border else ''
        return (f'<div style="width: {w}; height: {h}; background: {bg}; {b} display: flex; flex-direction: column;'
                f' align-items: center; justify-content: center; gap: 3px; color: {color};">'
                f'<span style="font-size: 10.5px; font-weight: 700; letter-spacing: 0.09em;">{label}</span>'
                f'<span class="mono" style="font-size: 10px; opacity: 0.72;">{note}</span></div>')
    diagram = f"""    <div style="width: 660px; border: 1px solid {T['line2']}; border-radius: 8px; overflow: hidden;">
      {reg('TOP STRIP', '100%', '46px', T['chrome'], T['muted'], 'mark &#183; drag &#183; window controls &#183; 36px')}
      <div style="display: flex; height: 300px; border-top: 1px solid {T['line']}; border-bottom: 1px solid {T['line']};">
        {reg('RAIL', '62px', '100%', T['chrome'], T['accent'], '48px')}
        <div style="width: 1px; background: {T['line']};"></div>
        {reg('SIDEBAR', '180px', '100%', T['panel'], T['muted'], '280px<br>closable')}
        <div style="width: 1px; background: {T['line']};"></div>
        <div style="flex: 1; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; background: {T['line']};">
          {reg('GROUP', '100%', '100%', T['terminal'], T['accent'], 'strip + body')}
          {reg('GROUP', '100%', '100%', T['terminal'], T['faint'], '')}
          {reg('GROUP', '100%', '100%', T['terminal'], T['faint'], '')}
          {reg('GROUP', '100%', '100%', T['terminal'], T['faint'], '')}
        </div>
      </div>
      {reg('STATUS BAR', '100%', '40px', T['chrome'], T['muted'], 'focused group &#183; broadcast state &#183; 32px')}
    </div>"""
    def rule(n, head, body):
        return (f'<div style="display: flex; gap: 13px;">'
                f'<span class="mono" style="font-size: 11px; color: {T["accent"]}; width: 15px; flex: none; padding-top: 1px;">{n}</span>'
                f'<div><div style="font-size: 12.5px; font-weight: 600; color: {T["ink2"]};">{head}</div>'
                f'<div style="font-size: 11.5px; color: {T["faint"]}; line-height: 1.55; margin-top: 3px;">{body}</div></div></div>')
    rules = "".join([
        rule("1", "One chrome, always",
             "Top strip, rail and status bar exist on every working screen. Splitting, broadcasting and a host key prompt never swap the window for a different product."),
        rule("2", "A group owns its tabs",
             "Every rectangle in the main area is a group: a 28px strip of tabs plus the body of the active one. There is no second mechanism naming a rectangle, and no global tab bar."),
        rule("3", "Everything opened is a tab",
             "A terminal, an SFTP browser, a host form and settings are all tabs in a group. A surface belonging to a session renders in the group whose active tab it is, which is ADR-0015 read for groups."),
        rule("4", "The sidebar is closable, the rail is not",
             "Closing the sidebar gives 280px to the terminal. The rail stays, so the way back is the icon that closed it."),
        rule("5", "State is shape first, colour second",
             "Connection state is a marker whose shape carries it. Colour is the second signal, never the only one."),
        rule("6", "Nothing on screen that the backend does not have",
             "No tags, no global search, no health line, no shortcut that is not bound. The layout reserves room to think, never interface that lies."),
        rule("7", "Safety outranks tidiness",
             "Armed broadcast pins the rail, marks every receiving tab, and turns the whole top edge of the status bar warn. Those markers survive a closed sidebar."),
    ])
    body = f"""  <div style="display: flex; gap: 46px; align-items: flex-start;">
{diagram}
    <div style="flex: 1; display: flex; flex-direction: column; gap: 15px;">{rules}</div>
  </div>
  <div style="margin-top: 30px; display: flex; gap: 40px; align-items: flex-start;">
    <div>
      <div style="font-size: 10px; font-weight: 700; letter-spacing: 0.11em; color: {T['faint']};">A GROUP, IN DETAIL</div>
      <div style="margin-top: 11px; width: 420px; border: 1px solid {T['line2']}; border-radius: 7px; overflow: hidden;">
        <div class="strip">{tab('web-01', state='on')}{tab('web-02')}<div style="flex: 1;"></div>
          <div style="display: flex; align-items: center; padding-right: 8px; gap: 7px; color: {T['faint']};">{ic('plus', 12)}{ic('dots', 12)}</div></div>
        <div class="term mono" style="height: 96px;">{prompt('deploy', 'web-01', 'uptime')}
 09:41:02 up 12 days,  3:18,  load 0.14
{prompt('deploy', 'web-01')}{CURSOR}</div>
      </div>
    </div>
    <div style="flex: 1;">
      <div style="font-size: 10px; font-weight: 700; letter-spacing: 0.11em; color: {T['faint']};">WHAT THIS AMENDS</div>
      <div style="margin-top: 11px; display: flex; flex-direction: column; gap: 9px; font-size: 12px; color: {T['ink2']}; line-height: 1.55;">
        <div><span class="mono" style="color: {T['accent']};">ADR-0005</span> &nbsp;keeps its decision to draw our own chrome, and loses the part that put tabs in the titlebar. Tabs live in groups.</div>
        <div><span class="mono" style="color: {T['accent']};">ADR-0015</span> &nbsp;reads the same with one word moved: a session's surface renders in the group whose active tab it is.</div>
        <div><span class="mono" style="color: {T['accent']};">ADR-0017</span> &nbsp;is untouched. A host form is still a tab, and so is settings.</div>
        <div><span class="mono" style="color: {T['warn']};">ADR-0019</span> &nbsp;is the one that pays. A layout stops being slots holding one session and becomes groups holding a list plus an active index, so <span class="mono">layout.ts</span> is rewritten rather than extended.</div>
      </div>
    </div>
  </div>"""
    write("Anatomy.dc.html", sheet("Anatomy", "the window, the regions, and the seven rules every surface inherits", body))

def build_tokens():
    def sw(name, val, role):
        return (f'<div style="display: flex; align-items: center; gap: 12px;">'
                f'<span style="width: 40px; height: 26px; border-radius: 5px; background: {val}; border: 1px solid {T["line2"]}; flex: none;"></span>'
                f'<div style="min-width: 0;"><div class="mono" style="font-size: 11px; color: {T["ink2"]};">{name}</div>'
                f'<div style="font-size: 10.5px; color: {T["faint"]}; margin-top: 1px;">{role}</div></div>'
                f'<span class="mono" style="margin-left: auto; font-size: 10px; color: {T["off"]};">{val}</span></div>')
    surfaces = "".join(sw(n, v, r) for n, v, r in [
        ("surface-base", T['base'], "app ground, settings"),
        ("surface-panel", T['panel'], "sidebar"),
        ("surface-chrome", T['chrome'], "top strip, rail, tab strip, status"),
        ("surface-terminal", T['terminal'], "the xterm body, deepest on purpose"),
        ("surface-raised", T['raised'], "active row, hover"),
        ("surface-overlay", T['overlay'], "palette, menus, host key card"),
        ("surface-input", T['input'], "fields"),
    ])
    accents = "".join(sw(n, v, r) for n, v, r in [
        ("accent", T['accent'], "focus, active tab edge, links"),
        ("accent-soft", T['accentsoft'], "selected row, chosen option"),
        ("state-ok", T['ok'], "connected"),
        ("state-warn", T['warn'], "connecting, and broadcast armed"),
        ("state-danger", T['danger'], "key changed, revoked, failures"),
    ])
    def marker(shape, label, why):
        return (f'<div style="display: flex; align-items: center; gap: 11px;">{shape}'
                f'<div><div style="font-size: 11.5px; color: {T["ink2"]};">{label}</div>'
                f'<div style="font-size: 10.5px; color: {T["faint"]};">{why}</div></div></div>')
    d = 'width: 9px; height: 9px; border-radius: 50%; flex: none;'
    markers = "".join([
        marker(f'<span style="{d} background: {T["ok"]};"></span>', "connected", "filled"),
        marker(f'<span style="{d} border: 2px solid {T["warn"]}; box-sizing: border-box; box-shadow: 0 0 0 3px {T["warnsoft"]};"></span>', "connecting", "outlined with a halo"),
        marker(f'<span style="{d} border: 2px solid {T["off"]}; box-sizing: border-box;"></span>', "saved", "hollow"),
        marker(f'<svg viewBox="0 0 24 24" fill="none" stroke="{T["danger"]}" stroke-width="2" style="width: 13px; height: 13px; flex: none;"><path d="M12 4l9 16H3z"></path><path d="M12 10v4M12 17v.01"></path></svg>', "key mismatch", "a different glyph, not a colour"),
        marker(f'<svg viewBox="0 0 24 24" fill="none" stroke="{T["faint"]}" stroke-width="2" style="width: 13px; height: 13px; flex: none;"><circle cx="12" cy="12" r="8.5"></circle><path d="M6 6l12 12"></path></svg>', "unreachable", "slashed, and cool rather than red"),
    ])
    def dens(region, px, note):
        return (f'<tr><td style="padding: 6px 0; font-size: 12px; color: {T["ink2"]};">{region}</td>'
                f'<td class="mono" style="padding: 6px 16px; font-size: 12px; color: {T["accent2"]}; text-align: right;">{px}</td>'
                f'<td style="padding: 6px 0; font-size: 11px; color: {T["faint"]};">{note}</td></tr>')
    density = "".join([
        dens("Top strip", "36px", "was 40px with tabs in it"),
        dens("Rail", "48px", "44px slots"),
        dens("Sidebar", "280px", "closable"),
        dens("Tab strip in a group", "28px", "replaces the pane header"),
        dens("Sidebar row", "40px", "two lines, name over user@host"),
        dens("Status bar", "32px", ""),
    ])
    def typ(sample, spec, style):
        return (f'<div style="display: flex; align-items: baseline; gap: 18px;">'
                f'<span style="{style} width: 300px;">{sample}</span>'
                f'<span class="mono" style="font-size: 10.5px; color: {T["faint"]};">{spec}</span></div>')
    types = "".join([
        typ("Unknown host key", "Manrope 700 &#183; 15px", "font-size: 15px; font-weight: 700;"),
        typ("Pick a host on the left", "Manrope 600 &#183; 13.5px", "font-size: 13.5px; font-weight: 600; color: " + T['ink2'] + ";"),
        typ("Optional. Sessions are listed under it.", "Manrope 400 &#183; 11.5px", "font-size: 11.5px; color: " + T['faint'] + ";"),
        typ("SESSIONS", "Manrope 700 &#183; 10px &#183; 0.12em", "font-size: 10px; font-weight: 700; letter-spacing: 0.12em; color: " + T['faint'] + ";"),
        f'<div style="display: flex; align-items: baseline; gap: 18px;"><span class="mono" style="font-size: 12.5px; width: 300px; color: {T["ink2"]};">deploy@10.4.1.20</span><span class="mono" style="font-size: 10.5px; color: {T["faint"]};">JetBrains Mono 400 &#183; 12.5px</span></div>',
        f'<div style="display: flex; align-items: baseline; gap: 18px;"><span class="mono" style="font-size: 12px; width: 300px; color: {T["accent2"]};">SHA256:9pJk2vQr7Xf1mNbT4wLd</span><span class="mono" style="font-size: 10.5px; color: {T["faint"]};">fingerprints, sizes, paths</span></div>',
    ])
    def col(title, inner, w=None):
        wd = f'width: {w};' if w else 'flex: 1;'
        return (f'<div style="{wd}"><div style="font-size: 10px; font-weight: 700; letter-spacing: 0.11em; color: {T["faint"]};">{title}</div>'
                f'<div style="margin-top: 13px; display: flex; flex-direction: column; gap: 11px;">{inner}</div></div>')
    body = f"""  <div style="display: flex; gap: 40px; align-items: flex-start;">
    {col('SURFACES, BACK TO FRONT', surfaces, '400px')}
    {col('ACCENT AND STATE', accents, '400px')}
    <div style="flex: 1;">
      <div style="font-size: 10px; font-weight: 700; letter-spacing: 0.11em; color: {T['faint']};">DENSITY</div>
      <table style="margin-top: 9px; width: 100%; border-collapse: collapse;">{density}</table>
      <div style="font-size: 11px; color: {T['faint']}; line-height: 1.5; margin-top: 12px;">Every number here is what the components already use on <span class="mono">feat/visual-improvements</span>, except the tab strip, which is the pane header repurposed.</div>
    </div>
  </div>
  <div style="height: 1px; background: {T['line']}; margin: 30px 0;"></div>
  <div style="display: flex; gap: 40px; align-items: flex-start;">
    {col('TYPE', types, '520px')}
    {col('CONNECTION MARKERS, SHAPE FIRST', markers, '320px')}
    <div style="flex: 1;">
      <div style="font-size: 10px; font-weight: 700; letter-spacing: 0.11em; color: {T['faint']};">THE ONE RULE A MACHINE CAN KEEP</div>
      <div style="margin-top: 11px; font-size: 12px; color: {T['ink2']}; line-height: 1.6;">
        Colour is named in <span class="mono" style="color: {T['accent2']};">src/styles/tokens.css</span> and nowhere else. <span class="mono">tests/design-tokens.test.ts</span> fails on a literal hex anywhere under <span class="mono">src/</span>, on a token defined in one theme and not the other, and on the two light blocks drifting apart.
      </div>
      <div style="margin-top: 13px; padding: 12px 14px; background: {T['dangersoft']}; border: 1px solid {T['danger']}; border-radius: 7px;">
        <div style="font-size: 11.5px; font-weight: 700; color: {T['dangertext']};">The gap it does not cover</div>
        <div style="font-size: 11.5px; color: {T['muted']}; line-height: 1.55; margin-top: 5px;">It proves the light tokens exist. It never proves light renders. <span class="mono">main.tsx</span> pinning <span class="mono">data-theme</span> to dark passes every assertion in that file, which is how the light theme became unreachable without a single test going red.</div>
      </div>
    </div>
  </div>"""
    write("Tokens.dc.html", sheet("Tokens", "one palette, two themes, and the guard that keeps them honest", body))

# ============================================================

# ---------- 10. changed host key, blocked
def build_hostkeychanged():
    def fp(label, val, color):
        return (f'<div style="flex: 1;"><div style="font-size: 9.5px; font-weight: 700; letter-spacing: 0.11em; color: {T["faint"]};">{label}</div>'
                f'<div class="mono" style="font-size: 11.5px; color: {color}; margin-top: 5px; word-break: break-all;">{val}</div></div>')
    card = f"""        <div style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 26px;">
          <div style="width: 700px; background: {T['overlay']}; border: 1px solid {T['danger']}; border-radius: 10px; overflow: hidden;">
            <div style="display: flex; align-items: center; gap: 11px; padding: 16px 22px; background: {T['dangersoft']}; border-bottom: 1px solid {T['danger']};">
              <svg class="ic" viewBox="0 0 24 24" style="width: 17px; height: 17px; color: {T['dangertext']};"><path d="M12 4l9 16H3z"></path><path d="M12 10v4M12 17v.01"></path></svg>
              <span style="font-size: 15px; font-weight: 700; color: {T['dangertext']};">Host key changed, connection blocked</span>
            </div>
            <div style="padding: 20px 22px;">
              <div style="font-size: 12.5px; color: {T['ink2']}; line-height: 1.6;">The key db-prod presented does not match the one saved. Either the host was rebuilt, or something is sitting between you and it.</div>
              <div style="display: flex; gap: 24px; margin-top: 20px;">
                {fp('TRUSTED BEFORE', 'SHA256:1aQw8eRt5Yu2Io9Pa3Sd6Fg7Hj0Kl4Zx1Cv8Bn2Mq', T['muted'])}
                {fp('OFFERED NOW', 'SHA256:7Zx4Cv1Bn8Mq2Aw5Se9Df3Gh6Jk0Lp2Oi5Uy8Tr1E', T['dangertext'])}
              </div>
              <div style="margin-top: 20px;">
                <div style="font-size: 9.5px; font-weight: 700; letter-spacing: 0.11em; color: {T['faint']};">TO OVERRIDE, TYPE THE HOST NAME</div>
                <div style="margin-top: 8px; height: 34px; max-width: 300px; background: {T['input']}; border: 1px solid {T['line']}; border-radius: 6px; display: flex; align-items: center; padding: 0 11px;">
                  <span class="mono" style="font-size: 12.5px; color: {T['off']};">db-prod</span></div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px; padding: 15px 22px; border-top: 1px solid {T['line']}; background: {T['base']};">
              <div style="flex: 1;"></div>
              <span style="font-size: 12.5px; color: {T['off']}; border: 1px solid {T['line']}; border-radius: 6px; padding: 8px 18px;">Replace stored key</span>
              <span style="font-size: 12.5px; font-weight: 600; color: {T['base']}; background: {T['accent']}; border-radius: 6px; padding: 8px 20px;">Cancel connection</span>
            </div>
          </div>
        </div>"""
    g1 = group(strip([tab("web-01", state="on")]),
               term(prompt("deploy", "web-01", "uptime") + "\n 09:41:02 up 12 days,  3:18\n" + prompt("deploy", "web-01") + CURSOR))
    g2 = group(strip([tab("db-prod", state="on", dot="danger", accent=T['danger'])], actions=False), card)
    grid = (f'      <div style="flex: 1; min-height: 0; display: grid; grid-template-columns: 340px minmax(0, 1fr);'
            f' gap: 1px; background: {T["line"]};">{g1}{g2}</div>')
    rows = "\n".join([group_row("PRODUCTION", 3), host_row("web-01", "deploy@10.4.1.20", "ok"),
                       f'<div class="row"><svg viewBox="0 0 24 24" fill="none" stroke="{T["danger"]}" stroke-width="2" style="width: 13px; height: 13px; flex: none;"><path d="M12 4l9 16H3z"></path><path d="M12 10v4M12 17v.01"></path></svg>'
                       f'<span style="font-size: 12.5px; color: {T["dangertext"]}; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">db-prod</span>'
                       f'<span class="mono" style="font-size: 10.5px; color: {T["faint"]}; flex: none; margin-left: auto;">blocked</span></div>',
                       host_row("cache-01", "redis@10.4.1.44", "saved")])
    st = status(f'    <div style="display: flex; align-items: center; gap: 7px;"><svg viewBox="0 0 24 24" fill="none" stroke="{T["danger"]}" stroke-width="2" style="width: 12px; height: 12px;"><path d="M12 4l9 16H3z"></path><path d="M12 10v4M12 17v.01"></path></svg>'
                f'<span style="font-size: 11px; color: {T["dangertext"]};">db-prod blocked</span></div>',
                stat_text("SYNC OFF", T['faint'], mono=False))
    write("HostKeyChanged.dc.html", page(grid, sidebar_shell(sessions_header(), rows), rail(badge="2"), st))

# ---------- 11. connection failure, in the group that tried
def build_failure():
    card = f"""        <div style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 30px;">
          <div style="width: 520px; text-align: center;">
            <svg viewBox="0 0 24 24" fill="none" stroke="{T['faint']}" stroke-width="1.4" style="width: 42px; height: 42px; opacity: 0.8;"><circle cx="12" cy="12" r="8.5"></circle><path d="M6 6l12 12"></path></svg>
            <div style="font-size: 15px; font-weight: 700; margin-top: 16px;">Could not reach the host</div>
            <div style="font-size: 12.5px; color: {T['muted']}; line-height: 1.6; margin-top: 8px;">Nothing answered at that address and port. Check that the host is up, and that the port is the one it listens on.</div>
            <div class="mono" style="font-size: 11.5px; color: {T['faint']}; margin-top: 14px;">10.9.0.5:22</div>
            <div style="display: flex; gap: 10px; justify-content: center; margin-top: 20px;">
              <span style="font-size: 12.5px; font-weight: 600; color: {T['base']}; background: {T['accent']}; border-radius: 6px; padding: 8px 20px;">Try again</span>
              <span style="font-size: 12.5px; color: {T['muted']}; border: 1px solid {T['line']}; border-radius: 6px; padding: 8px 20px;">Cancel</span>
            </div>
          </div>
        </div>"""
    g1 = group(strip([tab("web-01", state="on")]),
               term(prompt("deploy", "web-01", "ping -c1 10.9.0.5") + "\n"
                    "PING 10.9.0.5 56 data bytes\n\n--- 10.9.0.5 ping statistics ---\n"
                    "1 packets transmitted, 0 received, 100% packet loss\n" + prompt("deploy", "web-01") + CURSOR))
    g2 = group(strip([tab("stg-app", state="on", dot="saved")], actions=False), card)
    grid = (f'      <div style="flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));'
            f' gap: 1px; background: {T["line"]};">{g1}{g2}</div>')
    st = status(f'    <div style="display: flex; align-items: center; gap: 7px;"><svg viewBox="0 0 24 24" fill="none" stroke="{T["faint"]}" stroke-width="2" style="width: 12px; height: 12px;"><circle cx="12" cy="12" r="8.5"></circle><path d="M6 6l12 12"></path></svg>'
                f'<span style="font-size: 11px; color: {T["muted"]};">stg-app unreachable</span></div>',
                stat_text("SYNC OFF", T['faint'], mono=False))
    write("Failure.dc.html", page(grid, sessions_sidebar(active="web-01", states={"web-01": "ok"}), rail(badge="2"), st))

# ---------- 12. paste, with typing synchronised
def build_paste():
    lines = ["systemctl stop site-web", "rm -rf /var/lib/site/cache/*", "systemctl start site-web"]
    body = "".join(f'<div class="mono" style="font-size: 12px; color: {T["ink2"]}; padding: 4px 0;">'
                   f'<span style="color: {T["off"]}; margin-right: 12px;">{i+1}</span>{l}</div>' for i, l in enumerate(lines))
    card = f"""        <div style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 30px;">
          <div style="width: 600px; background: {T['overlay']}; border: 1px solid {T['warn']}; border-radius: 10px; overflow: hidden;">
            <div style="display: flex; align-items: center; gap: 10px; padding: 14px 20px; background: {T['warnsoft']}; border-bottom: 1px solid {T['warn']};">
              <svg class="ic" viewBox="0 0 24 24" style="color: {T['warn']};">{ICON['shield']}</svg>
              <span style="font-size: 13.5px; font-weight: 700; color: {T['warn']};">This is sent to 3 hosts at once.</span>
            </div>
            <div style="padding: 18px 20px;">
              <div style="font-size: 12.5px; color: {T['ink2']}; line-height: 1.6;">The remote shell runs each line as it arrives, so this starts running before you press Return.</div>
              <div style="margin-top: 14px; background: {T['terminal']}; border: 1px solid {T['line']}; border-radius: 7px; padding: 10px 14px;">{body}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px; padding: 14px 20px; border-top: 1px solid {T['line']}; background: {T['base']};">
              <div style="flex: 1;"></div>
              <span style="font-size: 12.5px; color: {T['muted']}; border: 1px solid {T['line']}; border-radius: 6px; padding: 8px 20px;">Cancel</span>
              <span style="font-size: 12.5px; font-weight: 600; color: {T['warnsoft']}; background: {T['warn']}; border-radius: 6px; padding: 8px 20px;">Paste</span>
            </div>
          </div>
        </div>"""
    g = group(strip([tab("web-01", "deploy@10.4.1.20", "on", dot="check", accent=T['warn'])], actions=False), card, border=T['warn'])
    rows = "\n".join([group_row("PRODUCTION", 3),
                       host_row("web-01", "deploy@10.4.1.20", "ok", True, "check", T['warn']),
                       host_row("web-02", "deploy@10.4.1.21", "ok", False, "check", T['warn']),
                       host_row("web-03", "deploy@10.4.1.22", "ok", False, "check", T['warn'])])
    hdr = f"""      <div style="padding: 12px; border-bottom: 1px solid {T['line']}; display: flex; align-items: center; justify-content: space-between;">
        <span style="font-size: 10px; font-weight: 700; letter-spacing: 0.12em; color: {T['faint']};">SESSIONS</span>
        <span style="font-size: 9.5px; font-weight: 700; letter-spacing: 0.1em; color: {T['warn']}; background: {T['warnsoft']}; border: 1px solid {T['warn']}; border-radius: 4px; padding: 2px 7px;">3 RECEIVING</span>
      </div>"""
    st = status_warn(stat_session("deploy@10.4.1.20") + "\n" + sep() + "\n" + stat_text("waiting on you", T['warn'], mono=False),
                     f'    <span style="font-size: 10.5px; font-weight: 700; letter-spacing: 0.1em; color: {T["warnsoft"]}; background: {T["warn"]}; border-radius: 4px; padding: 4px 10px;">TYPING INTO 3 HOSTS</span>')
    write("PasteConfirm.dc.html", page(f'      <div style="flex: 1; min-height: 0; padding: 8px; display: flex;">{g}</div>',
                                       sidebar_shell(hdr, rows), rail(locked=True, badge="3", accent=T['warn']), st))

# ---------- 13. the command palette
def build_palette():
    def prow(icon, name, sub, on=False):
        bg = f'background: {T["accentsoft"]}; border-radius: 6px;' if on else ''
        return (f'<div style="display: flex; align-items: center; gap: 11px; padding: 9px 12px; {bg}">'
                f'{ic(icon, 14, T["accent"] if on else T["faint"])}'
                f'<span style="font-size: 12.5px; color: {T["ink"] if on else T["ink2"]};">{name}</span>'
                f'<span class="mono" style="margin-left: auto; font-size: 11px; color: {T["faint"]};">{sub}</span></div>')
    def sect(s):
        return f'<div style="font-size: 9.5px; font-weight: 700; letter-spacing: 0.11em; color: {T["faint"]}; padding: 10px 12px 5px;">{s}</div>'
    overlay = f"""        <div style="flex: 1; position: relative; display: flex; justify-content: center; padding-top: 62px;">
          <div class="term mono" style="position: absolute; inset: 0; opacity: 0.4;">{prompt('deploy', 'web-01', 'systemctl status nginx')}
&#9679; nginx.service - A high performance web server
     Active: active (running) since Mon 2026-08-24 09:12:04 UTC
{prompt('deploy', 'web-01')}</div>
          <div style="position: relative; width: 560px; background: {T['overlay']}; border: 1px solid {T['line2']}; border-radius: 10px; overflow: hidden; box-shadow: 0 18px 50px rgba(0,0,0,0.5);">
            <div style="display: flex; align-items: center; gap: 11px; padding: 13px 16px; border-bottom: 1px solid {T['line']};">
              {ic('search', 15, T['faint'])}<span style="font-size: 13.5px; color: {T['faint']};">Type a command or a host</span>
              <div style="flex: 1;"></div><span class="mono" style="font-size: 10.5px; color: {T['off']};">3 of 12</span>
            </div>
            <div style="padding: 4px 6px 8px;">
              {sect('SESSIONS')}
              {prow('ssh', 'web-02', 'deploy@10.4.1.21', True)}
              {prow('ssh', 'db-prod', 'postgres@10.4.1.31')}
              {sect('ACTIONS')}
              {prow('newsession', 'New session', '')}
              {prow('shape_columns', 'Split into two columns', '')}
              {prow('gear', 'Settings', '')}
            </div>
          </div>
        </div>"""
    g = group(strip([tab("web-01", state="on"), tab("db-prod")]),
              f'<div style="flex: 1; min-height: 0; display: flex; background: {T["terminal"]};">{overlay}</div>')
    st = status(stat_session("deploy@10.4.1.20") + "\n" + sep() + "\n" + stat_text("198 x 42"),
                stat_text("SYNC OFF", T['faint'], mono=False))
    write("Palette.dc.html", page(f'      <div style="flex: 1; min-height: 0; display: flex;">{g}</div>',
                                  sessions_sidebar(active="web-01", states={"web-01": "ok", "db-prod": "ok"}), rail(badge="2"), st))

if LIGHT_MODE:
    _w = write
    write = lambda name, content: _w("MainLight.dc.html", content)
    build_main()
else:
    for fn in (build_empty, build_main, build_groups, build_collapsed, build_broadcast,
               build_hostkey, build_sftp, build_newsession, build_settings,
               build_hosts_host, build_hosts_access, build_hosts_phase,
               build_anatomy, build_tokens,
               build_hostkeychanged, build_failure, build_paste, build_palette):
        fn()
