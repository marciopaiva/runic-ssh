# Building from source

The dev loop is `pnpm tauri dev`, and `pnpm gate` runs the checks in section 8
of `CLAUDE.md`. This file is only about the things that are not obvious from
those two commands: what a machine needs before either of them works, and what
fails in a way that does not name itself.

## Linux

`pnpm install`, a Rust toolchain, and the WebKitGTK development packages Tauri
lists for your distribution. `rust-toolchain.toml` pins the compiler, so
`rustup` fetches the right one on the first build rather than using whatever the
machine happens to have.

Running the built application under WSL needs one more thing; see
`docs/testing.md`, "On WSL2".

## Windows

Verified on Windows 11 on 2026-08-23, from nothing installed to a working
`.msi` and `.exe`.

| | |
| --- | --- |
| Rust | via `rustup-init.exe`; `rust-toolchain.toml` pulls the pinned 1.95.0 |
| Node | 22.13 or newer, per `package.json` `engines` |
| pnpm | 11.22.0, via `corepack enable && corepack prepare pnpm@11.22.0 --activate` |
| MSVC | Visual Studio Build Tools, workload `Microsoft.VisualStudio.Workload.VCTools` |
| Windows SDK | installed with that workload |
| **NASM** | **required — see below** |
| WebView2 | ships with Windows 11; needed to *run*, not to build |

Only the Build Tools need administrator rights. Rust, Node, pnpm and NASM all
install into the user profile.

### NASM is required, and the error does not say so usefully

`aws-lc-sys` assembles its own routines on Windows and needs the Netwide
Assembler. It is not a dependency this project declares — it arrives underneath,
and the build fails like this:

```
error: failed to run custom build command for `aws-lc-sys v0.44.0`
  NASM command not found! Build cannot continue.
```

Install NASM and put it on `PATH`. A `.zip` from `nasm.us` extracted into the
user profile is enough; nothing needs to be registered.

**Do not reach for `AWS_LC_SYS_NO_ASM=1`.** It makes the error disappear by
building the cryptography without its assembly routines, which aws-lc itself
says is not for production. The missing tool is the problem; the variable only
hides it.

CI does not hit this because the GitHub `windows-latest` image ships NASM. That
is convenient and it is not a guarantee — if that image ever drops it, the
Windows job fails with the message above and nothing in this repository will
explain why. Adding an explicit install step to `package.yml` is the obvious
insurance and has a cost worth weighing first: the workflow deliberately runs
only GitHub-owned actions pinned to a commit, and fetching NASM would put an
unpinned download inside a build that produces installers.

## macOS

Not attempted by anyone. Xcode command line tools and the same Node and pnpm
versions, in principle.
