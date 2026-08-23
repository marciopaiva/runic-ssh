<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="assets/logo-light.png">
    <img src="assets/logo-dark.png" alt="Runic SSH" width="430">
  </picture>
</p>

<p align="center">
  <strong>A modern, fast, and secure cross-platform SSH/SFTP client built with Rust and Tauri.</strong>
</p>

<p align="center">
  <a href="https://github.com/marciopaiva/runic-ssh/actions/workflows/gate.yml"><img src="https://github.com/marciopaiva/runic-ssh/actions/workflows/gate.yml/badge.svg" alt="Gate"></a>
  <a href="https://github.com/marciopaiva/runic-ssh/actions/workflows/audit.yml"><img src="https://github.com/marciopaiva/runic-ssh/actions/workflows/audit.yml/badge.svg" alt="Advisories"></a>
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey" alt="Platform">
</p>

## 🎯 About

**Runic SSH** was born to be the modern replacement for PuTTY and for heavyweight clients such as MobaXterm. Built for developers, DevOps engineers, and sysadmins, it pairs the native performance of Rust with a modern, customizable interface.

### ✨ Key Features

- 🚀 **Ultra lightweight:** a Rust backend (Tauri) that uses a fraction of the memory required by Electron based alternatives.
- 🔒 **Encrypted local vault:** your keys and passwords never leave your machine without your permission (backed by DPAPI, Keychain, and libsecret).
- 🖥️ **Truly cross platform:** the same fluid experience on Windows, macOS, and Linux.
- 📂 **Built in SFTP:** dual pane file management, with no need for external tools.
- 🪄 **Productivity:** split panes, a command palette (`Ctrl+Shift+P`), and saved command snippets.
- 🤖 **AI assistant (coming soon):** command suggestions and error explanations right inside the terminal.

## 🚦 Status

**Pre-alpha, and it connects.** On 2026-08-23 a packaged build installed from
the `.deb` verified an unknown host key against its real fingerprint, prompted
for a password in its own window, opened a shell on an OpenSSH server and ran a
command in it.

On the same day the Windows installer was built on a Windows 11 machine and
run through the same path, from an installer nobody had ever run to a shell.

Not there yet: SFTP, port forwarding, and a signed installer of any kind. The
macOS package builds on every run and **no one has installed it** — see
[`docs/installing.md`](docs/installing.md).

