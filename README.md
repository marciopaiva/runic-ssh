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

**Pre-alpha. Not usable yet** — there is no SSH connection to speak of. What
exists is the foundation everything else is built on: the Tauri shell, the
React frontend, the design system, and a build gate that runs on all three
platforms.

Work is tracked in [issues](https://github.com/marciopaiva/runic-ssh/issues) and
the decisions behind it in [`docs/adr/`](docs/adr/).

## 🛠️ Tech Stack

- **Core:** Rust and Tauri 2.0
- **Frontend:** React, TypeScript, TailwindCSS
- **Terminal:** xterm.js, WebGL renderer with a DOM fallback ([ADR-0006](docs/adr/0006-render-the-terminal-with-webgl.md))
- **SSH/SFTP:** the `russh` crate, in process, no OpenSSH binary ([ADR-0003](docs/adr/0003-use-russh-instead-of-openssh.md))
- **Secrets:** the OS keychain, referenced by opaque id ([ADR-0004](docs/adr/0004-store-credentials-in-the-os-keychain.md))
- **Languages:** English, Brazilian Portuguese, and Spanish from the first release ([ADR-0007](docs/adr/0007-localize-in-the-frontend-from-typed-error-codes.md))

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
