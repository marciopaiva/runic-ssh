<p align="center">
  <img src="assets/logo.png" alt="Runic SSH" width="480">
</p>

<p align="center">
  <strong>A modern, fast, and secure cross-platform SSH/SFTP client built with Rust and Tauri.</strong>
</p>

<p align="center">
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

## 🗺️ Roadmap

- [ ] **v0.1.0 (MVP):** basic SSH connections, local session management, and a working terminal (xterm.js).
- [ ] **v0.2.0:** SFTP integration (upload and download) plus session import from PuTTY and OpenSSH.
- [ ] **v0.3.0:** port forwarding (SSH tunnels) and customizable themes.
- [ ] **v1.0.0:** integrated AI assistant, optional cloud sync, and production grade stability.

## 🛠️ Tech Stack

- **Core:** Rust and Tauri 2.0
- **Frontend:** React, TypeScript, TailwindCSS
- **Terminal:** xterm.js
- **SSH/SFTP:** the `russh` crate

## 🤝 Contributing

Contributions are very welcome. If you found a bug or have an idea for a feature:

1. Fork the project.
2. Create a branch for your feature (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

## 📜 License

Distributed under the **MIT** license. See `LICENSE` for more information.

---
*Made with ❤️ and Rust.*
