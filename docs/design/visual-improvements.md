# Visual improvements proposal

Status: proposal. No behaviour change yet.

This document records the visual direction discussed for making Runic SSH denser
and safer for people who open dozens of sessions a day. It is written so a
change can be reviewed against the reasons rather than against a mockup that
has already aged.

## Goals

1. **More useful density** on the status bar and sidebar without increasing
   cognitive load.
2. **Louder safety signals** for the two controls whose blast radius is larger
   than one host: host-key trust and broadcast typing.
3. **Keep the existing token set and dark-first design.** New colour is not
   the answer; clearer hierarchy and stronger affordances are.

## Status bar

### Current state

The bar already carries connection state, latency grade (shape + colour),
transfer volume, terminal size, encoding, term type, palette hint, and a loud
broadcast button when armed. That is correct.

### Proposed addition

When a session is active, surface the session identity next to the state marker:

```
[● Connected]  web-01 · root@10.0.1.42:22   |  42ms  ↑… ↓…  |  80×24  |  [Broadcast OFF]
```

Why: with four panes open the shell prompt is the only thing saying which host
a rectangle belongs to, and remote `PS1` is not under our control. The status
bar is the one place that is always visible and already owned by the window
rather than by a single pane.

Implementation notes:

- Pass the active session's display label (already computed as `paneLabel`) into
  `StatusBar`.
- Truncate aggressively; the bar must never wrap.
- Keep the existing order of cells. Identity sits immediately after the state
  marker so the eye that is already looking at the green/yellow/red marker also
  sees *which* host it refers to.

## Host key prompt

### Current state

The unknown-key screen already starts with the Trust button inert and requires
an explicit out-of-band verification checkbox. That is the important part and
must not be weakened.

### Proposed addition

Reserve space for an SSH randomart (Drunken Bishop) next to the fingerprint.

Why: many sysadmins recognise a key by its randomart faster than by reading a
SHA-256 string. OpenSSH already prints one; showing the same picture here
makes the out-of-band check cheaper.

Implementation notes:

- Randomart generation belongs in the core (pure function over the key blob).
- The frontend only receives the finished ASCII grid (or a small SVG).
- Layout already uses a definition list; the randomart can sit as a sibling
  column without changing the inert-button rule.

## Sidebar density

### Current state

Groups, status markers, name + host. Clean and readable.

### Proposed additions (non-breaking)

- Relative last-connected time (`2h ago`) when the data is available.
- Small auth indicator (key vs password) using the existing icon language.
- Keep the current 264 px width; do not grow the sidebar to fit more columns.

These are pure presentational. No new IPC is required if the session record
already carries the necessary fields; otherwise they wait for a later data
change.

## Broadcast typing indicators

### Current state

- Off by default, disarms on pane-set change.
- Status-bar button is already loud (warn soft background + icon).
- Receiving panes get a distinct edge colour.

### Proposed reinforcement

- When armed, the status-bar button becomes the primary visual focus of the
  entire chrome (larger hit target, stronger contrast).
- Keep the existing "spared" checkbox in the pane header; do not move the
  opt-out into a modal.

No new behaviour. Only weight and contrast.

## What this proposal deliberately does not do

- No new colours beyond the existing token set.
- No change to the host-key trust model or the inert-button rule.
- No cloud themes, no decorative illustrations inside the working surfaces.
- No increase of the sidebar width.

## Next steps

1. Status-bar identity cell (this branch).
2. Randomart plumbing (core + IPC + HostKeyPrompt) under its own ADR if the
   key-blob shape needs discussion.
3. Sidebar density once last-connected timestamps exist in the session record.

Each step should ship with the ordinary gate and, where behaviour changes, a
test that pins the new presentation.
