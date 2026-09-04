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
    # The rail's Home icon, an open book: ADR-0052/ADR-0056 already call the
    # dense, searchable Home screen the "host book", and the rail's own
    # glyph was still a plain house until the maintainer asked for it to
    # match. Path copied verbatim from ActivityRail.tsx rather than invented
    # for the mockup.
    home='<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>'
         '<path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>',
    # Exploratory (`build_sftp_proposal`): a redo-shaped arrow for the
    # navigation bar's refresh action. `chev` rotated stands in for back and
    # up, so this is the only new glyph the proposal needed.
    refresh='<path d="M20 12a8 8 0 1 1-2.6-5.9"></path><path d="M20 4v5h-5"></path>',
    # Exploratory: the toolbar's own arm/disarm-everyone shortcut
    # (`broadcast_button`), a cast-style glyph distinct from the warning
    # triangle `warn_chip`/StatusBar.tsx's own `syncing` indicator already
    # uses, since one is a control and the other a caution.
    broadcast='<circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none"></circle><path d="M8 15.5a5.5 5.5 0 0 1 8 0"></path><path d="M4.5 12a10 10 0 0 1 15 0"></path>',
    # Exploratory (`build_sftp_file_ops`): the plain folder outline
    # `FolderIcon`/`ic('sftp', ...)` already draw, with a plus in place of
    # `sftp`'s own receiving-arrow, for the nav bar's "new folder" action.
    newfolder='<path d="M4 6.5h6l1.6 2H20v9.5H4z"></path><path d="M12 12v4M10 14h4"></path>',
    # ADR-0050, #292: the two icon-bar commands a Windows 11-style
    # selection offers next to the count, in `nav_bar()`'s own
    # `selected_count` now for real, beside the right-click menu
    # (`menu_item`'s own "Rename"/"Delete") rather than instead of it.
    pencil='<path d="M4 20l1-4.2L15.8 5l3.2 3.2L8.2 19H4z"></path><path d="M13.8 6.7l3.2 3.2"></path>',
    trash='<path d="M5 7h14"></path><path d="M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2"></path>'
          '<path d="M7 7l1 12.5a1.5 1.5 0 0 0 1.5 1.4h5a1.5 1.5 0 0 0 1.5-1.4L17 7"></path><path d="M10 11v6M14 11v6"></path>',
)

def ic(name, size=14, color=None, cls="ic", extra=""):
    st = f"width: {size}px; height: {size}px;"
    if color: st += f" color: {color};"
    return f'<svg class="{cls}" viewBox="0 0 24 24" style="{st}{extra}">{ICON[name]}</svg>'

# ADR-0031's glyphs, paths copied verbatim from HostKindIcon.tsx (16x16
# viewBox, not 24x24 like ICON above) so the canvas draws the same shape the
# tree does rather than a second one invented for the mockup. jumpServer and
# target are the two ends of jump.ts's own jumpRole, a fork and a turn;
# direct, neither end of one and also the default, is the plain line drawn
# for every host that is neither of the other two.
KIND_ICON = dict(
    jumpServer='<path d="M1.5 8h5M6.5 8l5-4.5M6.5 8l5 4.5"></path><circle cx="13" cy="3.5" r="1.4"></circle><circle cx="13" cy="12.5" r="1.4"></circle>',
    target='<path d="M3.5 2.5v7a2.5 2.5 0 0 0 2.5 2.5h6.5M10 9l3 3-3 3"></path>',
    direct='<path d="M2.5 8h11"></path>',
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

def strip(tabs, actions=False, extra=""):
    """`GroupStrip.tsx` as it actually reads today: tabs, then whatever
    `extra` a caller draws (`sync_icon()`, most often). `actions=True` is
    kept only so an artboard from before the command palette existed can
    still ask for the plus/dots pair it drew then; every current artboard
    leaves it at the default. #262: this used to default to `True`, drawing
    that pair on every artboard that did not opt out, well after
    `GroupStrip.tsx`'s own comment says they were retired ("everything it
    offered is either a drag away or in the palette"). Flipped 2026-09-01,
    once `sessions_header()`'s own identical drift (fixed 2026-08-31) made
    it obvious this one had not been."""
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

def sessions_header():
    """`SessionsSidebar.tsx`'s own header, as it actually reads today: a
    label and the filter box, nothing else.

    This used to draw a trailing row of new-session/new-group/collapse/dots
    buttons. They were retired from the real header once the palette took
    over what they did (`GroupStrip.tsx`'s own comment: "everything it
    offered is either a drag away or in the palette"), and this helper kept
    drawing them anyway, which is the exact drift the canvas exists to
    prevent (README: "Two artboards cannot drift apart by hand"). Fixed
    2026-08-31 against that finding, made while proposing `SftpProposal.dc.html`."""
    return f"""      <div style="padding: 12px; display: flex; flex-direction: column; gap: 10px; border-bottom: 1px solid {T['line']};">
        <span style="font-size: 10px; font-weight: 700; letter-spacing: 0.12em; color: {T['faint']};">SESSIONS</span>
        <div style="height: 32px; background: {T['input']}; border: 1px solid {T['line']}; border-radius: 6px; display: flex; align-items: center; gap: 8px; padding: 0 10px;">
          {ic('search', 14, T['faint'])}<span style="font-size: 12px; color: {T['faint']};">Filter sessions</span>
        </div>
      </div>"""

def group_row(label, count):
    return (f'<div style="display: flex; align-items: center; gap: 6px; padding: 4px 6px; color: {T["muted"]};">'
            f'{ic("chev", 11)}<span class="grpname">{label}</span>'
            f'<span class="mono" style="margin-left: auto; font-size: 9.5px; color: {T["off"]};'
            f' background: {T["raised"]}; border-radius: 4px; padding: 1px 6px;">{count}</span></div>')

def host_row(name, who, state="saved", active=False, mark=None, edge=None, kind=None, via=None, depth=0,
             chevron=None, tag=None):
    """Two lines: dot, kind icon (rare, 'other' draws none) and name on the
    first, with room left for the reached tick or SPARED; the address, or
    the bastion a rider rides, on its own line below, always drawn now
    rather than only when the first line had nothing else in the trailing
    slot. Matches `SessionsSidebar.tsx` since 2026-08-30: a name and an
    address used to shrink each other to an ellipsis on one line, worse once
    a kind icon or a state-tinted `JumpMark` also asked for room on it.

    `chevron` (ADR-0060, `HostsSection.tsx` only): a bastion carrying at
    least one other host draws a disclosure triangle, "expanded" (rotated,
    children drawn below) or "collapsed" (children hidden, `who` carries
    the count instead). `None`, the default, draws nothing and costs no
    space, so every other row in every other list this same function draws
    is unaffected. `tag` (ADR-0060: `group` moves off the section axis onto
    a pill per row): the free-text group string, drawn as a small pill when
    present, absent exactly as `group` itself can be.
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
    subtitle = f'via {via}' if via else who
    name_color = T['ink'] if active else T['ink2']
    weight = 'font-weight: 600;' if active else ''
    indent = ''.join(
        f'<span style="width: 12px; align-self: stretch; flex: none; display: flex; justify-content: center;">'
        f'<span style="width: 1px; background: {T["off"]}; opacity: 0.35;"></span></span>'
        for _ in range(depth)
    )
    disclosure = ''
    if chevron is not None:
        rotate = ' transform: rotate(90deg);' if chevron == 'expanded' else ''
        disclosure = (f'<span style="width: 14px; flex: none; display: flex; align-items: center; justify-content: center;">'
                       f'{ic("chev", 10, T["faint"], extra=rotate)}</span>')
    pill = ''
    if tag is not None:
        pill = (f'<span style="font-size: 9px; color: {T["muted"]}; background: {T["raised"]}; border-radius: 4px;'
                f' padding: 1px 6px; flex: none; margin-left: auto;">{tag}</span>')
    return (f'<div class="row" style="{bg} height: auto; align-items: center; padding: 6px 8px;">'
            f'{indent}{disclosure}'
            f'<span class="dot" style="{dots[state]} align-self: center; flex: none;"></span>'
            f'<div style="display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1;">'
            f'<div style="display: flex; align-items: center; gap: 8px;">'
            f'{kind_ic(kind, T["faint"])}'
            f'<span style="font-size: 12.5px; color: {name_color}; {weight} min-width: 0; overflow: hidden;'
            f' text-overflow: ellipsis; white-space: nowrap;">{name}</span>'
            f'{tail}{pill}</div>'
            f'<span class="mono" style="font-size: 10.5px; color: {T["off"]}; overflow: hidden;'
            f' text-overflow: ellipsis; white-space: nowrap;">{subtitle}</span>'
            f'</div></div>')

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

PROD_KIND = {"db-prod": "target"}

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
        rows.append(host_row("stg-db", "postgres@10.9.0.6", states.get("stg-db", "saved"), active == "stg-db", kind="target"))
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
    body = f"""      <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 40px; padding: 40px;">
        <div style="display: flex; align-items: center; gap: 14px;">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
            <circle cx="9.5" cy="12" r="7" stroke="{T['bstart']}" stroke-width="1.2"></circle>
            <circle cx="14.5" cy="12" r="7" stroke="{T['bend']}" stroke-width="1.2"></circle>
            <path d="M12 6.5v11M12 10l3-2.5M12 14l3 2.5M12 12l-2.6-2.2" stroke="{T['brune']}" stroke-width="1.2" stroke-linecap="round"></path>
          </svg>
          <span style="font-size: 27px; font-weight: 800; color: {T['ink']}; letter-spacing: -0.01em;">Runic SSH</span>
        </div>
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
    write("Empty.dc.html", page(body, sessions_sidebar(), home_rail(workspace="sessions"), st))

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
                               home_rail(workspace="sessions", badge="3"), st))

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
    write("Groups.dc.html", page(grid, None, home_rail(workspace="sessions", badge="6"), st, shape="grid"))

# ---------- 4. sidebar closed
def build_collapsed():
    # The Sessions icon stays lit here: closing the sidebar toggles
    # `sidebarOpen`, not `workspace` (ActivityRail.tsx), so it is wrong to
    # draw it dim the way the pre-#234 rail() call used to.
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
                                    None, home_rail(workspace="sessions", badge="2"), st))

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
                      host_row("db-prod", "postgres@10.4.1.31", "ok", False, "spared", kind="target"),
                      host_row("cache-01", "redis@10.4.1.44", "saved")])
    sb = sidebar_shell(hdr, rows)
    st = status_warn(stat_session("deploy@10.4.1.20") + "\n" + sep() + "\n" + stat_text("74 x 42") + "\n" + stat_text("14 ms"),
                     f'    <span style="font-size: 10.5px; font-weight: 700; letter-spacing: 0.1em; color: {T["warnsoft"]}; background: {T["warn"]}; border-radius: 4px; padding: 4px 10px;">TYPING INTO 2 HOSTS</span>\n'
                     f'    <span style="font-size: 11px; color: {T["warn"]}; border: 1px solid {T["warn"]}; border-radius: 4px; padding: 3px 10px;">Turn off</span>')
    write("Broadcast.dc.html", page(grid, sb, home_rail(workspace="sessions", badge="4", armed=True), st, shape="columns"))

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
    write("HostKey.dc.html", page(grid, sessions_sidebar(active="web-01", states={"web-01": "ok"}), home_rail(workspace="sessions", badge="2"), st))

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
    # ADR-0044: SFTP has its own rail slot now, reached directly rather than
    # through Sessions. This screen is one open tab focused inside that
    # workspace; SftpWorkspace.dc.html draws the sidebar's other state, the
    # host picker shown before any tab is focused.
    write("Sftp.dc.html", page(f'      <div style="flex: 1; min-height: 0; display: flex;">{g}</div>',
                               sidebar_shell(hdr, tree), home_rail(workspace="sftp", sftp_badge="1"), st))

# ---------- 7b. sftp workspace, before any tab is focused
def sftp_row(name, who, state="saved", active=False, open_tab=False):
    """A plainer `host_row`: no kind icon, no jump-chain mark, no bastion
    `via` line, none of which mean anything to a host picked to browse
    rather than to type into. A folder glyph at the trailing edge instead,
    lit when that session already has a tab open, so the list doubles as
    the answer to "which of these am I already browsing" without a second
    icon column."""
    dots = {"ok": f'background: {T["ok"]};', "saved": f'border: 1.5px solid {T["off"]}; box-sizing: border-box;',
            "warn": f'border: 1.5px solid {T["warn"]}; box-sizing: border-box;'}
    bg = f'background: {T["raised"]}; border-radius: 6px;' if active else ''
    folder = ic("sftp", 13, T["accent"] if open_tab else T["off"]) if open_tab else ''
    return (f'<div class="row" style="{bg} height: auto; align-items: center; padding: 6px 8px;">'
            f'<span class="dot" style="{dots[state]} align-self: center; flex: none;"></span>'
            f'<div style="display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1;">'
            f'<span style="font-size: 12.5px; color: {T["ink"] if active else T["ink2"]}; {"font-weight: 600;" if active else ""}'
            f' min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{name}</span>'
            f'<span class="mono" style="font-size: 10.5px; color: {T["off"]}; overflow: hidden;'
            f' text-overflow: ellipsis; white-space: nowrap;">{who}</span></div>'
            f'{folder}</div>')

def sftp_workspace_header():
    return f"""      <div style="padding: 12px; display: flex; flex-direction: column; gap: 10px; border-bottom: 1px solid {T['line']};">
        <span style="font-size: 10px; font-weight: 700; letter-spacing: 0.12em; color: {T['faint']};">SFTP</span>
        <div style="height: 32px; background: {T['input']}; border: 1px solid {T['line']}; border-radius: 6px; display: flex; align-items: center; gap: 8px; padding: 0 10px;">
          {ic('search', 14, T['faint'])}<span style="font-size: 12px; color: {T['faint']};">Filter sessions</span>
        </div>
      </div>"""

def build_sftp_workspace():
    """ADR-0044: the SFTP workspace's own host picker, the sidebar's other
    state, shown before any tab is focused (`Sftp.dc.html` draws the state
    after). No "+"/new-group/collapse chrome from `sessions_header`: there
    is nothing to create or manage here, only a saved host to pick."""
    rows = [group_row("PRODUCTION", 3)]
    for n, w in PROD:
        rows.append(sftp_row(n, w, "ok" if n == "web-01" else "saved", active=False, open_tab=(n == "web-01")))
    sidebar = sidebar_shell(sftp_workspace_header(), "\n".join(rows))
    body = f"""      <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; padding: 40px;">
        {ic('sftp', 40, T['off'])}
        <div style="display: flex; flex-direction: column; align-items: center; gap: 6px;">
          <span style="font-size: 13.5px; color: {T['ink2']}; font-weight: 600;">Pick a host to browse</span>
          <span style="font-size: 12px; color: {T['faint']};">Connects it first, if it isn't already.</span>
        </div>
      </div>"""
    st = status(stat_text("1 host browsing", T['faint'], mono=False), stat_text("2 hosts saved", T['faint']))
    write("SftpWorkspace.dc.html", page(body, sidebar, home_rail(workspace="sftp", sftp_badge="1"), st))