Work is tracked in [issues](https://github.com/marciopaiva/runic-ssh/issues) and
the decisions behind it in [`docs/adr/`](docs/adr/).

## 📸 What it looks like

Both captures are of the packaged application connected to a real SSH server —
not mockups, and not the design canvas. The hosts are invented; the fingerprint,
the shell and the output are not.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/screenshot-main-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="assets/screenshot-main-light.png">
  <img src="assets/screenshot-main-dark.png" alt="Runic SSH with a connected session: saved hosts grouped in the sidebar, a terminal, and a status bar" width="880">
</picture>

**An unknown host key.** The primary button starts inert and stays that way
until you confirm you checked the fingerprint somewhere other than the
connection asking to be trusted. Clicking through is the failure this screen
exists to prevent, so it is not one click away.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/screenshot-hostkey-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="assets/screenshot-hostkey-light.png">
  <img src="assets/screenshot-hostkey-dark.png" alt="The unknown host key screen, showing the host, key type and SHA256 fingerprint, with the trust button disabled until an out-of-band verification checkbox is ticked" width="880">
</picture>

## ⬇️ Downloads

Installers for all three platforms are attached to each
[release](https://github.com/marciopaiva/runic-ssh/releases), with a
`SHA256SUMS` covering every file.

| | |
| --- | --- |
| Windows | `.msi` (WiX) or `.exe` (NSIS) |
| macOS | `.dmg`, Apple Silicon only |
| Linux | `.deb`, `.rpm`, `.AppImage` |

**Nothing here is code-signed.** Windows shows SmartScreen, macOS says the
application is damaged, and neither is a malfunction — they are what an
operating system says about a binary whose author it cannot verify.
[`docs/installing.md`](docs/installing.md) has the exact commands for each
platform, and the reason this project would rather explain the warning than
teach you to click through it.

That page also tracks **which packages a human has actually installed**, which
is not the same list as the one the build produces. Check it before assuming a
platform has been exercised.

```sh
sha256sum -c SHA256SUMS --ignore-missing   # before installing anything
```

## 🛠️ Tech Stack

- **Core:** Rust and Tauri 2.0
- **Frontend:** React, TypeScript, TailwindCSS
- **Terminal:** xterm.js, DOM renderer, no GPU path ([ADR-0011](docs/adr/0011-drop-the-webgl-renderer.md))
- **SSH/SFTP:** the `russh` crate, in process, no OpenSSH binary ([ADR-0003](docs/adr/0003-use-russh-instead-of-openssh.md))
- **Secrets:** the OS keychain, referenced by opaque id ([ADR-0004](docs/adr/0004-store-credentials-in-the-os-keychain.md))
- **Languages:** English and Brazilian Portuguese at v0.1.0; Spanish is translated and waiting on a native review of its security copy ([ADR-0007](docs/adr/0007-localize-in-the-frontend-from-typed-error-codes.md))

## 🧑‍💻 Building it

**Prerequisites:** [Rust](https://rustup.rs) (the version in
`rust-toolchain.toml` installs itself), Node 22 or newer, and pnpm via
`corepack enable`.

Linux also needs the webview and its GTK stack. On Ubuntu 24.04:

```bash
sudo apt install libwebkit2gtk-4.1-dev libdbus-1-dev libssl-dev \
  libayatana-appindicator3-dev librsvg2-dev libxdo-dev \
  build-essential curl wget file pkg-config patchelf
```

Then:

```bash
pnpm install
pnpm tauri dev      # run it
pnpm tauri build    # package it
```

### The gate

Five commands have to pass before any change is done. CI runs them on Linux,
macOS, and Windows, and a pull request cannot merge until they are green.

```bash
cd src-tauri && cargo fmt --all -- --check
cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings
cd src-tauri && cargo test
pnpm typecheck
pnpm test
```

## 🗺️ Roadmap

- [ ] **v0.1.0 (MVP):** basic SSH connections, local session management, and a working terminal (xterm.js).
- [ ] **v0.2.0:** SFTP integration (upload and download) plus session import from PuTTY and OpenSSH.
- [ ] **v0.3.0:** port forwarding (SSH tunnels) and customizable themes.
- [ ] **v1.0.0:** integrated AI assistant, optional cloud sync, and production grade stability.

## 📚 Documentation

- [Architecture](docs/architecture.md): how the Rust core and the webview fit together
- [Security model](docs/security-model.md): threat model and the rules that follow from it
- [Decision records](docs/adr/): why the stack looks the way it does
- [CLAUDE.md](CLAUDE.md): working agreement for contributors and AI assistants

## 🤝 Contributing

Contributions are very welcome. Read
[CLAUDE.md](CLAUDE.md) first — it is the working agreement, and it is short.

1. Fork the project and branch as `feat/<short-slug>` or `fix/<short-slug>`.
2. Write the test alongside the code, not after it.
3. Run the gate above. Every command, not the convenient ones.
4. Commit with [conventional commits](https://www.conventionalcommits.org):
   `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`. One logical change
   per commit.
5. Open a pull request describing what you built, what you tested, and what you
   deliberately left out.

Anything touching credential storage, host key verification, logging, or the
Tauri capability set needs a proposal and a decision record before the code —
see section 5 of [CLAUDE.md](CLAUDE.md) and use the `/adr` skill.

## 📜 License

Distributed under the **MIT** license. See `LICENSE` for more information.

Bundled typefaces (Manrope, JetBrains Mono) ship under the SIL Open Font
License 1.1; see [`src/styles/fonts/`](src/styles/fonts/).

---
*Made with ❤️ and Rust.*
