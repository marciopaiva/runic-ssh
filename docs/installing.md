# Installing a build

Building one is `docs/building.md`. This file is about what happens after.

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

There are two, and they are not equivalent.

**A release**, attached to a `v*` tag, listed under
[Releases](https://github.com/marciopaiva/runic-ssh/releases). Permanent, no
account needed, one `SHA256SUMS` covering all three platforms. This is what a
download link should point at.

**A workflow run**, `package` from the Actions tab, on any branch. Artifacts
expire after 14 days and reaching them takes a signed-in account, which is the
right amount of friction for a build nobody has tried. Each platform's artifact
carries its own `SHA256SUMS`; the release concatenates the three and re-checks
them against the bytes after they leave the build machines.

Nothing is built on an ordinary push. Twenty minutes of runner time for an
artifact nobody asked for is worth avoiding.

**An artifact does not say which commit it came from.** A `workflow_dispatch`
run packages whatever the branch was at that moment, and the version only moves
when somebody bumps it for a release, so two installers of the same version can
be weeks apart and identical on the outside. The run's own page records the
commit; read it there before trusting a downloaded file to contain a fix. This is not hypothetical. The first run of
this smoke test reproduced a bug that had already been fixed, because the
artifact predated the fix by two commits.

## What has actually been installed

Building is not installing. This table is what someone has run, not what the
workflow produced, and it is the answer to "is this usable yet".

| Platform | Installed and driven | Version | Where the file came from |
| --- | --- | --- | --- |
| Linux, `.deb` | **yes**, 2026-08-24 | 0.1.1 | **downloaded from the release** |
| Linux, `.rpm` | no | | no RPM distribution to hand |
| Linux, `.AppImage` | no | | discouraged anyway, see below |
| Windows, `.exe` (NSIS) | **yes**, 2026-08-23 | 0.1.0 | built on the machine that ran it |
| Windows, `.msi` (WiX) | built, not installed | | the NSIS package was the one exercised |
| macOS, `.dmg` | **no** | | needs an Apple Silicon Mac |

**The Linux row is now a release download, and that is a different claim.** The
files attached to a release come off the CI runners: same commit, different
machine, and a different set of things that can go wrong along the way, from a
runner's toolchain to the archive that carries the artifact between jobs to a
bundler behaving differently outside a developer's box. That path has now been
walked once, on one platform.

What it covered: `sha256sum -c SHA256SUMS` against the downloaded bytes,
`apt install` of the `.deb` over an installed `0.1.0`, the window opening on the
packaged frontend rather than the Vite dev server, and copy and paste driven in
a real session. The Windows row is still a locally built package, and macOS
still has nobody.

That distinction is the whole point of this table. It exists so that "the build
is green", "somebody ran it", and "somebody ran the file a stranger would
download" stay three separate claims.

What the Linux run covered, end to end on the packaged binary: it read the real
config directory, listed saved sessions, took the unknown-host-key path,
displayed a fingerprint that matched `ssh-keyscan` exactly, wrote the correct
key to `known_hosts` on trust, opened its credential window, authenticated with
a password and ran a command in a real shell.

What the Windows run covered, on the packaged binary: the NSIS installer put
the application in `%LOCALAPPDATA%` for the current user without asking for
administrator rights, registered an uninstall entry, and launched. It picked up
the system dark theme and the `pt-BR` locale, drew its own title bar, took the
unknown-host-key path against a fingerprint checked out of band, opened its
credential window, authenticated and ran a shell. It held exactly one session
open on the server, which is what ADR-0014 is for.

Minimise, maximise and close were all exercised there, which matters because
they cannot be checked under WSLg at all: that compositor does not iconify, so a
working minimise and a broken one look identical. See `docs/testing.md`.

Still unchecked: the `.msi` (a different installer with a different code path,
and per-machine, so it needs administrator rights), Windows SmartScreen on a
downloaded file rather than a locally built one, and everything about macOS.
Gatekeeper quarantine and the `.app` bundle are described below from
documentation rather than from having been seen.

## Windows

`.msi` (WiX) and `.exe` (NSIS) are both produced. Either works; the `.exe` is
smaller.

SmartScreen shows **"Windows protected your PC"** with a *Don't run* button, and
the way past it is *More info* → *Run anyway*. That is the whole warning: the
binary has no publisher, so Windows cannot tell you who wrote it, and neither
can it tell you the file was not modified in transit. Compare the SHA-256
against the workflow run before you do it:

```powershell
Get-FileHash .\Runic-SSH_0.1.1_x64_en-US.msi -Algorithm SHA256
```

## macOS

`.dmg` and `.app` are produced, unsigned and un-notarized, and **Apple Silicon
only**: the runner is `macos-latest`, which is `aarch64`. An Intel Mac has
nothing to install here.

Gatekeeper reports **"Runic SSH is damaged and can't be opened"**, which is not
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
sudo apt install ./Runic-SSH_0.1.1_amd64.deb
```

The file is `Runic-SSH_...`, capitalised, because the product name is; the
*package* it installs is `runic-ssh`, lowercase. `apt remove runic-ssh` takes it
back off.

The package depends on `libwebkit2gtk-4.1-0` and `libgtk-3-0`. There is no
bundled browser engine. The webview is the system's, which is why the download
is three megabytes rather than a hundred.

**Installing a second build of the same version does nothing.** `apt` compares
version numbers, so a rebuild of `0.1.1` over an installed `0.1.1` exits
successfully without replacing anything: no error, no warning, and the old
binary still on disk. A real bump does upgrade normally, so `0.1.1` over `0.1.0`
needs none of this. For a rebuild of the same version, force it:

```sh
sudo dpkg -i ./Runic-SSH_0.1.1_amd64.deb
```

### If the window cannot be moved or resized

ADR-0005 turned the system title bar off so the session tabs could occupy it.
Most window managers are fine with that. Some are not: a compositor that does
not draw resize borders for an undecorated window leaves one that cannot be
resized, and one without a window manager at all, which is the case this
project hit with WSLg, leaves a window that cannot be moved either.

The escape hatch is a command. Press `Ctrl+Shift+P` and search for **title
bar**; the entry hands the bar back to the window manager, and the same entry
gives it back to the application afterwards. It is stored, so it survives a
restart.

If the palette cannot be reached either, the same switch is a line in
`settings.json`, next to the session file described in `docs/architecture.md`:

```json
{ "nativeDecorations": true }
```

The application reads it at startup and applies it to the window. A window
manager that ignores a decoration change on a window that is already open,
and some do, will still honour it on the next launch, which is why the setting is
written to disk as well as applied live.

Not on macOS. There the traffic lights are the platform's own already, and
turning this on would take them away rather than give anything back.

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