# ---------- 7c. sftp fan-out: one source, a grid of destinations
def build_sftp_fanout():
    """ADR-0045: source and destination are each a plain `Endpoint`, drawn
    from the same sidebar by dragging rather than clicking. One pane for
    the source, always; a grid for destinations, up to four, that grows as
    a host is dropped on empty space and replaces outright when dropped on
    an occupied slot."""
    def crow(name, dim=False):
        i = ic("sftp", 12, T['faint']) if dim else f'<svg class="ic" viewBox="0 0 24 24" style="width: 12px; height: 12px; color: {T["faint"]};"><path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v4h4"></path></svg>'
        return (f'<div style="display: flex; align-items: center; gap: 7px; padding: 3px 8px;">{i}'
                f'<span class="mono" style="font-size: 11px; color: {T["ink2"]};">{name}</span></div>')

    def pane_header(label, who):
        return (f'<div style="height: 24px; flex: none; display: flex; align-items: center; gap: 8px; padding: 0 10px;'
                f' background: {T["chrome"]}; border-bottom: 1px solid {T["line"]};">'
                f'<span style="font-size: 9px; font-weight: 700; letter-spacing: 0.1em; color: {T["faint"]};">{label}</span>'
                f'<span class="mono" style="font-size: 10.5px; color: {T["muted"]};">{who}</span></div>')

    def filled_slot(who, rows):
        body = "\n".join(crow(*r) for r in rows)
        return (f'<div style="display: flex; flex-direction: column; border: 1px solid {T["line"]}; border-radius: 6px; overflow: hidden;">'
                f'{pane_header("DESTINATION", who)}<div style="flex: 1; padding: 4px 0; overflow: hidden;">{body}</div></div>')

    empty_slot = (f'<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;'
                  f' border: 1.5px dashed {T["line2"]}; border-radius: 6px; padding: 20px;">'
                  f'{ic("sftp", 22, T["off"])}<span style="font-size: 11px; color: {T["faint"]}; text-align: center;">Drop a host here</span></div>')

    source = (f'<div style="display: flex; flex-direction: column; border: 1px solid {T["line"]}; border-radius: 6px; overflow: hidden; height: 100%;">'
              f'{pane_header("SOURCE", "deploy@10.4.1.20")}'
              f'<div style="flex: 1; padding: 4px 0;">{crow("index.html")}{crow("assets", True)}{crow("app.2f9c.js")}</div></div>')

    destinations = (f'<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; flex: 1;">'
                     f'{filled_slot("deploy@10.4.1.21", [("index.html",), ("assets", True)])}'
                     f'{filled_slot("deploy@10.9.0.5", [("releases", True), ("shared", True)])}'
                     f'{empty_slot}</div>')

    body = f"""      <div style="flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 10px; padding: 12px;">
        <div style="height: 140px; flex: none;">{source}</div>
        <div style="display: flex; align-items: center; gap: 8px; color: {T['faint']};">
          {ic('chev', 12, extra=' transform: rotate(90deg);')}
          <span style="font-size: 10px; font-weight: 700; letter-spacing: 0.1em;">FANS OUT TO</span>
        </div>
        {destinations}
      </div>"""

    # The row mid-drag: a dashed outline in the sidebar list rather than the
    # ordinary filled row, the same idea `dragging`/`dropOver` already give
    # Sessions' own rows, drawn once here rather than as a second component.
    rows = [group_row("PRODUCTION", 3),
            sftp_row("web-01", "deploy@10.4.1.20", "ok", active=False, open_tab=True),
            (f'<div style="display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: 1.5px dashed {T["accent"]};'
             f' border-radius: 6px; opacity: 0.6;"><span class="dot" style="background: {T["ok"]};"></span>'
             f'<span class="mono" style="font-size: 12.5px; color: {T["ink2"]};">db-prod &#8594; dragging to a slot</span></div>')]
    sidebar = sidebar_shell(sftp_workspace_header(), "\n".join(rows))

    st = status(stat_text("3 destinations, 1 source", T['faint'], mono=False), stat_text("copying index.html", T['muted']))
    write("SftpFanout.dc.html", page(body, sidebar, home_rail(workspace="sftp", sftp_badge="3"), st))

# ---------- 7d. exploratory: one toolbar, shared sidebar, a nav bar per pane
# Drawn 2026-08-31 against the maintainer's own complaint that this session
# introduced three different homes for a workspace's own controls: the split
# control on the SFTP destination column's header (this session's own
# mistake, the same one ADR-0021 already ruled out for Sessions' shape),
# `HomeNav` inside Home's body, and `ShapeControl` in the Titlebar. Proposes
# a fourth surface, a toolbar row of its own between the Titlebar and the
# workspace, so a workspace's global controls (split, and whatever Sessions'
# own eventual sync affordance turns out to be) all live in one place rather
# than wherever the control happened to get written. Exploratory: nothing
# here is accepted yet, `SftpFanout.dc.html` above is still the shipped
# shape, and this artboard is retired once the maintainer picks a direction
# (the same way `HostsPhase.dc.html` was).
#
# Two more pieces the maintainer asked for while reviewing this, both drawn
# here rather than argued about in prose:
#   - the SFTP sidebar becomes the same `sessions_sidebar()` Sessions uses
#     (kind icon, jump/target mark, chain indent), not the plainer
#     `sftp_workspace_header()`/`sftp_row()` ADR-0044 drew for a sidebar
#     that was only ever picking a host to browse, never one to type into.
#   - each pane gains an actual navigation bar (back, up, a breadcrumb,
#     refresh), since today's pane only shows the current path as inert text
#     and expects a click on a row or the `..` entry to move at all.

def plain_titlebar():
    """The Titlebar with nothing workspace-specific left in it: the mark,
    the app name, the window buttons. `top_strip()` still draws
    `ShapeControl` inline for the shipped tree; this is what is left of it
    once that control moves into `toolbar_row()`, shared by every
    exploratory proposal so the mark and window buttons are drawn once."""
    return f"""  <div style="height: 36px; flex: none; display: flex; align-items: stretch; background: {T['chrome']}; border-bottom: 1px solid {T['line']};">
    <div style="width: 48px; flex: none; display: flex; align-items: center; justify-content: center; border-right: 1px solid {T['line']};">{MARK}</div>
    <div style="flex: 1; min-width: 0; display: flex; align-items: center; padding-left: 14px;">
      <span style="font-size: 11.5px; font-weight: 700; letter-spacing: 0.13em; color: {T['faint']};">RUNIC SSH</span>
    </div>
    <div style="flex: none; display: flex; align-items: stretch; border-left: 1px solid {T['line']};">
      <div class="win"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.1"><path d="M1.5 5h7"></path></svg></div>
      <div class="win"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.1"><rect x="1.5" y="1.5" width="7" height="7"></rect></svg></div>
      <div class="win"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.1"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7"></path></svg></div>
    </div>
  </div>"""

def split_rows_glyph(n, size=16):
    """`n` horizontal bars in a rounded rectangle: the SFTP split control's
    own glyph (`SftpSplitControl.tsx`'s `RowsGlyph`), redrawn here rather
    than invented, since the shape it stands for is already shipped."""
    bars = "".join(
        f'<path d="M0.75 {0.75 + (10.5 * i) / n:.2f}h14.5"></path>' for i in range(1, n)
    )
    return (f'<svg viewBox="0 0 16 12" style="width: {size}px; height: {round(size * 0.75)}px;" '
            f'fill="none" stroke="currentColor" stroke-width="1.2">'
            f'<rect x="0.75" y="0.75" width="14.5" height="10.5" rx="1.5"></rect>{bars}</svg>')

def split_control(active=1, max_n=4):
    """`SftpSplitControl.tsx`, in the toolbar rather than beside one
    column's own header: the same four buttons, the same highlighted
    state, moved to answer ADR-0021's objection instead of repeating it."""
    out = []
    for n in range(1, max_n + 1):
        on = n == active
        bg = f'background: {T["raised"]};' if on else ''
        color = T['accent'] if on else T['faint']
        out.append(f'<div style="width: 26px; height: 22px; border-radius: 4px; {bg}'
                   f' display: flex; align-items: center; justify-content: center; color: {color};">'
                   f'{split_rows_glyph(n)}</div>')
    return '<div style="flex: none; display: flex; align-items: center; gap: 2px;">' + "".join(out) + '</div>'

def toolbar_row(right_html="", left_html=""):
    """The row this artboard proposes between the Titlebar and the
    workspace: full width, always present, `left_html` for whatever a
    workspace wants near the sidebar's edge (a global sync toggle was the
    maintainer's own example for Sessions), `right_html` for the control
    that used to be homeless (the shape/split control, always at the
    trailing edge, matching where `ShapeControl` sits in the Titlebar
    today)."""
    return f"""  <div style="height: 34px; flex: none; display: flex; align-items: center; gap: 8px; background: {T['panel']}; border-bottom: 1px solid {T['line']}; padding: 0 10px;">
    {left_html}
    <div style="flex: 1;"></div>
    {right_html}
  </div>"""

def nav_bar(segments, can_back=False, new_folder=False, selected_count=None):
    """Back, up, a breadcrumb, refresh: what `SftpPane.tsx` does not have
    today, drawing its path as inert text and asking for a click on a row
    or the `..` entry to move at all. `segments` is the path split on `/`;
    the last one is the current directory and reads brighter than the rest,
    the same weight rule a breadcrumb usually gives its own tail.

    `new_folder` is exploratory (`build_sftp_file_ops`): a visible entry
    point for creating a directory, next to refresh rather than buried in a
    context menu on empty space, the same "a context menu is the
    convention and a visible button is the thing somebody finds without
    being told the convention" reasoning `SessionMenu.tsx`'s own doc
    comment already gives for pairing a menu with a button. Off by default
    so every artboard already drawing a plain `nav_bar()` is unaffected.

    `selected_count` (ADR-0050, #292): rename and delete drawn next to new
    folder rather than in a separate bar of their own, confirmed directly
    against `build_sftp_selection`'s own first cut, which put
    them in `selection_bar()` at the bottom instead. `None` (every other
    caller) omits both, unchanged. Given a count, both stay in the
    bar rather than appearing and disappearing as the selection changes
    (`new_folder`/`refresh` never do either): rename lights only at
    exactly one, delete at one or more, dim otherwise rather than gone,
    the same "always there, not always able" `canGoBack`/`canGoUp` already
    draw for the arrows beside them."""
    back_color = T['muted'] if can_back else T['off']
    crumbs = [
        f'<span class="mono" style="font-size: 11px; color: {T["ink2"] if i == len(segments) - 1 else T["faint"]};">{seg}</span>'
        for i, seg in enumerate(segments)
    ]
    crumb_html = f'<span style="color: {T["off"]}; font-size: 10px;">/</span>'.join(crumbs)
    newfolder_html = (
        f'<span style="color: {T["muted"]}; display: flex;">{ic("newfolder", 13)}</span>' if new_folder else ''
    )
    edit_html = ''
    if selected_count is not None:
        rename_on = selected_count == 1
        delete_on = selected_count >= 1
        rename_bg = f'background: {T["raised"]};' if rename_on else ''
        edit_html = (
            f'<span style="display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 4px; {rename_bg} color: {T["ink2"] if rename_on else T["off"]};">{ic("pencil", 12)}</span>'
            f'<span style="display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; color: {T["dangertext"] if delete_on else T["off"]};">{ic("trash", 12)}</span>'
        )
    return (f'<div style="height: 24px; flex: none; display: flex; align-items: center; gap: 7px; padding: 0 8px;'
            f' background: {T["chrome"]}; border-bottom: 1px solid {T["line"]};">'
            f'<span style="color: {back_color}; display: flex;">{ic("chev", 13, extra=" transform: rotate(180deg);")}</span>'
            f'<span style="color: {T["muted"]}; display: flex;">{ic("chev", 13, extra=" transform: rotate(-90deg);")}</span>'
            f'<div style="flex: 1; min-width: 0; display: flex; align-items: center; gap: 3px; overflow: hidden; white-space: nowrap;">{crumb_html}</div>'
            f'{newfolder_html}'
            f'<span style="color: {T["muted"]}; display: flex;">{ic("refresh", 12)}</span>'
            f'{edit_html}</div>')

def build_sftp_proposal():
    def crow(name, dim=False):
        i = ic("sftp", 12, T['faint']) if dim else f'<svg class="ic" viewBox="0 0 24 24" style="width: 12px; height: 12px; color: {T["faint"]};"><path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v4h4"></path></svg>'
        return (f'<div style="display: flex; align-items: center; gap: 7px; padding: 3px 8px;">{i}'
                f'<span class="mono" style="font-size: 11px; color: {T["ink2"]};">{name}</span></div>')

    def pane_header(label, who, closable=True):
        close = ic('close', 11, T['faint']) if closable else ''
        return (f'<div style="height: 24px; flex: none; display: flex; align-items: center; gap: 8px; padding: 0 10px;'
                f' background: {T["chrome"]}; border-bottom: 1px solid {T["line"]};">'
                f'<span style="font-size: 9px; font-weight: 700; letter-spacing: 0.1em; color: {T["faint"]};">{label}</span>'
                f'<span class="mono" style="font-size: 10.5px; color: {T["muted"]};">{who}</span>'
                f'<div style="flex: 1;"></div>{close}</div>')

    def pane(label, who, segments, can_back, rows, border=True):
        b = f'border: 1px solid {T["line"]}; border-radius: 6px;' if border else f'border: 1.5px dashed {T["line2"]}; border-radius: 6px;'
        if rows is None:
            return (f'<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; {b}">'
                    f'{ic("sftp", 22, T["off"])}<span style="font-size: 11px; color: {T["faint"]};">Drop a host here</span></div>')
        body = "".join(crow(*r) for r in rows)
        return (f'<div style="display: flex; flex-direction: column; overflow: hidden; {b}">'
                f'{pane_header(label, who)}{nav_bar(segments, can_back)}'
                f'<div style="flex: 1; padding: 4px 0; overflow: hidden;">{body}</div></div>')

    source = pane("SOURCE", "deploy@10.4.1.20", ["/", "var", "www"], True,
                   [("index.html",), ("assets", True), ("app.2f9c.js",)])
    d1 = pane("DESTINATION", "deploy@10.4.1.21", ["/", "var", "www"], False,
              [("index.html",), ("assets", True)])
    d2 = pane("DESTINATION", "deploy@10.9.0.5", ["/", "srv", "releases"], True,
              [("current", True), ("2026-08-30", True)])
    d3 = pane("", "", [], False, None, border=False)

    # No "FANS OUT TO" label (dropped per the maintainer's own read: left is
    # source and right is destination in essentially every file manager,
    # so a label naming that convention says nothing a reader doesn't
    # already assume from the two columns themselves).
    body = f"""      <div style="flex: 1; min-height: 0; display: flex; gap: 10px; padding: 12px;">
        <div style="width: 50%;">{source}</div>
        <div style="width: 50%; display: grid; grid-template-rows: repeat(3, minmax(0, 1fr)); gap: 8px;">{d1}{d2}{d3}</div>
      </div>"""

    sidebar = sessions_sidebar(active=None, states={"web-01": "ok"})
    st = status(stat_text("3 destinations, 1 source", T['faint'], mono=False), stat_text("copying index.html", T['muted']))

    page_html = f"""
<div style="width: 1440px; height: 900px; display: flex; flex-direction: column; background: {T['base']}; color: {T['ink']}; overflow: hidden; font-size: 13px;">
{plain_titlebar()}
{toolbar_row(right_html=split_control(active=3))}
  <div style="flex: 1; min-height: 0; display: flex; align-items: stretch;">
{home_rail(workspace="sftp", sftp_badge="3")}
{sidebar}
    <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; background: {T['base']};">
{body}
    </div>
  </div>
{st}
</div>
"""
    write("SftpProposal.dc.html", HEAD + page_html + FOOT)

def sync_icon(on):
    """Confirmed directly: the same glyph `broadcast_button()` uses, at row
    scale, on/off told apart by colour alone the same way that button
    already is, replacing what used to be a pill-and-knob switch
    (`SyncToggle.tsx`'s own shape). One icon for the concept everywhere it
    appears, toolbar and per-group switch alike, rather than two shapes
    that both mean "is broadcast reaching this." Stays at the trailing
    edge of every group's own strip, solo header included: this is still
    the answer to "does this one rectangle, specifically, receive"
    (ADR-0021's own reasoning for keeping it per-group). `broadcast_button()`
    is the maintainer's own confirmed addition on top of this, not instead
    of it: a toolbar shortcut that starts or stops everyone at once, while
    this icon keeps deciding one rectangle at a time. `SyncToggle.tsx`
    itself would need the matching change if this direction is accepted."""
    color = T['warn'] if on else T['faint']
    return (f'<span style="display: flex; align-items: center; justify-content: center; width: 16px; height: 16px; color: {color};">'
            f'{ic("broadcast", 13)}</span>')

