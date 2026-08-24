# Visual improvements proposal

Status: **implemented on `feat/visual-improvements`** (except sidebar density).

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

---

## 2. Host key prompt — randomart

### Status on this branch

**Done.** Drunken Bishop randomart is drawn beside the fingerprint on the
unknown-host-key screen.

### Why

Many sysadmins recognise a key by its randomart faster than by reading a
SHA-256 string. Making the out-of-band check cheaper does not make it optional.

### Implementation notes (landed)

- Pure function in `src/lib/randomart.ts` over the fingerprint string the core
  already sends (`SHA256:…` or hex).
- `Randomart` component omits itself when the fingerprint cannot be decoded.
- Trust stays **inert** until the out-of-band checkbox is ticked.
- Localised label (`hostKey.field.randomart`) in en / pt-BR / es.
- Tests in `tests/randomart.test.ts` pin decoding and a stable grid.

### Explicit non-goals (still hold)

- No “Trust once” / temporary accept path.
- No auto-trust, no TOFU.
- No change to changed / revoked / certificate behaviour.

---

## 3. Broadcast typing — stronger chrome signal

### Status on this branch

**Done.** The disarm button uses a stronger border, larger hit target, and
bolder weight within the existing warn tokens.

### Behaviour unchanged

- Off by default; never persisted.
- Disarms whenever the set of panes changes.
- Per-pane spare checkbox stays in the pane header.

---

## 4. Sidebar density

### Status

**Not implemented.** Blocked on session-record fields (last-connected timestamp,
opaque credential type). Documented for a later change.

---

## What this proposal deliberately does **not** do

- No new colours beyond the existing token set in `tokens.css`.
- No change to the host-key trust model or the inert-button rule.
- No SFTP UI, tunnel UI, or ProxyJump UI.
- No cloud sync, no decorative illustrations inside working surfaces.
- No increase of the sidebar width.
- No telemetry or crash-reporting UI.

---

## Implementation order on this branch

| Step | Item | Status |
| --- | --- | --- |
| 1 | Status-bar identity cell | **Done** |
| 2 | Broadcast button contrast reinforcement | **Done** |
| 3 | Host-key randomart | **Done** |
| 4 | Sidebar density | Blocked on data fields |

Each step ships with the ordinary gate (`cargo fmt`, `clippy`, `cargo test`,
`pnpm typecheck`, `pnpm test`).

---

## How to test (for Claude / reviewers)

```bash
pnpm install
pnpm typecheck
pnpm test
cd src-tauri && cargo fmt --all -- --check && cargo clippy --all-targets --all-features -- -D warnings && cargo test
pnpm tauri dev
```

Manual checks:

1. Connect to a host → status bar shows `name · user@host` after the state marker.
2. Split into 2+ panes, arm broadcast → disarm button is loud; click disarms.
3. Connect to a never-seen host → unknown host key shows fingerprint **and**
   randomart; Trust stays disabled until the checkbox is ticked.
4. Narrow the window → status bar does not wrap.

---

## Review checklist

1. Does it stay inside the existing token set?
2. Does it leave the host-key inert-Trust rule intact?
3. Does broadcast remain off-by-default and self-disarming?
4. Does the status bar still fit on a narrow window without wrapping?
5. Is any new string localised (en + pt-BR at minimum)?
