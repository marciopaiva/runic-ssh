# Changelog

Notable changes, kept by hand. The commits are conventional and the history is
linear, so a generated list is always available from `git log`; this file is for
the things a person needs to know before installing or upgrading, which is a
different list and a much shorter one.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
versions follow [semantic versioning](https://semver.org/spec/v2.0.0.html),
with the caveat that anything below 1.0 may break, and this project intends to.

## [Unreleased]

## [0.1.1] — 2026-08-23

Copy and paste, which v0.1.0 shipped without. A terminal you cannot get text out
of is not one you can work in, and this was the first thing the release ran into
in daily use.

### Added

- **Copy and paste in the terminal.** Ctrl-C copies when text is selected and
  interrupts when nothing is, which is the behaviour of every terminal that
  offers both. Ctrl-V pastes. Ctrl-Shift-C and Ctrl-Shift-V always mean the
  clipboard whatever is on screen, so there is a binding that never has to
  choose. On macOS the command key does the clipboard and Ctrl-C is left alone.
- **A confirmation before a multi-line paste** the remote shell has not
  bracketed, showing the lines that are about to run. A shell executes each line
  of a paste as it arrives, so pasted text with a line break in it runs without
  anybody pressing Return.
- The exit line under a closed session is translated, rather than English in
  every locale.

### Fixed

- **A paste larger than 32 KiB no longer disappears.** The core refuses any
  single input above that limit, and the refusal landed on a promise nobody
  awaited, so pasting a private key did nothing at all and said nothing about
  it. Input is now split to stay inside the limit and delivered in order.

### Security

- Copy and paste use the browser's own clipboard events, raised by the
  keystroke. No clipboard plugin, no new permission, and the capability set is
  still the six entries ADR-0013 settled on. The plugin route was refused
  because it grants the ability to read the system clipboard at any moment to
  the document that renders hostile output (ADR-0018).
- Copying moves terminal contents to the system clipboard, where any local
  process can read them. That is deliberate, asked for by the person at the
  keyboard, and now written into `docs/security-model.md` rather than left
  implicit.
- The Spanish string for the paste confirmation describes a security decision
  and has not been reviewed by a native speaker. Spanish is still held out of
  the language selector for exactly this reason (#4).

### Known limitations

- A selection left on screen costs one Ctrl-C: the first press copies it, and
  the second interrupts. Ctrl-Shift-C always copies for anyone who would rather
  never spend that press. ADR-0018 records why clearing the selection on every
  write from the host was rejected.
- There is no context menu on the terminal yet, so copy and paste are
  keyboard-only and a person who does not know the convention will not find
  them.

## [0.1.0] — 2026-08-23

First packaged release. It connects, and that is the claim: an SSH client that
opens a verified session and gives you a terminal on it. Pre-release, and
deliberately labelled one.

### Added

- **SSH sessions** over `russh`, with no OpenSSH process spawned (ADR-0003).
  One terminal per session, kept mounted across tab switches, and a second shell
  on one connection is refused rather than silently abandoning the first
  (ADR-0014).
- **Host key verification** with a screen per outcome. An unknown key prompts
  with its fingerprint and the trust button starts inert until you confirm you
  checked it out of band. A changed key blocks and takes the host name typed
  back before it will replace anything. `@revoked` and `@cert-authority` refuse
  outright, with no override offered. `known_hosts` is parsed here rather than
  shelled out to (ADR-0009).
- **Credentials collected in a window of their own**, destroyed after use, and
  referenced across the IPC boundary by opaque id. The secret is resolved
  against the OS keychain at the moment of use and never travels toward the
  frontend (ADR-0004, ADR-0008). Password or private key, with optional storage
  in the system keychain.
- **Saved hosts**, grouped, with a form per host on its own tab (ADR-0017) and
  unsaved work marked on the tab it belongs to.
- **A command palette** on `Ctrl+Shift+P`, reaching sessions, the host editor,
  the window controls and the settings.
- **Three locales**, English, Brazilian Portuguese and neutral Spanish, from
  typed error codes, with no i18n dependency (ADR-0007). Spanish ships in the
  tree and is **not offered in the selector**: its security copy has not been
  reviewed by a native speaker (#4).
- **Light and dark themes** resolved from one token set, following the system.
- **Our own window chrome**, with the native title bar available as a setting
  for anyone whose window manager needs it (ADR-0005).
- **A status bar** carrying connection state, round-trip latency, bytes moved,
  and the terminal's grid. Every connection state is distinguished by shape
  before colour, so it survives greyscale and colour blindness.
- Installers for Linux (`.deb`, `.rpm`, `.AppImage`), Windows (`.msi`, `.exe`)
  and macOS (`.dmg`, `.app`), with a `SHA256SUMS` that is checked against the
  bytes after they leave the build machines.

### Security

- **RSA private keys are refused.** RUSTSEC-2023-0071 is a timing attack on RSA
  private key operations with no fixed version available, and signing is the
  operation it reaches. Verifying an RSA *host* key stays supported, because
  that is a public-key operation and is not what the advisory attacks
  (ADR-0010). An Ed25519 or ECDSA key works.
- **No telemetry, no crash reporting, no update ping.** Nothing leaves the
  machine that was not asked for.
- **Nothing secret is logged**, at any level, including in errors returned to
  the interface.
- Tauri permissions are named one by one rather than taken as plugin default
  sets (ADR-0013).
- **The installers are not signed.** Windows will show SmartScreen and macOS
  will call the application damaged. Both are described, with the commands to
  work around them, in `docs/installing.md`.

### Known limitations

- **No SFTP and no port forwarding.** Both are designed and neither is built.
- **Nobody has installed a release build.** The packages that have been run were
  built on the machines that ran them, which is a different claim.
  `docs/installing.md` keeps the two apart, per platform.
- **macOS is entirely unexercised.** The `.dmg` builds on every run and no
  human has opened it.
- Windows 11 **Snap Layouts** does not offer its flyout from the maximise
  button, because the drawn title bar does not answer `WM_NCHITTEST`. Snapping
  into a zone works by every other route (#28).
- A connection gives up after twenty seconds (ADR-0016). That number is a
  choice, not a measurement, and there is no setting for it yet.

[Unreleased]: https://github.com/marciopaiva/runic-ssh/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/marciopaiva/runic-ssh/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/marciopaiva/runic-ssh/releases/tag/v0.1.0