def broadcast_button(armed, count=None):
    """The toolbar's own arm/disarm-everyone shortcut, confirmed directly
    against this session's earlier read of ADR-0021's history: it sits in
    the toolbar, before the split/shape control, rather than repeating the
    top-strip global switch that document tried and reversed. What makes
    this different from that reversed attempt is that it does not replace
    `sync_icon()`: pressing this arms or disarms every open, non-empty
    group at once, exactly what `toggleSync` already does from the command
    palette, just made visible; pressing one group's own switch afterward
    still opts just that rectangle out. Two controls, two questions, the
    same distinction ADR-0021 already drew between the shape control and
    the sync switch, not a return to conflating them."""
    color = T['warn'] if armed else T['faint']
    bg = f'background: {T["warnsoft"]};' if armed else ''
    badge = ''
    if armed and count is not None:
        badge = (f'<span class="mono" style="position: absolute; right: -3px; bottom: -3px; min-width: 13px; height: 13px; border-radius: 7px;'
                 f' background: {T["warn"]}; color: {T["base"]}; font-size: 8.5px; font-weight: 700; display: flex; align-items: center; justify-content: center; padding: 0 3px;">{count}</span>')
    return (f'<div style="position: relative; width: 28px; height: 24px; border-radius: 4px; {bg}'
            f' display: flex; align-items: center; justify-content: center; color: {color};">{ic("broadcast", 15)}{badge}</div>')

def select_all_button(count):
    """SFTP's own toolbar shortcut, deliberately not `broadcast_button()`
    with a different label: Sessions' button arms a *mode* (every keystroke
    goes everywhere until disarmed), and SFTP has no equivalent mode to
    arm, since sending a file is already a one-shot action per file, not a
    stream. This is a plain "select every occupied destination" toggle,
    styled like the neutral `split_control()` icons rather than warn-tinted
    like an armed broadcast, so it never claims a persistent state that
    does not exist here."""
    badge = ''
    if count is not None:
        badge = (f'<span class="mono" style="position: absolute; right: -3px; bottom: -3px; min-width: 13px; height: 13px; border-radius: 7px;'
                 f' background: {T["raised"]}; color: {T["muted"]}; font-size: 8.5px; font-weight: 700; display: flex; align-items: center; justify-content: center; padding: 0 3px;">{count}</span>')
    return (f'<div style="position: relative; width: 28px; height: 24px; border-radius: 4px;'
            f' display: flex; align-items: center; justify-content: center; color: {T["faint"]};">{ic("broadcast", 15)}{badge}</div>')

def solo_tab_header(name, who, sync="off"):
    """Option 1, confirmed directly over `SftpProposal.dc.html`'s own
    review: a group holding exactly one tab collapses `strip()`/`tab()`'s
    packed-left layout into a single full-width identity bar, closer to
    `SftpPane.tsx`'s own header than to a tab strip with one tab in it.
    Two or more tabs still get today's `strip()` unchanged.

    `sync_icon()` sits here exactly where `SyncToggle` sits on a packed
    strip: at the trailing edge, before the close action, since nothing
    about arming broadcast is a property of how many tabs a group has."""
    return (f'<div style="height: 28px; flex: none; display: flex; align-items: center; gap: 8px; padding: 0 12px;'
            f' background: {T["chrome"]}; border-bottom: 1px solid {T["line"]};">'
            f'<span class="dot" style="background: {T["ok"]};"></span>'
            f'<span class="mono" style="font-size: 11.5px; color: {T["ink"]}; font-weight: 600;">{name}</span>'
            f'<span class="mono" style="font-size: 10.5px; color: {T["faint"]};">{who}</span>'
            f'<div style="flex: 1;"></div>'
            f'{sync_icon(sync == "on")}'
            f'<span style="display: flex; align-items: center; justify-content: center; width: 16px; height: 16px; color: {T["faint"]};">{ic("close", 11)}</span>'
            f'</div>')

def empty_group_slot():
    """A group with nothing in it, drawn as SFTP's own empty destination
    slot already is: a dashed rectangle inviting the same drag, since
    dropping a host into an empty rectangle is now one gesture shared by
    both workspaces rather than two."""
    return (f'<div style="background: {T["terminal"]}; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;'
            f' border: 1.5px dashed {T["line2"]}; border-radius: 6px; min-width: 0; min-height: 0;">'
            f'{ic("ssh", 22, T["off"])}<span style="font-size: 11px; color: {T["faint"]};">Drop a host here</span></div>')

def transfer_row(name, destination, transferred, total, active=True):
    """One row of `TransferState` (`browser.ts`), drawn with only the
    fields that type actually carries: no invented speed column, unlike
    the pre-fanout `build_sftp()` artboard's "1,4 MB/s", which named a
    number nothing in `TransferState` tracks. Rule 6 of ADR-0020: the
    layout may reserve room to think and may not show interface that lies.
    `destination` is new against that older artboard for a real reason,
    not a cosmetic one: with one fixed destination there was nothing to
    name; ADR-0045 made the field exist because a fan-out needs to say
    which of several a given row is bound for."""
    pct = round(100 * transferred / total) if total else 0
    size = f'{round(transferred / 1000)} / {round(total / 1000)} kB' if total else f'{round(transferred / 1000)} kB'
    action = (
        f'<span style="display: flex; color: {T["faint"]};">{ic("close", 10)}</span>' if active
        else f'<svg viewBox="0 0 24 24" style="width: 12px; height: 12px; color: {T["ok"]};" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>'
    )
    return f"""<div style="display: flex; align-items: center; gap: 10px; height: 26px;">
      <svg viewBox="0 0 24 24" style="width: 13px; height: 13px; color: {T['accent']}; flex: none;" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h13M12 7l5 5-5 5"></path></svg>
      <span class="mono" style="font-size: 11.5px; color: {T['ink']}; width: 130px; flex: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{name}</span>
      <span class="mono" style="font-size: 10.5px; color: {T['muted']}; width: 130px; flex: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{destination}</span>
      <div style="flex: 1; height: 4px; background: {T['raised']}; border-radius: 2px; overflow: hidden;"><div style="width: {pct}%; height: 100%; background: {T['accent'] if active else T['ok']};"></div></div>
      <span class="mono" style="font-size: 10.5px; color: {T['faint']}; width: 90px; text-align: right; flex: none;">{size}</span>
      <span style="width: 14px; flex: none; display: flex; align-items: center; justify-content: center;">{action}</span>
    </div>"""

def folder_transfer_row(name, destination, done, total, failed=0, active=True):
    """A recursive folder copy's own row (ADR-0049): count-based progress
    ("N of M files") rather than `transfer_row()`'s bytes, since a folder's
    total size is not known up front the way one file's is, and how many of
    its files have finished is the number this application actually has.
    `failed` prints only once the copy has stopped (`active=False`) and is
    nonzero: a running copy does not yet know its own final failure count,
    and zero failures says nothing worth a reader's attention."""
    pct = round(100 * done / total) if total else 0
    progress = f'{done} of {total} files'
    if not active and failed > 0:
        progress += f', {failed} failed'
    action = (
        f'<span style="display: flex; color: {T["faint"]};">{ic("close", 10)}</span>' if active
        else (
            f'<svg viewBox="0 0 24 24" style="width: 12px; height: 12px; color: {T["warn"]};" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 16.5h.01"></path><path d="M10.3 3.9 2.7 17a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path></svg>'
            if failed > 0 else
            f'<svg viewBox="0 0 24 24" style="width: 12px; height: 12px; color: {T["ok"]};" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>'
        )
    )
    bar_color = T['accent'] if active else (T['warn'] if failed > 0 else T['ok'])
    return f"""<div style="display: flex; align-items: center; gap: 10px; height: 26px;">
      <svg viewBox="0 0 24 24" style="width: 13px; height: 13px; color: {T['accent']}; flex: none;" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 6.5h6l1.6 2H20v9.5H4z"></path></svg>
      <span class="mono" style="font-size: 11.5px; color: {T['ink']}; width: 130px; flex: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{name}</span>
      <span class="mono" style="font-size: 10.5px; color: {T['muted']}; width: 130px; flex: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{destination}</span>
      <div style="flex: 1; height: 4px; background: {T['raised']}; border-radius: 2px; overflow: hidden;"><div style="width: {pct}%; height: 100%; background: {bar_color};"></div></div>
      <span class="mono" style="font-size: 10.5px; color: {T['faint']}; width: 120px; text-align: right; flex: none;">{progress}</span>
      <span style="width: 14px; flex: none; display: flex; align-items: center; justify-content: center;">{action}</span>
    </div>"""

def transfers_bar(rows_html, count):
    """Where a fan-out's own progress lives: full width, below both
    columns, one shared list rather than one per pane. `TransferState`
    already names its own destination per row (ADR-0045), so a single list
    loses nothing a per-pane one would have kept, and it is the one place
    that can show "4 rows, 4 destinations, 1 file" as a single glance
    instead of four separate footers agreeing with each other by hand.

    Missing until now: `fanout.transfers`, `cancelTransfer` and
    `dismissTransfer` are fully wired in `use-fanout.ts` today (the reducer
    is tested), and nothing in `App.tsx`'s render reads any of them. A
    fan-out is invisible while it runs in the shipped tree; this is that
    gap, not only a styling choice."""
    return f"""      <div style="flex: none; border-top: 1px solid {T['line']}; background: {T['panel']}; padding: 8px 14px;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
          <span style="font-size: 10px; font-weight: 700; letter-spacing: 0.1em; color: {T['faint']};">TRANSFERS</span>
          <span class="mono" style="font-size: 9.5px; color: {T['off']}; background: {T['raised']}; border-radius: 4px; padding: 1px 6px;">{count}</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 2px;">{rows_html}</div>
      </div>"""

def build_sftp_proposal_broadcast():
    """Exploratory (2026-08-31): whether "broadcast" has a shape in SFTP,
    asked directly after both proposals landed. It does, but not the
    Sessions one. There is no keystroke stream to arm, so nothing in the
    toolbar claims a persistent mode (`select_all_button()`, deliberately
    not warn-tinted): each destination gets its own `sync_icon()`, off by
    default meaning "occupied but not part of the next send," and
    `sendToDestinations` would read it the same way `inputTargets` already
    reads `muted` for Sessions. The source pane draws no icon at all: it
    only ever sends, so the question this icon answers does not apply to
    it.

    Extended the same day with `transfers_bar()`, asked directly: SFTP had
    no drawn answer for where an in-flight transfer shows. Toggling
    `deploy@10.9.0.5` off above is why only one row appears below;
    `sendToDestinations` would only ever start a transfer for a
    destination this same toggle says is receiving.

    Extended again the same day: `sendToDestinations` today fires from a
    hover-only icon on one row at a time (`SftpPane.tsx`'s `Row`), which is
    exactly the two things asked for here that a static screen cannot show
    at all (nothing to hover) and does not let you start more than one file
    together. `checkbox()` gives the source pane a selection a screenshot
    can actually show; `send_bar()` is the explicit place that selection
    turns into a send, which the hover icon never was. It would replace
    that icon, not sit beside it: one way to start a send, not two."""
    def crow(name, dim=False):
        i = ic("sftp", 12, T['faint']) if dim else f'<svg class="ic" viewBox="0 0 24 24" style="width: 12px; height: 12px; color: {T["faint"]};"><path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v4h4"></path></svg>'
        return (f'<div style="display: flex; align-items: center; gap: 7px; padding: 3px 8px;">{i}'
                f'<span class="mono" style="font-size: 11px; color: {T["ink2"]};">{name}</span></div>')

    def checkbox(checked):
        if checked:
            return (f'<span style="width: 13px; height: 13px; border-radius: 3px; background: {T["accent"]}; flex: none;'
                     f' display: flex; align-items: center; justify-content: center;">'
                     f'<svg viewBox="0 0 24 24" style="width: 9px; height: 9px; color: {T["base"]};" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg></span>')
        return f'<span style="width: 13px; height: 13px; border-radius: 3px; border: 1.5px solid {T["off"]}; flex: none;"></span>'

    def source_row(name, checked=None):
        box = checkbox(checked) if checked is not None else '<span style="width: 13px; flex: none;"></span>'
        dim = checked is None
        i = ic("sftp", 12, T['faint']) if dim else f'<svg class="ic" viewBox="0 0 24 24" style="width: 12px; height: 12px; color: {T["faint"]};"><path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v4h4"></path></svg>'
        bg = f'background: {T["accentsoft"]};' if checked else ''
        return (f'<div style="display: flex; align-items: center; gap: 8px; padding: 3px 8px; {bg}">{box}{i}'
                f'<span class="mono" style="font-size: 11px; color: {T["ink2"]};">{name}</span></div>')

    def send_bar(count):
        return (f'<div style="flex: none; display: flex; align-items: center; gap: 12px; padding: 7px 10px;'
                f' border-top: 1px solid {T["line"]}; background: {T["panel"]};">'
                f'<span class="mono" style="font-size: 11px; color: {T["muted"]};">{count} selected</span>'
                f'<div style="flex: 1;"></div>'
                f'<span style="font-size: 11.5px; color: {T["faint"]};">Clear</span>'
                f'<span style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: {T["base"]};'
                f' background: {T["accent"]}; border-radius: 6px; padding: 6px 14px;">Send'
                f'<svg viewBox="0 0 24 24" style="width: 12px; height: 12px;" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></span></div>')

    def pane_header(label, who, sync=None, closable=True):
        close = ic('close', 11, T['faint']) if closable else ''
        icon = sync_icon(sync == "on") if sync is not None else ''
        return (f'<div style="height: 24px; flex: none; display: flex; align-items: center; gap: 8px; padding: 0 10px;'
                f' background: {T["chrome"]}; border-bottom: 1px solid {T["line"]};">'
                f'<span style="font-size: 9px; font-weight: 700; letter-spacing: 0.1em; color: {T["faint"]};">{label}</span>'
                f'<span class="mono" style="font-size: 10.5px; color: {T["muted"]};">{who}</span>'
                f'<div style="flex: 1;"></div>{icon}{close}</div>')

    def pane(label, who, segments, can_back, rows, sync=None, border=True):
        b = f'border: 1px solid {T["line"]}; border-radius: 6px;' if border else f'border: 1.5px dashed {T["line2"]}; border-radius: 6px;'
        if rows is None:
            return (f'<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; {b}">'
                    f'{ic("sftp", 22, T["off"])}<span style="font-size: 11px; color: {T["faint"]};">Drop a host here</span></div>')
        body = "".join(crow(*r) for r in rows)
        return (f'<div style="display: flex; flex-direction: column; overflow: hidden; {b}">'
                f'{pane_header(label, who, sync)}{nav_bar(segments, can_back)}'
                f'<div style="flex: 1; padding: 4px 0; overflow: hidden;">{body}</div></div>')

    source_rows = (
        source_row("index.html", checked=True)
        + source_row("assets")
        + source_row("app.2f9c.js", checked=True)
    )
    source = (f'<div style="display: flex; flex-direction: column; overflow: hidden; border: 1px solid {T["line"]}; border-radius: 6px;">'
              f'{pane_header("SOURCE", "deploy@10.4.1.20")}{nav_bar(["/", "var", "www"], True)}'
              f'<div style="flex: 1; padding: 4px 0; overflow: hidden;">{source_rows}</div>'
              f'{send_bar(2)}</div>')
    d1 = pane("DESTINATION", "deploy@10.4.1.21", ["/", "var", "www"], False,
              [("index.html",), ("assets", True)], sync="on")
    d2 = pane("DESTINATION", "deploy@10.9.0.5", ["/", "srv", "releases"], True,
              [("current", True), ("2026-08-30", True)], sync="off")
    d3 = pane("", "", [], False, None, border=False)

    panes = f"""      <div style="flex: 1; min-height: 0; display: flex; gap: 10px; padding: 12px;">
        <div style="width: 50%;">{source}</div>
        <div style="width: 50%; display: grid; grid-template-rows: repeat(3, minmax(0, 1fr)); gap: 8px;">{d1}{d2}{d3}</div>
      </div>"""

    transfers = transfers_bar(
        transfer_row("index.html", "deploy@10.4.1.21", 197_000, 318_000)
        + transfer_row("app.2f9c.js", "deploy@10.4.1.21", 0, 82_000),
        2,
    )
    body = f'{panes}\n{transfers}'

    sidebar = sessions_sidebar(active=None, states={"web-01": "ok"})
    st = status(stat_text("1 of 2 destinations receiving", T['faint'], mono=False), stat_text("sending 2 files", T['muted']))

    page_html = f"""
<div style="width: 1440px; height: 900px; display: flex; flex-direction: column; background: {T['base']}; color: {T['ink']}; overflow: hidden; font-size: 13px;">
{plain_titlebar()}
{toolbar_row(right_html=select_all_button(1) + split_control(active=3))}
  <div style="flex: 1; min-height: 0; display: flex; align-items: stretch;">
{home_rail(workspace="sftp", sftp_badge="3")}
{sidebar}
    <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; background: {T['base']};">
{body}
    </div>
  </div>
{st}
</div>
"""
    write("SftpProposalBroadcast.dc.html", HEAD + page_html + FOOT)

