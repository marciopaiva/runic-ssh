# Installing a build

Building one is `docs/building.md`. This file is about what happens after.

Runic SSH is not code-signed. Every installer below is refused or warned about
by the operating system, and this page says exactly how, because a project that
tells people to "just click through the warning" is teaching a habit that the
rest of its security model depends on them not having.

Signing costs money and an identity: an Apple Developer ID for macOS, an
Authenticode certificate for Windows. The maintainer decided on 2026-11-23 not
to buy either, and to distribute from GitHub Releases as they are. That makes
every build here an unsigned binary from the internet, and the honest
instruction is that you should only run one you built yourself or one whose
checksum you have compared against the workflow run that produced it. The
1.0 release is no different in this: it is not signed either.

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

A release also carries a **build provenance attestation** for every file. It
says which workflow run, from which commit, produced the file, signed by
GitHub's identity and kept in a public log. A checksum cannot say that, since
whoever can replace a file can replace the sum beside it. Check a download
with the GitHub CLI, version 2.49 or later (`gh --version`; an older one
answers `unknown command "attestation"`):

```sh
gh attestation verify "Runic-SSH_<version>_amd64.deb" --repo marciopaiva/runic-ssh
```

It proves where a file was built and not that the code is good, and it is not
a code signature: the installers stay unsigned. The runs of `package` from the
Actions tab are not attested, only a tag's release.

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
workflow produced, and it is the answer to "is this usable yet". A row moves
when somebody runs the file, not when the tag is pushed, so silence in it is
not coverage. The history of earlier runs is in the commits that touched this
file.

| Platform | Installed and driven | Version | Where the file came from |
| --- | --- | --- | --- |
| Windows, `.exe` (NSIS) | **yes**, 2026-11-25 | 1.0.0-rc.3 | **downloaded from the release, upgraded in place over 0.9.0** |
| Windows, `.msi` (WiX) | no | | per-machine, needs administrator rights |
| Linux, `.AppImage` | **yes**, 2026-09-24 | 0.9.0 | **downloaded from the release, extracted rather than run through FUSE** |
| Linux, `.deb` | **yes**, 2026-09-13 | 0.8.0 | **downloaded from the release** |
| Linux, `.rpm` | no | | no RPM distribution to hand |
| macOS, `.dmg` | **no** | | needs an Apple Silicon Mac |

**macOS has never been opened by anyone.** The `.dmg` is built and its version
is read out of the bundle in CI, and that is all. Gatekeeper's behaviour below
is described from documentation, not from having been seen.

**The Windows run on 2026-11-25** used all six files of the `v1.0.0-rc.3`
release. `sha256sum -c SHA256SUMS` reported `OK` on every one. The NSIS
installer ran silently over the maintainer's own 0.9.0 and exited 0; the
uninstall entry then read `1.0.0-rc.3`, the executable carried that version,
its publisher and copyright, and `licenses` sat beside it. The application
opened, answered, and left every file in `%APPDATA%\com.runicssh.client`
untouched. The maintainer then used it on screen and found nothing wrong. The
file was copied through WSL, so it carried no Mark of the Web and SmartScreen
was not consulted.

**Earlier runs established what has not needed repeating**, and the lasting
parts are these:

* The NSIS installer puts the application in `%LOCALAPPDATA%` for the current
  user without administrator rights, registers an uninstall entry, and upgrades
  an earlier version in place.
* Minimise, maximise and close work on Windows. They cannot be checked under
  WSLg, which does not iconify, so a working minimise and a broken one look the
  same there. See `docs/testing.md`.
* On Windows the host key path, the credential window and a shell held exactly
  one session open on the server, which is what ADR-0014 is for.
* **ADR-0025 was exercised on DPAPI.** A credential kept for the run only wrote
  nothing to `%APPDATA%\Microsoft\Credentials` and left `credentialId` null in
  `sessions.json`, so a restarted process had no path to it. Saving it to the
  keyring afterwards wrote both halves, the store entry and the session pointer.
  The keep modes have run on both credential stores that exist.
* On Linux the packaged binary read the real config directory, took the
  unknown-host-key path with a fingerprint that matched `ssh-keyscan`, wrote the
  key to `known_hosts` on trust, authenticated and ran a command in a shell.
* A script can drive typing and pasting on a display with a window manager and
  cannot drive a drag or a selection. What a person has to do is the table
  under "What synthetic input can and cannot drive" in `docs/testing.md`.

**Three claims stay separate**: the build is green, somebody ran it, and
somebody ran the file a stranger would download. The `smoke` job in
`package.yml` adds a fourth: it installs the `.deb` and the NSIS package on
their own platforms, opens the Linux one on a virtual display and checks that
the window drew something, and mounts the `.dmg` to read its version. It runs
before `release`, so a tag with a broken installer publishes no page. It
connects to nothing and touches no keyboard, so it does not move a row above.

Not covered by anyone: the `.msi`, Windows SmartScreen on a file downloaded
through a browser, and everything about macOS.

## Licences of what is inside

Each installer carries the licence text of every library in it, in two files
under a `licenses` folder next to the application's resources:
`THIRD-PARTY-LICENSES.html` for the Rust crates and `THIRD-PARTY-NOTICES.md`
for the frontend packages and the two fonts. The same files are at the root of
the repository. Both are generated and checked in CI, so a dependency change
that leaves them out of date fails the audit workflow.

## Windows

`.msi` (WiX) and `.exe` (NSIS) are both produced. Either works; the `.exe` is
smaller.

SmartScreen shows **"Windows protected your PC"** with a *Don't run* button, and
the way past it is *More info* → *Run anyway*. That is the whole warning: the
binary has no publisher, so Windows cannot tell you who wrote it, and neither
can it tell you the file was not modified in transit. Compare the SHA-256
against the workflow run before you do it:

```powershell
Get-FileHash .\Runic-SSH_1.0.1_x64_en-US.msi -Algorithm SHA256
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
sudo apt install ./Runic-SSH_1.0.1_amd64.deb
```

The file is `Runic-SSH_...`, capitalised, because the product name is; the
*package* it installs is `runic-ssh`, lowercase. `apt remove runic-ssh` takes it
back off.

The package depends on `libwebkit2gtk-4.1-0` and `libgtk-3-0`. There is no
bundled browser engine. The webview is the system's, which is why the download
is three megabytes rather than a hundred.

**Installing a second build of the same version does nothing.** `apt` compares
version numbers, so a rebuild of `1.0.1` over an installed `1.0.1` exits
successfully without replacing anything: no error, no warning, and the old
binary still on disk. A real bump does upgrade normally, so `1.0.1` over `1.0.0`
needs none of this. For a rebuild of the same version, force it:

```sh
sudo dpkg -i ./Runic-SSH_1.0.1_amd64.deb
```

**A release candidate sorts above its release.** `dpkg` compares `1.0.0-rc.3`
as later than `1.0.0`, so `apt` will not upgrade from a candidate to the
release. Remove the candidate first (`sudo apt remove runic-ssh`; your
configuration is not touched) or install with `dpkg -i` as above. Nobody has
checked how `rpm` orders them.

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
