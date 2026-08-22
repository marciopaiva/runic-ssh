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

Nothing is built on an ordinary push. Twenty minutes of runner time for an
artifact nobody asked for is worth avoiding.

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

`.dmg` and `.app` are produced, unsigned and un-notarized.

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
sudo apt install ./runic-ssh_0.1.0_amd64.deb
```

The package depends on `libwebkit2gtk-4.1-0` and `libgtk-3-0`. There is no
bundled browser engine — the webview is the system's, which is why the download
is three megabytes rather than a hundred.

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