def menu_item(label, detail=None, destructive=False, focused=False):
    """`GroupMenu.tsx`'s own row, redrawn rather than invented: no icon, a
    `detail` line under a destructive item naming what is about to be lost
    (`GroupMenu`'s own reasoning: "the count belongs on the control that
    does the thing, where it is read a moment before the decision"), which
    is why apagar needs no second confirmation screen of its own."""
    bg = f'background: {T["raised"]};' if focused else ''
    color = T['dangertext'] if destructive else T['ink2']
    detail_html = (
        f'<span style="font-size: 11px; line-height: 1.3; color: {T["faint"]};">{detail}</span>' if detail else ''
    )
    return (f'<div style="display: flex; flex-direction: column; justify-content: center; gap: 1px; padding: 5px 12px; {bg}">'
            f'<span style="font-size: 12.5px; color: {color};">{label}</span>{detail_html}</div>')

def context_menu(items, top, left, width=210):
    """Positioned absolutely over the pane it was opened from, the same
    `fixed` + computed `left`/`top` `GroupMenu.tsx` uses (`menuPosition`),
    approximated here at a fixed spot rather than computed, since this
    artboard draws one open state rather than every possible one."""
    body = "".join(items)
    return (f'<div style="position: absolute; top: {top}px; left: {left}px; width: {width}px; z-index: 20;'
            f' background: {T["overlay"]}; border: 1px solid {T["line2"]}; border-radius: 6px; padding: 4px 0;'
            f' box-shadow: 0 12px 32px rgba(0,0,0,0.45); display: flex; flex-direction: column;">{body}</div>')

def action_banner(text):
    """The gap `pane.error` leaves: that one replaces the whole listing, so
    a failed rename or a failed mkdir needs a shorter-lived strip that says
    what went wrong without taking the files on screen down with it."""
    return (f'<div style="flex: none; display: flex; align-items: center; gap: 6px; padding: 5px 10px;'
            f' background: {T["dangersoft"]}; border-bottom: 1px solid {T["line"]};">'
            f'<span style="font-size: 11.5px; color: {T["dangertext"]};">{text}</span></div>')

def build_sftp_file_ops():
    """Exploratory (2026-09-01), Phase 3 of #256's SFTP roadmap: creating a
    directory, renaming an entry, deleting one or several, confirmed
    directly to take the shape already proven elsewhere in this tree rather
    than a new one: `GroupMenu.tsx`'s context menu (`menu_item`/
    `context_menu` above), in-place editing for a name (no modal, ADR-0042's
    own `SessionSurface` is reserved for heavier decisions than a routine
    rename), and a one-click destructive delete carrying its own warning in
    the `detail` line instead of a second confirmation screen.

    Confirmed directly: deleting a directory is recursive (this client talks
    plain SFTP and the local filesystem, no trash on either side), which is
    exactly what the menu's own `detail` line says before the click rather
    than after it.

    Three edit states drawn together on one source pane, each real but
    never simultaneous in the shipped tree: a fresh "New folder" row mid
    entry (opened from the nav bar's new icon), an existing name mid
    rename, and the context menu open over a third row. The destination
    pane alongside shows the same nav bar icon, since file management is a
    property of the pane's own endpoint, not of whether it sends."""
    def crow(name, dim=False, editing=None):
        """`editing`, given, replaces the name with a bordered input box
        holding that text, selected the way a fresh "New folder" or a
        rename starts: ready to type over immediately."""
        if editing is not None:
            i = ic("sftp", 12, T['faint']) if dim else f'<svg class="ic" viewBox="0 0 24 24" style="width: 12px; height: 12px; color: {T["faint"]};"><path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v4h4"></path></svg>'
            box = (f'<span class="mono" style="flex: 1; min-width: 0; font-size: 11px; color: {T["ink"]}; background: {T["input"]};'
                   f' border: 1px solid {T["accent"]}; border-radius: 3px; padding: 1px 5px;">{editing}<span style="display: inline-block; width: 1px; height: 11px; background: {T["accent"]}; margin-left: 1px; vertical-align: text-bottom;"></span></span>')
            return f'<div style="display: flex; align-items: center; gap: 7px; padding: 3px 8px;">{i}{box}</div>'
        i = ic("sftp", 12, T['faint']) if dim else f'<svg class="ic" viewBox="0 0 24 24" style="width: 12px; height: 12px; color: {T["faint"]};"><path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v4h4"></path></svg>'
        return (f'<div style="display: flex; align-items: center; gap: 7px; padding: 3px 8px;">{i}'
                f'<span class="mono" style="font-size: 11px; color: {T["ink2"]};">{name}</span></div>')

    def pane_header(label, who):
        return (f'<div style="height: 24px; flex: none; display: flex; align-items: center; gap: 8px; padding: 0 10px;'
                f' background: {T["chrome"]}; border-bottom: 1px solid {T["line"]};">'
                f'<span style="font-size: 9px; font-weight: 700; letter-spacing: 0.1em; color: {T["faint"]};">{label}</span>'
                f'<span class="mono" style="font-size: 10.5px; color: {T["muted"]};">{who}</span></div>')

    source_rows = (
        crow("New folder", editing="New folder")
        + crow("index.html")
        + crow("assets", dim=True)
        + crow("app.2f9c.js", editing="report-final.js")
    )
    source_menu = context_menu(
        [
            menu_item("Rename"),
            menu_item("Delete", detail="Deletes the folder and everything inside it.", destructive=True, focused=True),
        ],
        top=118, left=170,
    )
    source = (f'<div style="position: relative; display: flex; flex-direction: column; overflow: hidden;'
              f' border: 1px solid {T["line"]}; border-radius: 6px;">'
              f'{pane_header("SOURCE", "deploy@10.4.1.20")}{nav_bar(["/", "var", "www"], True, new_folder=True)}'
              f'{action_banner("A file named “report-final.js” already exists here.")}'
              f'<div style="flex: 1; padding: 4px 0; overflow: hidden;">{source_rows}</div>'
              f'{source_menu}</div>')

    d1_rows = crow("index.html") + crow("assets", dim=True)
    d1 = (f'<div style="display: flex; flex-direction: column; overflow: hidden; border: 1px solid {T["line"]}; border-radius: 6px;">'
          f'{pane_header("DESTINATION", "deploy@10.4.1.21")}{nav_bar(["/", "var", "www"], False, new_folder=True)}'
          f'<div style="flex: 1; padding: 4px 0; overflow: hidden;">{d1_rows}</div></div>')
    d2 = (f'<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;'
          f' border: 1.5px dashed {T["line2"]}; border-radius: 6px;">'
          f'{ic("sftp", 22, T["off"])}<span style="font-size: 11px; color: {T["faint"]};">Drop a host here</span></div>')

    body = f"""      <div style="flex: 1; min-height: 0; display: flex; gap: 10px; padding: 12px;">
        <div style="width: 50%;">{source}</div>
        <div style="width: 50%; display: grid; grid-template-rows: repeat(2, minmax(0, 1fr)); gap: 8px;">{d1}{d2}</div>
      </div>"""

    sidebar = sessions_sidebar(active=None, states={"web-01": "ok"})
    st = status(stat_text("1 destination, 1 source", T['faint'], mono=False), stat_text("", T['muted']))

    page_html = f"""
<div style="width: 1440px; height: 900px; display: flex; flex-direction: column; background: {T['base']}; color: {T['ink']}; overflow: hidden; font-size: 13px;">
{plain_titlebar()}
{toolbar_row(right_html=select_all_button(1) + split_control(active=2))}
  <div style="flex: 1; min-height: 0; display: flex; align-items: stretch;">
{home_rail(workspace="sftp", sftp_badge="2")}
{sidebar}
    <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; background: {T['base']};">
{body}
    </div>
  </div>
{st}
</div>
"""
    write("SftpFileOps.dc.html", HEAD + page_html + FOOT)

def build_sftp_folder_copy():
    """Exploratory (2026-09-01), Phase 4 of the SFTP roadmap (ADR-0049): a
    folder joins the same checkbox-and-Send flow a file already has,
    confirmed directly rather than a drag-only path, so marking a folder
    and pressing Send works the same way marking a file already does.

    The one new thing to draw is `folder_transfer_row()` in the transfers
    bar: count-based progress ("N of M files"), never bytes, since a
    folder's total size is not known the way one file's already-fetched
    metadata gives `transfer_row()` its own total for free. Two states
    shown together: `assets` still copying (accent bar, X to cancel), and
    `logs` finished with two files failed (warning triangle, amber bar,
    "12 of 12 files, 2 failed"). Confirmed directly that a partial
    failure does not stop the rest of a folder's own copy, so the finished
    state has to be able to say "done, but not all of it worked"."""
    def crow(name, dim=False, checked=None, is_dir=False):
        if is_dir:
            i = f'<svg class="ic" viewBox="0 0 24 24" style="width: 12px; height: 12px; color: {T["faint"]};" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 6.5h6l1.6 2H20v9.5H4z"></path></svg>'
        else:
            i = ic("sftp", 12, T['faint']) if dim else f'<svg class="ic" viewBox="0 0 24 24" style="width: 12px; height: 12px; color: {T["faint"]};"><path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v4h4"></path></svg>'
        if checked is None:
            box = '<span style="width: 13px; flex: none;"></span>' if not dim else ''
        elif checked:
            box = (f'<span style="width: 13px; height: 13px; border-radius: 3px; background: {T["accent"]}; flex: none;'
                    f' display: flex; align-items: center; justify-content: center;">'
                    f'<svg viewBox="0 0 24 24" style="width: 9px; height: 9px; color: {T["base"]};" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg></span>')
        else:
            box = f'<span style="width: 13px; height: 13px; border-radius: 3px; border: 1.5px solid {T["off"]}; flex: none;"></span>'
        bg = f'background: {T["accentsoft"]};' if checked else ''
        return (f'<div style="display: flex; align-items: center; gap: 8px; padding: 3px 8px; {bg}">{box}{i}'
                f'<span class="mono" style="font-size: 11px; color: {T["ink2"]};">{name}</span></div>')

    def send_bar(count):
        return (f'<div style="flex: none; display: flex; align-items: center; gap: 12px; padding: 7px 10px;'
                f' border-top: 1px solid {T["line"]}; background: {T["panel"]};">'
                f'<span class="mono" style="font-size: 11px; color: {T["muted"]};">{count} selected</span>'
                f'<div style="flex: 1;"></div>'
                f'<span style="font-size: 11.5px; color: {T["faint"]};">Clear</span>'
                f'<span style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: {T["base"]};'
                f' background: {T["accent"]}; border-radius: 6px; padding: 6px 14px;">Send'
                f'<svg viewBox="0 0 24 24" style="width: 12px; height: 12px;" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></span></div>')

    def pane_header(label, who):
        return (f'<div style="height: 24px; flex: none; display: flex; align-items: center; gap: 8px; padding: 0 10px;'
                f' background: {T["chrome"]}; border-bottom: 1px solid {T["line"]};">'
                f'<span style="font-size: 9px; font-weight: 700; letter-spacing: 0.1em; color: {T["faint"]};">{label}</span>'
                f'<span class="mono" style="font-size: 10.5px; color: {T["muted"]};">{who}</span></div>')

    source_rows = (
        crow("assets", checked=True, is_dir=True)
        + crow("logs", checked=True, is_dir=True)
        + crow("index.html", checked=False)
        + crow("app.2f9c.js", checked=True)
    )
    source = (f'<div style="display: flex; flex-direction: column; overflow: hidden; border: 1px solid {T["line"]}; border-radius: 6px;">'
              f'{pane_header("SOURCE", "deploy@10.4.1.20")}{nav_bar(["/", "var", "www"], True)}'
              f'<div style="flex: 1; padding: 4px 0; overflow: hidden;">{source_rows}</div>'
              f'{send_bar(3)}</div>')

    d1 = (f'<div style="display: flex; flex-direction: column; overflow: hidden; border: 1px solid {T["line"]}; border-radius: 6px;">'
          f'{pane_header("DESTINATION", "deploy@10.4.1.21")}{nav_bar(["/", "var", "www"], False)}'
          f'<div style="flex: 1; padding: 4px 0; overflow: hidden;">{crow("assets", is_dir=True)}{crow("logs", is_dir=True)}</div></div>')
    d2 = (f'<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;'
          f' border: 1.5px dashed {T["line2"]}; border-radius: 6px;">'
          f'{ic("sftp", 22, T["off"])}<span style="font-size: 11px; color: {T["faint"]};">Drop a host here</span></div>')

    body = f"""      <div style="flex: 1; min-height: 0; display: flex; gap: 10px; padding: 12px;">
        <div style="width: 50%;">{source}</div>
        <div style="width: 50%; display: grid; grid-template-rows: repeat(2, minmax(0, 1fr)); gap: 8px;">{d1}{d2}</div>
      </div>"""

    transfers = transfers_bar(
        folder_transfer_row("assets", "deploy@10.4.1.21", 7, 20)
        + folder_transfer_row("logs", "deploy@10.4.1.21", 12, 12, failed=2, active=False)
        + transfer_row("app.2f9c.js", "deploy@10.4.1.21", 82_000, 82_000, active=False),
        3,
    )
    page_body = f'{body}\n{transfers}'

    sidebar = sessions_sidebar(active=None, states={"web-01": "ok"})
    st = status(stat_text("1 destination, 1 source", T['faint'], mono=False), stat_text("copying 2 folders", T['muted']))

    page_html = f"""
<div style="width: 1440px; height: 900px; display: flex; flex-direction: column; background: {T['base']}; color: {T['ink']}; overflow: hidden; font-size: 13px;">
{plain_titlebar()}
{toolbar_row(right_html=select_all_button(1) + split_control(active=2))}
  <div style="flex: 1; min-height: 0; display: flex; align-items: stretch;">
{home_rail(workspace="sftp", sftp_badge="2")}
{sidebar}
    <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; background: {T['base']};">
{page_body}
    </div>
  </div>
{st}
</div>
"""
    write("SftpFolderCopy.dc.html", HEAD + page_html + FOOT)

