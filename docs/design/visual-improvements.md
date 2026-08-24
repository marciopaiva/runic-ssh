# Visual improvements proposal

Status: **in progress on `feat/visual-improvements`**.

This document is the complete visual proposal for Runic SSH based on what the
application already does today (v0.1.1 + unreleased split panes and broadcast
typing). It is written so a reviewer can accept or reject each piece against
the current product, not against a roadmap slide.

Nothing here invents SFTP, ProxyJump, port forwarding, or themes. Those remain
roadmap items. This proposal only tightens density and safety signals on the
surfaces that already ship.

---

## What already works (baseline)

These are the working surfaces this proposal builds on. They are not aspirational.

| Surface | What it already does |
| --- | --- |
| **Main window** | Custom chrome (ADR-0005), sidebar + terminal panel + status bar |
| **Sessions sidebar** | Grouped hosts, status markers by shape + colour, name + host, context menu |
| **Terminal** | One xterm per session (ADR-0014), kept mounted across tab switches |
| **Split panes** | 1 / 2 columns / 2 rows / 2×2 grid; each pane has its own header label |
| **Broadcast typing** | Off by default; disarms on pane-set change; per-pane spare; status-bar disarm button |
| **Host key unknown** | Fingerprint shown; Trust button inert until out-of-band checkbox |
| **Host key changed** | Blocked; requires typing the host name back |
| **Host key revoked / cert** | Refused with no override |
| **Status bar** | State marker, latency grade (bars + colour), transfer, size, encoding, term, palette hint, broadcast button |
| **Command palette** | `Ctrl+Shift+P` / `⌘⇧P`, sessions + actions |
| **Themes** | Dark default, light via system or settings; single token set |
| **Locales** | English + Brazilian Portuguese (Spanish held for security-copy review) |

Design tokens live only in `src/styles/tokens.css`. No component invents a colour.

---

## Goals

1. **More useful density** on the status bar and sidebar without increasing
   cognitive load or growing the chrome.
2. **Louder safety signals** for the two controls whose blast radius is larger
   than one host: host-key trust and broadcast typing.
3. **Keep the existing token set and dark-first design.** Clearer hierarchy and
   stronger affordances, not new colours.
4. **Ship in small, reviewable steps** that pass the ordinary gate.

---

## 1. Status bar — session identity

### Status on this branch

**Done.** The focused session’s name and `user@host[:port]` now appear
immediately after the connection marker.

```
[● Connected]  web-01  root@10.0.1.42:22   |  42ms  ↑… ↓…  |  80×24  |  [SYNC 3]
```

### Why

With four panes the shell prompt is otherwise the only thing saying which host
a rectangle belongs to, and remote `PS1` is not under our control. The status
bar is always visible and already owns window-level state.

### Implementation notes (landed)

- `paneLabel()` already produced `{ name, where }` for pane headers.
- `StatusBar` now accepts `identity: PaneLabel | null`.
- `App` passes the label of the focused session.
- Aggressive truncation (`max-w`) so the bar never wraps.
- Order of cells unchanged: identity sits right after the state marker.

### Follow-ups (optional, same area)

- Click identity to copy `user@host:port` to the clipboard (browser clipboard
  events only — same rule as terminal copy, ADR-0018).
- When broadcast is armed, keep showing the *focused* identity; do not try to
  list every receiving host (that is what the SYNC button and pane edges are for).

---

## 2. Host key prompt — randomart

### Current state

The unknown-key screen already:

- Shows host, key type, SHA-256 fingerprint.
- Keeps Trust **inert** until the out-of-band checkbox is ticked.
- Lives inside the session’s own panel (ADR-0015), not a floating modal.

That trust model is the important part and **must not be weakened**.

### Proposed addition

Show an SSH randomart (Drunken Bishop) next to the fingerprint, the same
picture OpenSSH prints with `VisualHostKey`.

### Why

Many sysadmins recognise a key by its randomart faster than by reading a
SHA-256 string. Making the out-of-band check cheaper does not make it optional.

### Implementation notes

