# Installing a build

Runic SSH is not code-signed. Every installer below is refused or warned about
by the operating system, and this page says exactly how, because a project that
tells people to "just click through the warning" is teaching a habit that the
rest of its security model depends on them not having.

Signing costs money and an identity: an Apple Developer ID for macOS, an
Authenticode certificate for Windows. Neither has been bought. Until they are,
every build here is an unsigned binary from the internet, and the honest
instruction is that you should only run one you built yourself or one whose
checksum you have compared against the workflow run that produced it.

## Where the builds come from

The `package` workflow builds all three platforms. Run it from the Actions tab,
or push a `v*` tag. Artifacts are attached to the run and expire after 14 days.
Each platform's artifact carries a `SHA256SUMS` file, which is what the
comparisons below are against.

Nothing is built on an ordinary push. Twenty minutes of runner time for an
artifact nobody asked for is worth avoiding.

**An artifact does not say which commit it came from.** A `workflow_dispatch`
run packages whatever the branch was at that moment, and every pre-release build
is version `0.1.0`, so two installers can be weeks apart and identical on the
outside. The run's own page records the commit; read it there before trusting a
downloaded file to contain a fix. This is not hypothetical — the first run of
this smoke test reproduced a bug that had already been fixed, because the
artifact predated the fix by two commits.

## What has actually been installed

Building is not installing. This table is what someone has run, not what the
workflow produced, and it is the answer to "is this usable yet".

| Platform | Installed and driven | By what |
| --- | --- | --- |
| Linux, `.deb` | **yes**, 2026-08-23 | Ubuntu 24.04 under WSL2, on an isolated X display |
| Linux, `.rpm` | no | no RPM distribution to hand |
| Linux, `.AppImage` | no | discouraged anyway — see below |
| Windows, `.msi` / `.exe` | **no** | needs a Windows machine |
| macOS, `.dmg` | **no** | needs an Apple Silicon Mac |

What the Linux run covered, end to end on the packaged binary: it read the real
config directory, listed saved sessions, took the unknown-host-key path,
displayed a fingerprint that matched `ssh-keyscan` exactly, wrote the correct
key to `known_hosts` on trust, opened its credential window, authenticated with
a password and ran a command in a real shell.

The two unchecked platforms are not a formality. Both take a code path Linux
does not — SmartScreen and the WiX installer on one, Gatekeeper quarantine and
a `.app` bundle on the other — and both are described below from documentation
rather than from having been seen.

## Windows

`.msi` (WiX) and `.exe` (NSIS) are both produced. Either works; the `.exe` is
smaller.

SmartScreen shows **"Windows protected your PC"** with a *Don't run* button, and
the way past it is *More info* → *Run anyway*. That is the whole warning: the
binary has no publisher, so Windows cannot tell you who wrote it, and neither
can it tell you the file was not modified in transit. Compare the SHA-256
against the workflow run before you do it:

```powershell
Get-FileHash .\Runic-SSH_0.1.0_x64_en-US.msi -Algorithm SHA256
```

## macOS

`.dmg` and `.app` are produced, unsigned and un-notarized, and **Apple Silicon
only** — the runner is `macos-latest`, which is `aarch64`. An Intel Mac has
nothing to install here.

Gatekeeper reports **"Runic SSH is damaged and can't be opened"** — which is not
true and is what macOS says about any unsigned application that has the
quarantine attribute. Removing the attribute is the way past it:

```sh
xattr -dr com.apple.quarantine "/Applications/Runic SSH.app"
```

Read that command before running it. It disables a check, on an application you
downloaded, and you should be as suspicious of this page telling you to run it
as of anything else.

## Linux

`.deb`, `.rpm` and `.AppImage`.

```sh
sha256sum -c SHA256SUMS --ignore-missing
sudo apt install ./Runic-SSH_0.1.0_amd64.deb
```

The file is `Runic-SSH_...`, capitalised, because the product name is; the
*package* it installs is `runic-ssh`, lowercase. `apt remove runic-ssh` takes it
back off.

The package depends on `libwebkit2gtk-4.1-0` and `libgtk-3-0`. There is no
bundled browser engine — the webview is the system's, which is why the download
is three megabytes rather than a hundred.

**Installing a second build over the first does nothing.** Every pre-release
carries version `0.1.0`, so `apt` sees the installed version as current and
exits successfully without replacing anything — no error, no warning, and the
old binary still on disk. Force it:

```sh
sudo dpkg -i ./Runic-SSH_0.1.0_amd64.deb
```

### A note on the AppImage

The AppImage is 75 MB against the `.deb`'s 3.4 MB, because it carries the GTK
and WebKit stack the `.deb` borrows from the system.

It also has a supply chain the rest of this project does not accept. Tauri's
AppImage bundler downloads its tooling at build time, and two of those downloads
come from a **mutable** source:

| Downloaded | Source |
| --- | --- |
| `AppRun-x86_64` | a fixed release |
| `linuxdeploy-x86_64.AppImage` | a fixed release |
| `linuxdeploy-plugin-gtk.sh` | `raw.githubusercontent.com/.../master` |
| `linuxdeploy-plugin-gstreamer.sh` | `raw.githubusercontent.com/.../master` |
| `linuxdeploy-plugin-appimage` | the `continuous` tag |

`gate.yml` pins every GitHub Action to a commit rather than a tag, because
section 4 of `docs/security-model.md` names a supply chain attacker as an
adversary and a tag can be moved. A shell script fetched from a `master` branch
and executed during the build is the same exposure, one layer down, and it is
not ours to pin.

Prefer the `.deb` or the `.rpm` on Linux. The AppImage is built because it is
the only format that runs on a distribution we did not package for.