def build_sftp_selection():
    """Accepted (ADR-0050): #291 shipped the click model, #292 shipped
    rename/delete, #293 shipped the upload-from-dialog icon (ADR-0042)
    leaving the identity row. All three are now the shipped tree, and
    this artboard is promoted alongside `build_sftp_delete_confirm()`,
    its own sibling.

    Two changes, described together because the second only makes sense
    once the first is true:

    Today's `Row` (`SftpPane.tsx`) opens a directory on a plain click and
    only lets Shift/Ctrl change what is selected; a checkbox is the other,
    separate way in. This proposes what Explorer and Finder both already
    do: a plain click always selects (replacing the selection), Shift
    extends a range, Ctrl/Cmd toggles one row without touching the rest,
    and it is a *double*-click that opens a directory. The checkbox goes
    away entirely, not because it did anything wrong, but because
    Ctrl-click already does exactly what its own "toggle without touching
    the anchor" doc comment describes, once the anchor a checkbox click
    itself never moved is no longer the thing protecting a plain click's
    old meaning.

    With that in place, a destination pane gets a selection worth drawing
    too, not just the source: today `onSelectClick` is `null` there
    because nothing a destination selects can be sent anywhere. Rename and
    delete are not about sending, though, and today they are reachable in
    every pane only by right-clicking one row at a time. The icon pair
    (pencil, trash) is the visible, hoverable way in `menu_item`'s
    "Rename"/"Delete" already describe, present in every pane, rename
    dimmed unless the count is exactly one, the same rule the context menu
    already enforces by only ever showing "Rename" for a single target.
    Drawn in `nav_bar()` next to new folder, not in `selection_bar()` at
    the bottom: confirmed directly against this artboard's first cut,
    which put them there instead, since new folder, rename and delete are
    the same kind of thing (a file-management action, always present in
    the bar, sometimes unable to run) while `selection_bar()` stays what it
    already was, the answer to "what happens to what I checked."

    Two panes drawn deliberately in different selection states rather than
    the same one twice: the source has three rows checked, one of them a
    directory (`logs`, selectable since ADR-0049), which is exactly the
    state that disables the pencil; the destination has exactly one, which
    is exactly the state that lights it. Nothing here removes the context
    menu drawn in `SftpFileOps.dc.html`; this is a second way to the same
    two actions, not a replacement for the first.

    Revised the same day, against the maintainer's own read of this
    artboard: a first pass tried folding the identity row and `nav_bar()`
    into one bar, and lost the round trip. Merged, the breadcrumb had to
    share its row with back, up, new folder, refresh and whatever slot
    icons a destination carries, which is exactly the row a long remote
    path needs the most width in. The three bars `SftpPane.tsx` already
    draws stay three: `pane_header()` (label, identity, and now the
    receiving toggle and clear-slot moved onto it) above `nav_bar()` (back,
    up, breadcrumb, new folder, refresh, and now rename/delete), above
    `selection_bar()` whenever something is checked. The one real change
    to the identity row is what leaves it: the upload-from-dialog icon
    (ADR-0042) is gone, confirmed directly that picking a file through a
    native dialog stopped pulling its own weight once a source pane's drag
    and the checkbox-free selection above cover the same ground."""
    def crow(name, dim=False, is_dir=False, selected=False):
        if is_dir:
            i = f'<svg class="ic" viewBox="0 0 24 24" style="width: 12px; height: 12px; color: {T["faint"]};" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 6.5h6l1.6 2H20v9.5H4z"></path></svg>'
        else:
            i = ic("sftp", 12, T['faint']) if dim else f'<svg class="ic" viewBox="0 0 24 24" style="width: 12px; height: 12px; color: {T["faint"]};"><path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v4h4"></path></svg>'
        bg = f'background: {T["accentsoft"]};' if selected else ''
        return (f'<div style="display: flex; align-items: center; gap: 8px; padding: 3px 8px; {bg}">{i}'
                f'<span class="mono" style="font-size: 11px; color: {T["ink2"]};">{name}</span></div>')

    def selection_bar(count, show_send):
        """Just the count and what to do with it now: rename and delete
        moved up into `nav_bar()`, next to new folder, confirmed directly
        over this bar's first cut, which carried them itself."""
        send = (
            f'<span style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: {T["base"]};'
            f' background: {T["accent"]}; border-radius: 6px; padding: 6px 14px;">Send'
            f'<svg viewBox="0 0 24 24" style="width: 12px; height: 12px;" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></span>'
            if show_send else ''
        )
        return (f'<div style="flex: none; display: flex; align-items: center; gap: 10px; padding: 7px 10px;'
                f' border-top: 1px solid {T["line"]}; background: {T["panel"]};">'
                f'<span class="mono" style="font-size: 11px; color: {T["muted"]};">{count} selected</span>'
                f'<div style="flex: 1;"></div>'
                f'<span style="font-size: 11.5px; color: {T["faint"]};">Clear</span>{send}</div>')

    def pane_header(label, who, receiving=None, clearable=False):
        """Identity and slot management, same bar the shipped tree already
        draws (`SftpPane.tsx`'s own header) minus the upload-from-dialog
        icon: confirmed directly that a fourth bar sharing space with the
        breadcrumb (a `unified_pane_bar()` this session tried first)
        squeezed the one thing a pane's own path most needs, room. Three
        bars stays: this one, `nav_bar()` right below it with the
        breadcrumb to itself, and `selection_bar()` whenever something is
        checked."""
        trailing = ''
        if receiving is not None:
            color = T['warn'] if receiving else T['faint']
            trailing += f'<span style="display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; color: {color};">{ic("broadcast", 13)}</span>'
        if clearable:
            trailing += f'<span style="display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; color: {T["faint"]};">{ic("close", 11)}</span>'
        return (f'<div style="height: 24px; flex: none; display: flex; align-items: center; gap: 8px; padding: 0 10px;'
                f' background: {T["chrome"]}; border-bottom: 1px solid {T["line"]};">'
                f'<span style="font-size: 9px; font-weight: 700; letter-spacing: 0.1em; color: {T["faint"]};">{label}</span>'
                f'<span class="mono" style="font-size: 10.5px; color: {T["muted"]};">{who}</span>'
                f'<div style="flex: 1;"></div>{trailing}</div>')

    source_rows = (
        crow("assets", is_dir=True)
        + crow("index.html", selected=True)
        + crow("logs", is_dir=True, selected=True)
        + crow("app.2f9c.js", selected=True)
    )
    source = (f'<div style="display: flex; flex-direction: column; overflow: hidden; border: 1px solid {T["line"]}; border-radius: 6px;">'
              f'{pane_header("SOURCE", "deploy@10.4.1.20")}{nav_bar(["/", "var", "www"], True, new_folder=True, selected_count=3)}'
              f'<div style="flex: 1; padding: 4px 0; overflow: hidden;">{source_rows}</div>'
              f'{selection_bar(3, show_send=True)}</div>')

    d1_rows = crow("index.html", selected=True) + crow("assets", is_dir=True)
    d1 = (f'<div style="display: flex; flex-direction: column; overflow: hidden; border: 1px solid {T["line"]}; border-radius: 6px;">'
          f'{pane_header("DESTINATION", "deploy@10.4.1.21", receiving=True, clearable=True)}{nav_bar(["/", "var", "www"], False, new_folder=True, selected_count=1)}'
          f'<div style="flex: 1; padding: 4px 0; overflow: hidden;">{d1_rows}</div>'
          f'{selection_bar(1, show_send=False)}</div>')
    d2 = (f'<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;'
          f' border: 1.5px dashed {T["line2"]}; border-radius: 6px;">'
          f'{ic("sftp", 22, T["off"])}<span style="font-size: 11px; color: {T["faint"]};">Drop a host here</span></div>')

    body = f"""      <div style="flex: 1; min-height: 0; display: flex; gap: 10px; padding: 12px;">
        <div style="width: 50%;">{source}</div>
        <div style="width: 50%; display: grid; grid-template-rows: repeat(2, minmax(0, 1fr)); gap: 8px;">{d1}{d2}</div>
      </div>"""

    sidebar = sessions_sidebar(active=None, states={"web-01": "ok"})
    st = status(stat_text("3 selected, 1 folder", T['faint'], mono=False), stat_text("", T['muted']))

    page_html = f"""
<div style="width: 1440px; height: 900px; display: flex; flex-direction: column; background: {T['base']}; color: {T['ink']}; overflow: hidden; font-size: 13px;">
{plain_titlebar()}
{toolbar_row(right_html=select_all_button(1) + split_control(active=2))}
  <div style="flex: 1; min-height: 0; display: flex; align-items: stretch;">
{home_rail(workspace="sftp", sftp_badge="2")}
{sidebar}
    <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; background: {T['base']};">
{body}
    </div>
  </div>
{st}
</div>
"""
    write("SftpSelection.dc.html", HEAD + page_html + FOOT)

def build_sftp_delete_confirm():
    """Accepted (ADR-0050, #292): the one question `requestDelete` always
    asks first, reached identically from the nav bar's own trash icon, the
    right-click menu, and the Delete key. Deleting over SFTP has no trash
    either end, unlike the Recycle Bin Explorer's own Delete key answers
    to, so a mistaken multi- or folder-delete had no way back before this.
    Shaped like `HostKeyChanged.dc.html`'s own danger-tinted card rather
    than invented fresh, with one difference from that card's own reason
    for existing: deleting is an ordinary, deliberate action once asked
    for, not an unexpected one to resist, so *Delete* is the filled
    button here, only tinted danger rather than accent.

    Revised from the exploratory pass against the shape the implementation
    actually took: the card overlays the one pane that asked
    (`SftpDeleteConfirm.tsx`, `position: absolute inset-0` over that
    `SftpPane`'s own rectangle), not the whole workspace. A destination
    pane keeps browsing while the source asks its own question, the same
    as any dual-pane file manager already lets one side interrupt without
    freezing the other.

    The body keeps `menuItemsFor`'s own reasoning for what a detail line
    says (`GroupMenu.tsx`'s doc comment: the count belongs on the control
    that does the thing), moved from a line under a menu row to the body
    of a screen somebody has to read before confirming."""
    def line(name, is_dir=False):
        i = (f'<svg class="ic" viewBox="0 0 24 24" style="width: 12px; height: 12px; color: {T["faint"]};" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 6.5h6l1.6 2H20v9.5H4z"></path></svg>'
             if is_dir else
             f'<svg class="ic" viewBox="0 0 24 24" style="width: 12px; height: 12px; color: {T["faint"]};"><path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v4h4"></path></svg>')
        suffix = ' <span style="color: ' + T['faint'] + ';">(folder)</span>' if is_dir else ''
        return (f'<div style="display: flex; align-items: center; gap: 8px; padding: 3px 0;">{i}'
                f'<span class="mono" style="font-size: 12px; color: {T["ink2"]};">{name}{suffix}</span></div>')

    def crow(name, dim=False, is_dir=False, selected=False):
        if is_dir:
            i = f'<svg class="ic" viewBox="0 0 24 24" style="width: 12px; height: 12px; color: {T["faint"]};" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 6.5h6l1.6 2H20v9.5H4z"></path></svg>'
        else:
            i = ic("sftp", 12, T['faint']) if dim else f'<svg class="ic" viewBox="0 0 24 24" style="width: 12px; height: 12px; color: {T["faint"]};"><path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v4h4"></path></svg>'
        bg = f'background: {T["accentsoft"]};' if selected else ''
        return (f'<div style="display: flex; align-items: center; gap: 8px; padding: 3px 8px; {bg}">{i}'
                f'<span class="mono" style="font-size: 11px; color: {T["ink2"]};">{name}</span></div>')

    def pane_header(label, who):
        return (f'<div style="height: 24px; flex: none; display: flex; align-items: center; gap: 8px; padding: 0 10px;'
                f' background: {T["chrome"]}; border-bottom: 1px solid {T["line"]};">'
                f'<span style="font-size: 9px; font-weight: 700; letter-spacing: 0.1em; color: {T["faint"]};">{label}</span>'
                f'<span class="mono" style="font-size: 10.5px; color: {T["muted"]};">{who}</span></div>')

    card = f"""        <div style="position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(4, 9, 15, 0.55);">
          <div style="width: 100%; max-width: 400px; background: {T['overlay']}; border: 1px solid {T['danger']}; border-radius: 10px; overflow: hidden;">
            <div style="display: flex; align-items: center; gap: 11px; padding: 16px 22px; background: {T['dangersoft']}; border-bottom: 1px solid {T['danger']};">
              {ic('trash', 17, T['dangertext'])}
              <span style="font-size: 15px; font-weight: 700; color: {T['dangertext']};">Delete 3 items?</span>
            </div>
            <div style="padding: 20px 22px;">
              <div style="font-size: 12.5px; color: {T['ink2']}; line-height: 1.6;">This can't be undone. One of them is a folder: deleting it removes everything inside it.</div>
              <div style="margin-top: 14px; background: {T['terminal']}; border: 1px solid {T['line']}; border-radius: 7px; padding: 10px 14px;">
                {line("index.html")}{line("logs", is_dir=True)}{line("app.2f9c.js")}
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px; padding: 15px 22px; border-top: 1px solid {T['line']}; background: {T['base']};">
              <div style="flex: 1;"></div>
              <span style="font-size: 12.5px; color: {T['muted']}; border: 1px solid {T['line']}; border-radius: 6px; padding: 8px 18px;">Cancel</span>
              <span style="font-size: 12.5px; font-weight: 600; color: {T['dangersoft']}; background: {T['danger']}; border-radius: 6px; padding: 8px 20px;">Delete</span>
            </div>
          </div>
        </div>"""

    source_rows = (
        crow("assets", is_dir=True)
        + crow("index.html", selected=True)
        + crow("logs", is_dir=True, selected=True)
        + crow("app.2f9c.js", selected=True)
    )
    source = (f'<div style="position: relative; display: flex; flex-direction: column; overflow: hidden; border: 1px solid {T["line"]}; border-radius: 6px;">'
              f'{pane_header("SOURCE", "deploy@10.4.1.20")}{nav_bar(["/", "var", "www"], True, new_folder=True, selected_count=3)}'
              f'<div style="flex: 1; padding: 4px 0; overflow: hidden;">{source_rows}</div>'
              f'{card}</div>')

    dest_rows = crow("index.html") + crow("assets", is_dir=True) + crow("app.2f9c.js")
    dest = (f'<div style="display: flex; flex-direction: column; overflow: hidden; border: 1px solid {T["line"]}; border-radius: 6px;">'
            f'{pane_header("DESTINATION", "deploy@10.4.1.21")}{nav_bar(["/", "var", "www"], False, new_folder=True, selected_count=0)}'
            f'<div style="flex: 1; padding: 4px 0; overflow: hidden;">{dest_rows}</div>'
            f'</div>')

    body = f"""      <div style="flex: 1; min-height: 0; display: flex; gap: 10px; padding: 12px;">
        <div style="width: 50%;">{source}</div>
        <div style="width: 50%;">{dest}</div>
      </div>"""

    sidebar = sessions_sidebar(active=None, states={"web-01": "ok"})
    st = status(stat_text("3 selected, 1 folder", T['faint'], mono=False), stat_text("", T['muted']))

    page_html = f"""
<div style="width: 1440px; height: 900px; display: flex; flex-direction: column; background: {T['base']}; color: {T['ink']}; overflow: hidden; font-size: 13px;">
{plain_titlebar()}
{toolbar_row(right_html=select_all_button(1) + split_control(active=2))}
  <div style="flex: 1; min-height: 0; display: flex; align-items: stretch;">
{home_rail(workspace="sftp", sftp_badge="2")}
{sidebar}
    <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; background: {T['base']};">
{body}
    </div>
  </div>
{st}
</div>
"""
    write("SftpDeleteConfirm.dc.html", HEAD + page_html + FOOT)