- Generation belongs in the **core** (pure function over the key blob / fingerprint).
- Frontend only receives a finished grid (string lines or a tiny SVG).
- Layout: the existing definition list can gain a sibling column; the inert
  Trust button and checkbox stay exactly as they are.
- Needs a small IPC field on the host-key decision payload. If the shape of
  that payload is non-trivial, write a short ADR first.

### Explicit non-goals for this item

- No “Trust once” / temporary accept path.
- No auto-trust, no TOFU.
- No change to changed / revoked / certificate behaviour.

---

## 3. Broadcast typing — stronger chrome signal

### Current state (already correct)

- Off by default; never persisted.
- Disarms whenever the set of panes changes.
- Status-bar button is already loud (`bg-warn-soft`, icon, `SYNC {count}`).
- Receiving panes get a distinct edge; spared panes do not.
- Per-pane spare checkbox in the pane header.

### Proposed reinforcement (presentation only)

When armed:

1. Make the status-bar disarm button the **primary visual focus** of the chrome
   (slightly larger hit target, stronger border / contrast within the existing
   warn tokens).
2. Optionally a one-line status-bar caption under the button area is *not*
   needed; the existing `status.sync.on` string is enough.
3. Keep the spared checkbox where it is. Do not move opt-out into a modal.

No new behaviour. Only weight and contrast so that “I am typing to three hosts”
cannot be missed at a glance.

---

## 4. Sidebar density

### Current state

Groups, status markers (shape + colour), session name, host. Width 264 px.
Clean and readable.

### Proposed additions (presentational, when data exists)

| Addition | Depends on | Notes |
| --- | --- | --- |
| Relative last-connected (`2h ago`) | Session record must carry a timestamp | Pure presentational once the field exists |
| Small auth indicator (key vs password) | Whether we already know credential *type* without resolving the secret | Must never reveal the secret; opaque type only |
| Keep width at 264 px | — | Do not grow the sidebar to fit more columns |

If the session record does not yet carry last-connected or credential-type
metadata, these items wait. They are not blockers for the rest of this proposal.

### Explicit non-goals for the sidebar

- No multi-column layout.
- No nested folders beyond the existing group name.
- No live terminal preview in the row.

---

## 5. Pane headers and edges (already largely done)

Unreleased split work already puts the session name + `user@host` on each pane
header and uses a distinct edge for broadcast receivers. This proposal does not
change that model.

Optional polish only:

- Ensure the “spared” state remains visually quieter than “receiving”.
- Keep focus edge subordinate to the broadcast edge (already the rule in
  `paneEdge`).

---

## What this proposal deliberately does **not** do

- No new colours beyond the existing token set in `tokens.css`.
- No change to the host-key trust model or the inert-button rule.
- No SFTP UI, tunnel UI, or ProxyJump UI (those need product features first).
- No cloud sync, no decorative illustrations inside working surfaces.
- No increase of the sidebar width.
- No telemetry or crash-reporting UI.
- No Spanish security strings until a native review lands (#4).

---

## Implementation order on this branch

| Step | Item | Status |
| --- | --- | --- |
| 1 | Status-bar identity cell | **Done** on this branch |
| 2 | Broadcast button contrast reinforcement | Next, pure CSS / class weights |
| 3 | Host-key randomart (core + IPC + UI) | Needs small design discussion / ADR if payload shape grows |
| 4 | Sidebar density | Blocked on data fields; document only until then |

Each step ships with the ordinary gate (`cargo fmt`, `clippy`, `cargo test`,
`pnpm typecheck`, `pnpm test`). Behaviour changes get a test that pins the new
presentation.

---

## Review checklist

When reviewing a change from this proposal:

1. Does it stay inside the existing token set?
2. Does it leave the host-key inert-Trust rule intact?
3. Does broadcast remain off-by-default and self-disarming?
4. Does the status bar still fit on a narrow window without wrapping?
5. Is any new string localised (en + pt-BR at minimum)?

If the answer to any of 1–4 is no, the change is out of scope for this proposal.