def build_sessions_proposal():
    """Exploratory (2026-08-31), the SSH counterpart to
    `build_sftp_proposal()`: the shape control moves off the Titlebar into
    the same toolbar row SFTP's split control now uses (`shapes()`,
    unchanged, just relocated), and the lone open tab gets Option 1's
    stretched identity bar. Nothing here is accepted; `Main.dc.html` and
    `Groups.dc.html` are still the shipped shape until this is picked."""
    occupied = group(
        solo_tab_header("web-01", "deploy@10.4.1.20"),
        term(prompt("deploy", "web-01", "systemctl status nginx") + "\n"
             + f'<span style="color: {T["ok"]};">&#9679;</span> nginx.service - A high performance web server\n'
             + f'     Active: <span style="color: {T["ok"]};">active (running)</span> since Mon 2026-08-24 09:12:04 UTC\n\n'
             + prompt("deploy", "web-01") + CURSOR),
        border=T['accent'],
    )
    grid = f"""      <div style="flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 10px; padding: 12px;">
        <div style="flex: 1; min-height: 0;">{occupied}</div>
        <div style="flex: 1; min-height: 0;">{empty_group_slot()}</div>
      </div>"""

    sidebar = sessions_sidebar(active="web-01", states={"web-01": "ok"})
    st = status(stat_session("deploy@10.4.1.20") + "\n" + sep() + "\n" + stat_text("198 x 42"),
                stat_text("SYNC OFF", T['faint'], mono=False))

    page_html = f"""
<div style="width: 1440px; height: 900px; display: flex; flex-direction: column; background: {T['base']}; color: {T['ink']}; overflow: hidden; font-size: 13px;">
{plain_titlebar()}
{toolbar_row(right_html=broadcast_button(False) + shapes('rows'))}
  <div style="flex: 1; min-height: 0; display: flex; align-items: stretch;">
{home_rail(workspace="sessions", badge="1")}
{sidebar}
    <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; background: {T['base']};">
{grid}
    </div>
  </div>
{st}
</div>
"""
    write("SessionsProposal.dc.html", HEAD + page_html + FOOT)

def warn_chip(count):
    """`StatusBar.tsx`'s own `syncing` chip, redrawn verbatim: the warning
    triangle, warn-soft background, the count of hosts actually receiving.
    Answers "is it on, and for how many" without opening anything."""
    return (f'<div style="display: flex; align-items: center; gap: 6px; padding: 3px 9px; border-radius: 5px;'
            f' background: {T["warnsoft"]}; color: {T["warn"]}; border: 1px solid {T["warn"]}66;">'
            f'<svg viewBox="0 0 16 16" style="width: 12px; height: 12px;" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">'
            f'<path d="M8 1.8 1.5 13.2h13L8 1.8ZM8 6.2v3.4M8 11.4h.01"></path></svg>'
            f'<span class="mono" style="font-size: 11px; font-weight: 700;">{count} hosts receiving</span></div>')

def build_sessions_proposal_broadcast():
    """Exploratory (2026-08-31): the direct answer to "how do I broadcast
    to 2 active windows" in this same proposed shape.

    First read against ADR-0021's own history: that document tried a
    global broadcast control in the top strip for a day and reversed it,
    on the reasoning that "this control means something per rectangle."
    Confirmed directly anyway, since a toolbar shortcut for "arm/disarm
    everyone" is not the same claim as "only a global control, no
    per-rectangle one": `broadcast_button()` now sits in the toolbar
    (`build_sessions_proposal_broadcast_multi()` draws it), and
    `sync_icon()` stays exactly where Option 1 already put it. Either path
    arms every open, non-empty group at once (arming has always started
    with everyone included, ADR-0019), which for exactly two open groups
    already means both; muting one afterward is still the per-rectangle
    switch's own job."""
    g1 = group(
        solo_tab_header("web-01", "deploy@10.4.1.20", sync="on"),
        term(prompt("deploy", "web-01", "tail -f /var/log/nginx/access.log") + "\n"
             '10.4.1.7 - - [31/Aug/2026:20:41:02] "GET /health HTTP/1.1" 200 2\n'
             + prompt("deploy", "web-01") + CURSOR),
        border=T['warn'],
    )
    g2 = group(
        solo_tab_header("db-prod", "postgres@10.4.1.31", sync="on"),
        term(prompt("postgres", "db-prod") + CURSOR),
        border=T['warn'],
    )
    grid = f"""      <div style="flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 10px; padding: 12px;">
        <div style="flex: 1; min-height: 0;">{g1}</div>
        <div style="flex: 1; min-height: 0;">{g2}</div>
      </div>"""

    sidebar = sessions_sidebar(active="web-01", states={"web-01": "ok", "db-prod": "ok"})
    st = status_warn(stat_session("deploy@10.4.1.20") + "\n" + sep() + "\n" + stat_text("198 x 42"),
                      warn_chip(2))

    page_html = f"""
<div style="width: 1440px; height: 900px; display: flex; flex-direction: column; background: {T['base']}; color: {T['ink']}; overflow: hidden; font-size: 13px;">
{plain_titlebar()}
{toolbar_row(right_html=broadcast_button(True, 2) + shapes('rows'))}
  <div style="flex: 1; min-height: 0; display: flex; align-items: stretch;">
{home_rail(workspace="sessions", badge="2")}
{sidebar}
    <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; background: {T['base']};">
{grid}
    </div>
  </div>
{st}
</div>
"""
    write("SessionsProposalBroadcast.dc.html", HEAD + page_html + FOOT)

def build_sessions_proposal_broadcast_multi():
    """Exploratory (2026-08-31): the same question for a group holding more
    than one tab. Two groups, not one: broadcast reaches a group's *active*
    tab only (`canvas.json`'s own safety-note annotation: "Armed broadcast
    reaches the active tab of each group, so a session behind another is
    connected and not receiving"), so a single group with three tabs still
    contributes exactly one receiver, whichever tab is active. Three tabs
    in one group is a `strip()` question, not a broadcast-count one; the
    second group is what actually demonstrates two receivers.

    Confirmed directly: the toolbar's `broadcast_button()` sits before the
    split/shape control, and `strip()`'s packed tabs keep `sync_icon()` at
    the trailing edge the same way `GroupStrip.tsx` already puts
    `SyncToggle` there today. `strip(actions=False, ...)`: the plus/dots
    pair `strip()` still draws by default is itself stale against the real
    `GroupStrip.tsx`, which dropped that trailing button once the palette
    took over what it did, the same drift `sessions_header()` had. Not
    fixed here, only not repeated: the fuller `strip()`/`sessions_header()`
    -shaped audit is its own pass, if the maintainer wants it done for
    every artboard the way this one already was."""
    s = strip(
        [tab("web-01", "deploy@10.4.1.20", "on"), tab("web-02"), tab("cache-01", dot="warn")],
        actions=False,
        extra=sync_icon(True),
    )
    body = term(
        prompt("deploy", "web-01", "tail -f /var/log/nginx/access.log") + "\n"
        '10.4.1.7 - - [31/Aug/2026:20:41:02] "GET /health HTTP/1.1" 200 2\n'
        + prompt("deploy", "web-01") + CURSOR
    )
    multi = group(s, body, border=T['warn'])

    solo = group(
        solo_tab_header("db-prod", "postgres@10.4.1.31", sync="on"),
        term(prompt("postgres", "db-prod") + CURSOR),
        border=T['warn'],
    )

    grid = f"""      <div style="flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 10px; padding: 12px;">
        <div style="flex: 1; min-height: 0;">{multi}</div>
        <div style="flex: 1; min-height: 0;">{solo}</div>
      </div>"""

    sidebar = sessions_sidebar(active="web-01", states={"web-01": "ok", "db-prod": "ok"})
    st = status_warn(stat_session("deploy@10.4.1.20") + "\n" + sep() + "\n" + stat_text("198 x 42"),
                      warn_chip(2))

    page_html = f"""
<div style="width: 1440px; height: 900px; display: flex; flex-direction: column; background: {T['base']}; color: {T['ink']}; overflow: hidden; font-size: 13px;">
{plain_titlebar()}
{toolbar_row(right_html=broadcast_button(True, 2) + shapes('rows'))}
  <div style="flex: 1; min-height: 0; display: flex; align-items: stretch;">
{home_rail(workspace="sessions", badge="4")}
{sidebar}
    <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; background: {T['base']};">
{grid}
    </div>
  </div>
{st}
</div>
"""
    write("SessionsProposalBroadcastMulti.dc.html", HEAD + page_html + FOOT)

# ---------- 10. Home: the rail, the nav, and the wizard's own breadcrumb
# Drawn 2026-08-30 against the maintainer's own complaint that the wizard
# "não mostra onde você está" once Access hands off to its automatic phase
# (#234). The third breadcrumb item this proposed shipped the same day
# (`SessionWizard.tsx`'s own `phase`), closing #233 along with it: these two
# artboards already drew the real, current wizard shape, and were held back
# from the canonical set only by that one still-proposed piece.

def home_rail(workspace="home", badge=None, sftp_badge=None, armed=False):
    """ADR-0029's rail, now the three peer workspaces it always said would
    arrive once SFTP had a design of its own (ADR-0044): Home, Sessions,
    SFTP. No gear (moved to a Home card).

    `armed` matches `ActivityRail.tsx`'s own prop exactly: it warn-tints
    every slot and locks Home and SFTP, never Sessions, since typing
    reaches hosts from inside Sessions and switching away is not what
    someone reaching for the rail mid-broadcast meant to do. `badge` draws
    the open-session count on the Sessions slot, the same as `openCount`
    there; `sftp_badge` draws the open-transfer-tab count on the SFTP slot
    the same way.

    #234: `Settings.dc.html` and `NewSession.dc.html` used to still draw the
    pre-ADR-0029 three-slot shape, on purpose, not by oversight. Neither was
    a rail-only fix: Settings' whole premise, a rail gear opening a tab, was
    gone, not only its rail, so #236 retired the artboard rather than redraw
    it against `HomeDashboard.dc.html`'s own card. NewSession predated the
    wizard entirely and #233 retired it the same way, once `HostsHost.dc.html`
    and `HostsAccess.dc.html` had nothing left holding them out of the
    canonical set."""
    accent = T['warn'] if armed else T['accent']
    def slot(icon, on, locked=False, bad=None):
        color = T['ink'] if on else (T['off'] if locked else T['faint'])
        bar = (f'<div style="position: absolute; left: 0; top: 8px; bottom: 8px; width: 2px;'
               f' background: {accent}; border-radius: 0 2px 2px 0;"></div>') if on else ''
        badge_html = ''
        if bad:
            badge_html = (f'<span class="mono" style="position: absolute; right: 6px; bottom: 7px; min-width: 15px; height: 15px;'
                          f' border-radius: 8px; background: {accent}; color: {T["base"]}; font-size: 9.5px; font-weight: 700;'
                          f' display: flex; align-items: center; justify-content: center; padding: 0 4px;">{bad}</span>')
        lock_html = ''
        if locked:
            lock_html = (f'<svg viewBox="0 0 24 24" fill="none" stroke="{T["warn"]}" stroke-width="2" style="width: 10px; height: 10px;'
                         f' position: absolute; right: 7px; bottom: 8px;">{ICON["lock"]}</svg>')
        return (f'<div style="width: 100%; height: 44px; display: flex; align-items: center; justify-content: center;'
                f' position: relative; color: {color};">{bar}{ic(icon, 21, cls="rail-ic")}{badge_html}{lock_html}</div>')
    return f"""    <div style="width: 48px; flex: none; background: {T['chrome']}; border-right: 1px solid {T['line']}; display: flex; flex-direction: column; align-items: center; padding: 6px 0;">
      {slot('home', workspace == 'home', locked=armed)}
      {slot('ssh', workspace == 'sessions', bad=badge)}
      {slot('sftp', workspace == 'sftp', locked=armed, bad=sftp_badge)}
    </div>"""

def kind_picker(active="direct"):
    """`HostKindPicker.tsx`'s three pills, ADR-0031. 'direct' is the default:
    neither end of a chain, and what most hosts are."""
    kinds = [("jumpServer", "Jump server"), ("target", "Target"), ("direct", "Direct")]
    out = []
    for key, label in kinds:
        on = key == active
        border = T['accent'] if on else T['line']
        bg = f'background: {T["accentsoft"]};' if on else ''
        color = T['ink'] if on else T['ink2']
        icon = kind_ic(key, T['accent'] if on else T['ink2'])
        out.append(f'<span style="display: inline-flex; align-items: center; gap: 6px; border: 1px solid {border};'
                    f' {bg} border-radius: 5px; padding: 5px 9px; font-size: 11.5px; color: {color};">{icon}{label}</span>')
    return f'<div style="display: flex; flex-wrap: wrap; gap: 6px;">{"".join(out)}</div>'

def hosts_header(creating_new=False, show_filter=False):
    """`show_filter` (ADR-0056): the same filter box `sessions_header()`
    already draws, added here rather than invented a second way, once a
    list with no way to narrow it stopped being fine at book scale.
    `creating_new` highlights the plus icon while a fresh, unsaved draft is
    the row showing in the panel beside it."""
    plus = (f'<span style="width: 20px; height: 20px; border-radius: 4px; background: {T["raised"]};'
            f' display: flex; align-items: center; justify-content: center; color: {T["accent"]};">{ic("plus")}</span>'
            ) if creating_new else ic('plus', 14, T['muted'])
    filter_html = ''
    if show_filter:
        filter_html = f"""
        <div style="height: 32px; background: {T['input']}; border: 1px solid {T['line']}; border-radius: 6px; display: flex; align-items: center; gap: 8px; padding: 0 10px; margin-top: 8px;">
          {ic('search', 14, T['faint'])}<span style="font-size: 12px; color: {T['faint']};">Filter hosts</span>
        </div>"""
    return f"""      <div style="padding: 14px 14px 10px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 10.5px; font-weight: 700; letter-spacing: 0.1em; color: {T['faint']};">HOSTS</span>
          <div style="flex: 1;"></div>
          {plus}
        </div>{filter_html}
      </div>"""

def hosts_shell(rows_html, panel_html, creating_new=False, show_filter=False):
    """`HostsSection.tsx`: a 280px list beside one form, not a tab per open
    host, because a CRUD screen is exactly that shape."""
    left = f"""    <div style="width: 280px; flex: none; background: {T['panel']}; border-right: 1px solid {T['line']}; display: flex; flex-direction: column;">
{hosts_header(creating_new, show_filter)}
      <div style="flex: 1; padding: 0 8px 8px; display: flex; flex-direction: column; gap: 2px; overflow: hidden;">
{rows_html}
      </div>
    </div>"""
    return f"""    <div style="flex: 1; min-height: 0; display: flex;">
{left}
      <div style="flex: 1; min-width: 0; overflow: hidden;">{panel_html}</div>
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

def bordered_section(title, content):
    """A thin-bordered, titled group of fields.

    ADR-0056: once the host editor stopped being two navigable steps and
    became General, Topology and Access all on screen at once, four topics
    with nothing but a caption between them read as one loose,
    undifferentiated form. A thin border and a little padding gives each
    its own quiet boundary, `T['line']` and a 6px radius rather than the
    heavier `dashboard_card` rounding #237 already moved this screen away
    from."""
    return f"""<div style="display: flex; flex-direction: column; gap: 12px; border: 1px solid {T['line']};
      border-radius: 6px; padding: 14px 16px;">
      <span style="font-size: 10px; font-weight: 700; letter-spacing: 0.09em; color: {T['faint']};">{title.upper()}</span>
{content}
    </div>"""

def forward_kind_pills(active):
    """The same three-pill control `kind_picker()` already draws for
    Topology, relabelled: ADR-0054 confirmed one shape for all three
    forward kinds rather than a picker invented per kind."""
    out = []
    for k in ("Local", "Remote", "Dynamic"):
        on = k == active
        border = T['accent'] if on else T['line']
        bg = f'background: {T["accentsoft"]};' if on else ''
        color = T['ink'] if on else T['ink2']
        out.append(f'<span style="padding: 4px 9px; border: 1px solid {border}; {bg} border-radius: 5px;'
                   f' font-size: 11px; color: {color};">{k}</span>')
    return f'<div style="display: flex; gap: 4px; flex: none;">{"".join(out)}</div>'

def forward_row(kind, bind_port, target=None, name=None):
    """One row of the Forwarding section (ADR-0054, #305): pills and bind
    port on the first line, target and name on the second, since the
    column this sits in is narrower than the panel's full width and
    `kind`, `bind_port`, `target` and `name` do not fit one line together.
    `target` is `None` for Dynamic, whose destination is read from the
    SOCKS handshake at connect time rather than fixed here."""
    detail = (
        f'<span class="mono" style="color: {T["ink2"]};">&#8594; {target}</span>'
    ) if target is not None else (
        f'<span style="color: {T["faint"]};">a local SOCKS proxy</span>'
    )
    name_html = f'<span style="color: {T["faint"]}; margin-left: auto;">{name}</span>' if name else ''
    return f"""<div style="display: flex; flex-direction: column; gap: 5px; padding: 9px 10px; background: {T['raised']}; border-radius: 6px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        {forward_kind_pills(kind)}
        <span class="mono" style="font-size: 12px; color: {T['ink']};">{bind_port}</span>
        <span style="color: {T['faint']}; margin-left: auto;">{ic('close', 11)}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; font-size: 11px; padding-left: 2px;">
        {detail}{name_html}
      </div>
    </div>"""

def home_hosts_rows(active=None):
    """The one sample host book every Home/Hosts artboard draws (ADR-0060):
    a bastion carrying one target, nested under it, and one direct host
    beside them. `active` names whichever row that artboard highlights as
    selected, so the four call sites stop drifting from each other by
    hand."""
    return "\n".join([
        group_row("BASTIONS", 2),
        host_row("runic-bastion", "127.0.0.1", kind="jumpServer", active=(active == "runic-bastion"), chevron="expanded"),
        host_row("runic-target-a", None, active=(active == "runic-target-a"), kind="target", via="runic-bastion", depth=1),
        group_row("DIRECT", 1),
        host_row("dev-web", "10.0.1.5", kind="direct", active=(active == "dev-web")),
    ])


def build_home_hosts_topology():
    """ADR-0060's own follow-up: the mockup that won (`nav-proposal-
    topology.html`, one of three throwaway agent-built HTML files, never
    committed) drawn as a real artboard instead, now that a single bastion
    no longer shows the whole shape. A second bastion, collapsed, is the
    row `home_hosts_rows()`'s own single-bastion sample never needed to
    draw: `who` carries the hidden count in place of an address, exactly
    what `HostsSection.tsx` shows for a bastion with nothing expanded. The
    `group` pill on `db-replica` is the other resolved question: a tag
    that used to be a section heading, now riding on one row instead."""
    rows = "\n".join([
        # 7: the 4 rows drawn plus the 3 edge-relay is standing in for while
        # collapsed. The heading counts every host in the section the same
        # way `groupSessions`'s own heading already does, whether or not a
        # fold is currently hiding it.
        group_row("BASTIONS", 7),
        host_row("runic-bastion", "127.0.0.1", kind="jumpServer", chevron="expanded"),
        host_row("runic-target-a", None, active=True, kind="target", via="runic-bastion", depth=1),
        host_row("db-replica", None, kind="target", via="runic-bastion", depth=1, tag="prod"),
        host_row("edge-relay", "3 hosts", kind="jumpServer", chevron="collapsed"),
        group_row("DIRECT", 1),
        host_row("dev-web", "10.0.1.5", kind="direct"),
    ])
    body = hosts_shell(rows, host_detail_panel(), show_filter=True)
    st = status(stat_text("runic-target-a", T['muted'], mono=False), stat_text("8 hosts", T['faint']))
    page_html = f"""
<div style="width: 1440px; height: 900px; display: flex; flex-direction: column; background: {T['base']}; color: {T['ink']}; overflow: hidden; font-size: 13px;">
{plain_titlebar()}
{toolbar_row(right_html=theme_language_toolbar_controls())}
  <div style="flex: 1; min-height: 0; display: flex; align-items: stretch;">
{home_rail(workspace="home")}
{body}
  </div>
{st}
</div>
"""
    write("HomeHostsTopology.dc.html", HEAD + page_html + FOOT)


def build_home_hosts():
    """Home, the host book: General, Topology, Access and Forwarding all on
    one screen, ADR-0056's answer to what ADR-0052 deferred. Replaces the
    wizard's old two navigable steps entirely: `HostsHost.dc.html` and
    `HostsAccess.dc.html`, both retired the same day this landed, since
    reaching Access is no longer a step transition anything can screenshot
    on its own.

    General and Topology sit in a left column; Access and Forwarding sit
    beside them in a second column, the credential picker
    `HostsAccess.dc.html` used to draw behind a click, now always visible.
    One Save button, not a per-step Next: ADR-0056 folded the wizard's old
    Host-to-Access validation into it, since there is no longer a
    transition to gate.

    Forwarding (ADR-0054, #301-305) is accepted now, drawn where the
    formerly-exploratory `HomeBookProposal.dc.html` first tried it: below
    Access, in the same column, at the same width. That artboard's own
    question, whether a fourth section reads correctly there once local/
    remote/dynamic forwards are a real thing a saved host can hold, is
    answered by this being the shipped screen; it is retired rather than
    kept alongside a now-identical General/Topology/Access shape."""
    rows = home_hosts_rows(active="runic-target-a")
    body = hosts_shell(rows, host_detail_panel(), show_filter=True)
    st = status(stat_text("runic-target-a", T['muted'], mono=False), stat_text("11 hosts", T['faint']))
    page_html = f"""
<div style="width: 1440px; height: 900px; display: flex; flex-direction: column; background: {T['base']}; color: {T['ink']}; overflow: hidden; font-size: 13px;">
{plain_titlebar()}
{toolbar_row(right_html=theme_language_toolbar_controls())}
  <div style="flex: 1; min-height: 0; display: flex; align-items: stretch;">
{home_rail(workspace="home")}
{body}
  </div>
{st}
</div>
"""
    write("HomeHosts.dc.html", HEAD + page_html + FOOT)


def build_home_hosts_common_case():
    """ADR-0061's own follow-up: the common case (`nav-proposal-
    progressive.html`'s namesake mockup, one of three throwaway agent-
    built HTML files, never committed) drawn as a real artboard. A plain
    direct host, no bastion, nothing forwarded, is most of the book
    (ADR-0060's own Context); Topology folds to `topology_folded_row()`,
    Forwarding to its own bare "+ Add forward" line, neither drawn in a
    bordered section with nothing in it to justify one. `HomeHosts.dc.html`
    stays the reference for the opposite, fully-expanded case: a host
    whose own data keeps both sections open from the moment it mounts."""
    general = f"""
      <div>{wizard_label('Host')}{wizard_field('10.0.1.5')}</div>
      <div style="display: flex; gap: 12px; margin-top: 14px;">
        <div style="flex: 1;">{wizard_label('User')}{wizard_field('deploy')}</div>
        <div style="width: 90px;">{wizard_label('Port')}{wizard_field('22')}</div>
      </div>
      <div style="margin-top: 14px;">{wizard_label('Name')}{wizard_field('dev-web', mono=False)}</div>
      <div style="margin-top: 14px;">{wizard_label('Group')}{wizard_field('', mono=False, chev=True, placeholder=True)}</div>"""
    rows = home_hosts_rows(active="dev-web")
    body = hosts_shell(rows, host_detail_panel(title="dev-web", general_html=general,
                                                topology_folded=True, forwarding_folded=True),
                        show_filter=True)
    st = status(stat_text("dev-web", T['muted'], mono=False), stat_text("11 hosts", T['faint']))
    page_html = f"""
<div style="width: 1440px; height: 900px; display: flex; flex-direction: column; background: {T['base']}; color: {T['ink']}; overflow: hidden; font-size: 13px;">
{plain_titlebar()}
{toolbar_row(right_html=theme_language_toolbar_controls())}
  <div style="flex: 1; min-height: 0; display: flex; align-items: stretch;">
{home_rail(workspace="home")}
{body}
  </div>
{st}
</div>
"""
    write("HomeHostsCommonCase.dc.html", HEAD + page_html + FOOT)


def topology_folded_row(kind="direct", via=None):
    """ADR-0061: Topology's own collapsed state, a bare line rather than a
    bordered section, since a host using neither a non-direct `kind` nor a
    bastion has nothing here worth a heading. `kind_ic` and the label are
    the same ones `HostKindIcon`/`hostKind.*` already draw everywhere
    else; "Change" opens the full `bordered_section("Topology", ...)`
    below it, in place, on click."""
    label = {"direct": "Direct connection", "target": "Target", "jumpServer": "Jump server"}[kind]
    detail = f' via {via}' if via else ''
    return f"""<div style="display: flex; align-items: center; gap: 8px; padding: 2px 2px;">
      {kind_ic(kind, T['faint'])}
      <span style="font-size: 12.5px; color: {T['ink2']};">{label}{detail}</span>
      <span style="margin-left: auto; font-size: 12px; color: {T['accent']};">Change</span>
    </div>"""


def host_detail_panel(banner_html="", access_html=None, topology_folded=False, forwarding_folded=False,
                       title="runic-target-a", general_html=None):
    """The populated form `HomeHosts.dc.html` and `HomeCollapsed.dc.html`
    both show, factored out once a second artboard needed the identical
    General/Topology/Access/Forwarding panel at a different width.
    `banner_html` is `HomeDeleteConfirm.dc.html`'s own hook: the delete
    question renders inside this same scrollable panel, above the form,
    the same place `SessionWizard.tsx` already puts the discard one.
    `access_html` is `HomeHostsCredential.dc.html`'s own hook (ADR-0057):
    the default below still shows a host with something already stored,
    since that stays worth keeping as the richer reference; the field
    itself is the other Access this same panel can show.

    `topology_folded`/`forwarding_folded` (ADR-0061): a plain direct host
    with nothing forwarded draws neither section in full, the common case
    ADR-0060's own Context already named as most of the book. Default
    `False` for both keeps every existing caller's own bastion-and-
    forwards fixture drawn exactly as it already was. `title`/
    `general_html` follow the same reasoning as `access_html`: a folded
    Topology only makes sense drawn against a host that is actually plain,
    so the artboard that turns the fold on also needs its own General
    fields rather than inheriting `runic-target-a`'s own bastion-routed
    ones."""
    general = bordered_section("General", general_html if general_html is not None else f"""
      <div>{wizard_label('Host')}{wizard_field('target.internal')}</div>
      <div style="display: flex; gap: 12px; margin-top: 14px;">
        <div style="flex: 1;">{wizard_label('User')}{wizard_field('deploy')}</div>
        <div style="width: 90px;">{wizard_label('Port')}{wizard_field('2222')}</div>
      </div>
      <div style="margin-top: 14px;">{wizard_label('Name')}{wizard_field('runic-target-a', mono=False)}</div>
      <div style="margin-top: 14px;">{wizard_label('Group')}{wizard_field('REAL-CHAIN', mono=False, chev=True)}</div>""")
    topology = topology_folded_row() if topology_folded else bordered_section("Topology", f"""
      <div>{wizard_label('Kind')}{kind_picker('target')}</div>
      <div style="margin-top: 14px;">{wizard_label('Reached through')}{wizard_field('runic-bastion', mono=False, chev=True)}</div>""")
    access = bordered_section("Access", access_html if access_html is not None else f"""
      <div role="radiogroup" style="display: flex; gap: 3px; background: {T['input']}; border: 1px solid {T['line']}; border-radius: 8px; padding: 3px;">
        <span style="flex: 1; text-align: center; font-size: 11.5px; font-weight: 600; color: {T['ink']}; background: {T['raised']}; border-radius: 6px; padding: 6px 0;">Password</span>
        <span style="flex: 1; text-align: center; font-size: 11.5px; color: {T['muted']}; padding: 6px 0;">Private key</span>
      </div>
      <div style="margin-top: 12px; display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: {T['raised']}; border-radius: 6px;">
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; color: {T['ok']}; flex: none;" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 11V7a7 7 0 0114 0v4M5 11h14v9H5z"></path></svg>
        <span style="font-size: 11.5px; color: {T['ink2']}; flex: 1; line-height: 1.4;">One is stored in the system keychain. Never shown here, never sent to this window.</span>
      </div>
      <div style="margin-top: 8px;"><span style="font-size: 12px; color: {T['danger']};">Forget it</span></div>""")
    forwarding = (f'<div style="padding: 2px 2px;"><span style="font-size: 12px; color: {T["accent"]};">+ Add forward</span></div>'
                  if forwarding_folded else bordered_section("Forwarding", f"""
      <div style="display: flex; flex-direction: column; gap: 8px;">
        {forward_row('Local', '8080', 'target.internal:80', 'web')}
        {forward_row('Remote', '9000', 'localhost:3000', 'dev server')}
        {forward_row('Dynamic', '1080', None, 'SOCKS')}
      </div>
      <div style="margin-top: 8px;"><span style="font-size: 12px; color: {T['accent']};">+ Add forward</span></div>"""))

    panel = f"""      <div style="height: 100%; padding: 24px 28px; overflow-y: auto;">
        <span style="font-size: 15px; font-weight: 600;">{title}</span>
        {banner_html}
        <div style="display: flex; gap: 40px; margin-top: 22px;">
          <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 22px;">
            {general}
            {topology}
          </div>
          <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 22px;">
            {access}
            {forwarding}
          </div>
        </div>
        <div style="margin-top: 26px; padding-top: 16px; border-top: 1px solid {T['line']};">{wizard_actions(('Delete', False), ('Cancel', False), ('Save', True))}</div>
      </div>"""
    return panel


def empty_host_panel(title, hint):
    """`EmptyPanel.tsx`'s own plain shape (`variant='panel'`): the mark
    beside the wordmark, then a title and a hint, centred. Not
    `Empty.dc.html`'s own richer command-list treatment, which is
    Sessions' further onboarding on top of the same base; every other
    caller (Home's own "no host selected" now among them) gets this
    simpler one."""
    return f"""      <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 40px; padding: 32px;">
        <div style="display: flex; align-items: center; gap: 14px;">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
            <circle cx="9.5" cy="12" r="7" stroke="{T['bstart']}" stroke-width="1.2"></circle>
            <circle cx="14.5" cy="12" r="7" stroke="{T['bend']}" stroke-width="1.2"></circle>
            <path d="M12 6.5v11M12 10l3-2.5M12 14l3 2.5M12 12l-2.6-2.2" stroke="{T['brune']}" stroke-width="1.2" stroke-linecap="round"></path>
          </svg>
          <span style="font-size: 27px; font-weight: 800; color: {T['ink']}; letter-spacing: -0.01em;">Runic SSH</span>
        </div>
        <div style="display: flex; flex-direction: column; align-items: center; gap: 7px;">
          <span style="font-size: 14px; font-weight: 600; color: {T['ink2']};">{title}</span>
          <span style="font-size: 12.5px; color: {T['faint']};">{hint}</span>
        </div>
      </div>"""


def build_home_hosts_empty():
    """The other half of `HomeHosts.dc.html`'s own screen: nothing picked
    yet. Reported directly by the maintainer as a real gap, not a new ask:
    Sessions' equivalent (`Empty.dc.html`) has always carried the brand
    mark, and Home's own text-only version was the one screen that never
    got it. `EmptyPanel.tsx` is the shared component behind both now."""
    rows = home_hosts_rows()
    body = hosts_shell(rows, empty_host_panel("No host selected", "Pick a host on the left to change it, or add one."), show_filter=True)
    st = status(stat_text("No host selected", T['faint']), stat_text("11 hosts", T['faint']))
    page_html = f"""
<div style="width: 1440px; height: 900px; display: flex; flex-direction: column; background: {T['base']}; color: {T['ink']}; overflow: hidden; font-size: 13px;">
{plain_titlebar()}
{toolbar_row(right_html=theme_language_toolbar_controls())}
  <div style="flex: 1; min-height: 0; display: flex; align-items: stretch;">
{home_rail(workspace="home")}
{body}
  </div>
{st}
</div>
"""
    write("HomeHostsEmpty.dc.html", HEAD + page_html + FOOT)


def build_home_collapsed():
    """Home's own sidebar can now hide, the same rail click that already
    toggled `sidebarOpen` for Sessions and SFTP (`ActivityRail.tsx`)
    reported directly by the maintainer as missing here. Shows the form
    still open, not the empty state, the same choice `Collapsed.dc.html`
    already made for Sessions: a list hidden while something real is on
    screen is the case worth drawing, not a list hidden over nothing."""
    st = status(stat_text("runic-target-a", T['muted'], mono=False), stat_text("11 hosts", T['faint']))
    page_html = f"""
<div style="width: 1440px; height: 900px; display: flex; flex-direction: column; background: {T['base']}; color: {T['ink']}; overflow: hidden; font-size: 13px;">
{plain_titlebar()}
{toolbar_row(right_html=theme_language_toolbar_controls())}
  <div style="flex: 1; min-height: 0; display: flex; align-items: stretch;">
{home_rail(workspace="home")}
    <div style="flex: 1; min-height: 0; display: flex;">{host_detail_panel()}</div>
  </div>
{st}
</div>
"""
    write("HomeCollapsed.dc.html", HEAD + page_html + FOOT)


def build_home_delete_confirm():
    """The one question Delete now always asks first. Reported directly by
    the maintainer: it used to remove the host on the spot, the one
    destructive action on this form with nothing in front of it. The same
    inline `role="alertdialog"` shape `SessionWizard.tsx` already uses for
    a discarded draft, not `SftpDeleteConfirm`'s own full-screen
    `SessionSurface`: this question lives inside the form it is about, the
    same place the discard one already does, rather than taking over the
    session rectangle SFTP's own delete has no form to live inside of."""
    rows = home_hosts_rows(active="runic-target-a")
    banner = f"""<div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap; background: {T['dangersoft']}; border: 1px solid {T['danger']}; border-radius: 6px; padding: 8px 12px; margin-top: 14px;">
        <span style="font-size: 12px; color: {T['danger']}; flex: 1;">Delete runic-target-a? This cannot be undone.</span>
        <span style="font-size: 12px; padding: 4px 10px; border: 1px solid {T['line2']}; border-radius: 4px; color: {T['ink2']};">Cancel</span>
        <span style="font-size: 12px; font-weight: 600; padding: 4px 10px; border: 1px solid {T['danger']}; border-radius: 4px; color: {T['danger']};">Delete</span>
      </div>"""
    body = hosts_shell(rows, host_detail_panel(banner), show_filter=True)
    st = status(stat_text("runic-target-a", T['muted'], mono=False), stat_text("11 hosts", T['faint']))
    page_html = f"""
<div style="width: 1440px; height: 900px; display: flex; flex-direction: column; background: {T['base']}; color: {T['ink']}; overflow: hidden; font-size: 13px;">
{plain_titlebar()}
{toolbar_row(right_html=theme_language_toolbar_controls())}
  <div style="flex: 1; min-height: 0; display: flex; align-items: stretch;">
{home_rail(workspace="home")}
{body}
  </div>
{st}
</div>
"""
    write("HomeDeleteConfirm.dc.html", HEAD + page_html + FOOT)


def build_home_hosts_credential():
    """ADR-0057: the field itself, not just tabs and a hint (#327's own
    stopgap), for a host with nothing stored yet. The same uncontrolled
    field `InlineCredentialForm.tsx` used to render only after Save, now
    part of Access from the start; read once, on Save, and never sent
    until the host key that same click resolves is confirmed. The bastion
    mid-chain case (ADR-0033) is untouched and draws nothing here."""
    rows = home_hosts_rows(active="runic-target-a")
    access = f"""
      <div role="radiogroup" style="display: flex; gap: 3px; background: {T['input']}; border: 1px solid {T['line']}; border-radius: 8px; padding: 3px;">
        <span style="flex: 1; text-align: center; font-size: 11.5px; font-weight: 600; color: {T['ink']}; background: {T['raised']}; border-radius: 6px; padding: 6px 0;">Password</span>
        <span style="flex: 1; text-align: center; font-size: 11.5px; color: {T['muted']}; padding: 6px 0;">Private key</span>
      </div>
      <div style="margin-top: 14px;">
        {wizard_label('Password')}
        <div style="height: 32px; background: {T['input']}; border: 1px solid {T['line2']}; border-radius: 6px; display: flex; align-items: center; padding: 0 10px;">
          <span style="font-size: 14px; letter-spacing: 2px; color: {T['ink']};">&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;</span>
        </div>
      </div>
      {wizard_hint('In the system keychain, until I remove it.')}"""
    body = hosts_shell(rows, host_detail_panel(access_html=access), show_filter=True)
    st = status(stat_text("runic-target-a", T['muted'], mono=False), stat_text("11 hosts", T['faint']))
    page_html = f"""
<div style="width: 1440px; height: 900px; display: flex; flex-direction: column; background: {T['base']}; color: {T['ink']}; overflow: hidden; font-size: 13px;">
{plain_titlebar()}
{toolbar_row(right_html=theme_language_toolbar_controls())}
  <div style="flex: 1; min-height: 0; display: flex; align-items: stretch;">
{home_rail(workspace="home")}
{body}
  </div>
{st}
</div>
"""
    write("HomeHostsCredential.dc.html", HEAD + page_html + FOOT)


def theme_language_toolbar_controls():
    """ADR-0059: folded behind one button each, not drawn flat. The first
    cut (ADR-0052) put every choice as its own chip, seven of them, citing
    `split_control()`/`select_all_button()` as the reason to keep them
    undisguised in the bar rather than behind a gear. Comparing directly
    against what those two controls actually do (`SftpSplitControl`,
    `ShapeControl`) found neither draws its own choices flat: both fold
    behind one button showing the current choice, opening the rest only on
    click. This draws that shape instead: one button with the theme icon
    currently in use (dark, matching this artboard), one with the current
    locale's flag, separated by the same hairline as before."""
    dark_ic = '<path d="M20 13.8A8.5 8.5 0 1110.2 4a6.8 6.8 0 009.8 9.8z" stroke-linejoin="round"></path>'

    def fold_button(inner, size=14):
        return (f'<span style="width: 24px; height: 24px; border-radius: 4px; border: 1px solid {T["line"]};'
                f' display: flex; align-items: center; justify-content: center; color: {T["ink2"]};">'
                f'{inner}</span>')

    theme = fold_button(f'<svg viewBox="0 0 24 24" style="width: {14}px; height: 14px;" fill="none" stroke="currentColor" stroke-width="1.6">{dark_ic}</svg>')
    lang = fold_button('<span style="font-size: 12px;">&#127463;&#127479;</span>')
    sep = f'<div style="width: 1px; height: 20px; background: {T["line"]};"></div>'
    return f'<div style="display: flex; align-items: center; gap: 10px;">{theme}{sep}{lang}</div>'

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
    write("HostKeyChanged.dc.html", page(grid, sidebar_shell(sessions_header(), rows), home_rail(workspace="sessions", badge="2"), st))

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
    write("Failure.dc.html", page(grid, sessions_sidebar(active="web-01", states={"web-01": "ok"}), home_rail(workspace="sessions", badge="2"), st))

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
                                       sidebar_shell(hdr, rows), home_rail(workspace="sessions", badge="3", armed=True), st))

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
                                  sessions_sidebar(active="web-01", states={"web-01": "ok", "db-prod": "ok"}), home_rail(workspace="sessions", badge="2"), st))

# ---------- the terminal's own MOTD, printed once when a shell connects
MOTD_ART = [
    '              ≈≈≈≈≈≈≈≈≈≈≈≈   ≈≈≈≈≈≈≈≈≈≈≈≈',
    '           ≈≈≈≈≈        ≈≈≈≈≈≈≈  ≈≈≈   ≠≈≈≈≈',
    '         ≈≈≈≈           ≈≈≈≈≈≈≈≈≈≈  ≈≈≈   ≈≈≈≈',
    '        ≈≈≈           ≈≈≈≈   ≈≈≈≈ ≈≈≈≈      ≈≈≈',
    '       ≈≈≈          ≈≈≈≈≈  ≈≈≈≈≈≈≈≈≈         ≈≈≈',
    '       ≈≈≈        ≈≈≈≈≈≈≈≈≈≈≈≈ ≈≈ ≈≈≈≈        ≈≈≈',
    '       ≈≈       ≈≈≈≈  ≈≈≈≈≈ ≈≈∞≈≈  ≈≈≈≈       ≈≈≈',
    '       ≈≈≈        ≈≈≈≈≈≈≈≈≈≈≈≈ ≈≈ ≈≈≈≈        ≈≈≈',
    '       ≈≈≈         ≈≈≈≈≈≈≈ ≈≈≈≈≈≈≈≈≈         ≈≠≠',
    '        ≈≈≈       ≈≈≈≈≈≈≈≈   ≈≈≈≈≈          ≈≈≈',
    '         ≠≈≈≈    ≈≈≈ ≈≈≈≈≈≈≈≈≈≈           ≈≈≈≈',
    '           ≈≈≈≈≈   ≈≈≈≈  ≈≈≈≈∞≈         ≈≈≠≈',
    '              ≈≈≈≈≈≈≈≈≈≈≈≈    ≈≈≈≈≈≈≈≈≈≠≠',
]
# The maintainer's own conversion, via asciiart.eu/image-to-ascii, of the
# brand mark. Kept verbatim (not re-traced from the SVG paths the way
# `MARK`/`KIND_ICON` above are) since the shading technique, density of `≈`
# standing in for the two circles' overlap, is not something the path data
# gives for free; recorded here so a future resize starts from the same
# source image and tool rather than guessing at a second conversion.

MOTD_WIDTH = max(len(line) for line in MOTD_ART)

def motd_art_lines_html():
    """Colours `MOTD_ART` by column rather than by circle: there is no
    per-character record of which of the two source circles a given `≈`
    belonged to, only the finished raster. Left of centre reads as circle
    A (`bstart`, the same cyan `MARK`'s left ring already strokes), right
    of centre as circle B (`bend`, the same purple), and every `∞`/`≠`,
    the asciiart.eu conversion's own way of marking a brighter crossing
    point, in `brune`, the rune line's own colour in `MARK` and
    `KIND_ICON` alike. A per-character split is cruder than the real
    stroke boundary, but the source has no sharper line to cut along.
    Returns one HTML string per row, not one joined block: `motd_row()`
    below pairs each against its own line of the info column."""
    center = MOTD_WIDTH / 2
    rows = []
    for line in MOTD_ART:
        segments = []
        color = None
        text = ''
        for i, ch in enumerate(line):
            this_color = T['brune'] if ch in '∞≠' else (T['bstart'] if i < center else T['bend'])
            if this_color != color:
                if text:
                    segments.append((color, text))
                color, text = this_color, ch
            else:
                text += ch
        if text:
            segments.append((color, text))
        rows.append(''.join(f'<span style="color: {c};">{t}</span>' for c, t in segments))
    return rows

def motd_field(label, value):
    return (f'<span style="color: {T["faint"]};">{label:<9}</span>'
            f'<span style="color: {T["ink2"]};">{value}</span>')

def motd_row(art_html, info_html=''):
    """One printed line: the art column at a fixed character width so the
    info column lines up whatever a given row of `MOTD_ART` actually
    contains, then whatever that row of the info block says, or nothing.
    A real write does the same alignment with spaces rather than a fixed
    `<span>` width; the visible result is the same, monospace either way."""
    return (f'<div style="display: flex;">'
            f'<span style="display: inline-block; width: {MOTD_WIDTH + 2}ch; flex: none;">{art_html}</span>'
            f'<span>{info_html}</span></div>')

def build_terminal_motd():
    """ADR-0051, accepted and shipped: the brand banner `use-terminal.ts`
    writes into `xterm.js` the moment a shell connects, between
    `terminal.open(container)` and `watchTerminal`/`openTerminal`, the
    calls that let a remote byte arrive at all. A write placed there
    always lands first, so it can never race a server's own real
    `/etc/motd`, which some hosts already send down the same channel.

    Side by side, `neofetch`'s own logo-left, text-right layout, once the
    terminal is wide enough for both (Option B over always-stacked or
    always-side-by-side; see the ADR). `src/features/terminal/motd.ts`'s
    `motdBanner` makes the same call this artboard draws, from the real
    art width, the real field text, and `terminal.cols`; this artboard is
    the wide case, the one a maximized window actually shows.

    The info column names a jump host, when there is one:
    `bastionName(session, sessions)` (`src/features/sessions/jump.ts`)
    answers exactly this, the same function `SessionsSidebar`'s own "via"
    row already reads. Omitted entirely for a direct connection, the same
    "say nothing rather than say none" rule `bastionName` already returns
    `null` for.

    Colour: `motd_art_lines_html()`'s `bstart`/`bend`/`brune` are the exact
    three colours `MARK` already strokes the real mark with, so the banner
    reads as the same brand identity already drawn everywhere else, not a
    fourth palette invented for the terminal alone. The shipped write uses
    the terminal's own existing ANSI slots instead (blue/cyan/magenta),
    which repaint for free on a theme change; this artboard, like the rest
    of the canvas, is still drawn from the design tokens directly."""
    art_rows = motd_art_lines_html()
    info_rows = [
        f'<span style="color: {T["ink"]}; font-weight: 700;">Runic SSH</span>',
        '',
        motd_field('Host', 'web-01.internal'),
        motd_field('Address', '10.4.1.20:22'),
        motd_field('Via', 'bastion-01'),
        motd_field('User', 'deploy'),
    ]
    rows = [
        motd_row(art_rows[i], info_rows[i] if i < len(info_rows) else '')
        for i in range(len(art_rows))
    ]
    # Joined with nothing, not '\n': each row is already its own <div>, a
    # block element that breaks its own line, and .term's white-space: pre
    # renders a literal '\n' between them as one more line break on top of
    # that, exactly the doubled gap spotted live in this artboard's first render.
    motd = ''.join(rows) + '\n\n'
    g = group(strip([tab("web-01", state="on")]),
              term(motd + prompt("deploy", "web-01") + CURSOR))
    rows_sidebar = "\n".join([group_row("PRODUCTION", 3), host_row("web-01", "deploy@10.4.1.20", "ok", True, via="bastion-01")])
    st = status(stat_session("deploy@10.4.1.20"), stat_text("198 x 48"))
    write("TerminalMotd.dc.html",
          page(f'      <div style="flex: 1; min-height: 0; display: flex;">{g}</div>',
               sidebar_shell(sessions_header(), rows_sidebar), home_rail(workspace="sessions", badge="1"), st))

if LIGHT_MODE:
    _w = write
    write = lambda name, content: _w("MainLight.dc.html", content)
    build_main()
else:
    for fn in (build_empty, build_main, build_groups, build_collapsed, build_broadcast,
               build_hostkey, build_sftp, build_sftp_workspace, build_sftp_fanout, build_sftp_proposal,
               build_sftp_proposal_broadcast, build_sftp_file_ops, build_sftp_folder_copy,
               build_sftp_selection, build_sftp_delete_confirm,
               build_terminal_motd,
               build_sessions_proposal, build_sessions_proposal_broadcast,
               build_sessions_proposal_broadcast_multi,
               build_home_hosts, build_home_hosts_common_case, build_home_hosts_empty, build_home_collapsed, build_home_delete_confirm,
               build_home_hosts_credential, build_home_hosts_topology,
               build_anatomy, build_tokens,
               build_hostkeychanged, build_failure, build_paste, build_palette):
        fn()
