# Testing against a real SSH server

Every SSH test in this repository runs against `russh`'s own server, in
process, on a loopback port. That keeps CI fast and needs no `sshd` on three
platforms' runners. It also shares an implementation with the client, which
makes a shared assumption invisible to both sides of the test.

`src-tauri/tests/against_openssh.rs` closes that gap. It runs against real
OpenSSH in a container, and is ignored by default because CI has nothing to
talk to.

## Starting it

```sh
podman build -t runic-test-sshd src-tauri/tests/fixtures/sshd
podman run -d --name runic-test-sshd -p 2222:2222 runic-test-sshd
```

`docker` works the same way. The server listens on `127.0.0.1:2222`:

| | |
| --- | --- |
| user | `deploy` |
| password | `runic-test` |
| files | `~/README`, `~/logs/big.log` (200 KB), `~/config/` |

## Running the tests

```sh
cargo test --test against_openssh -- --ignored --nocapture
```

## Driving the application against it

The same container is the only way to reach the credential prompt by hand. The
prompt opens from `authenticate_interactively`, which runs after a connection is
open and the server has asked for a credential, so no amount of clicking gets
there without a server that asks.

Save a session against it, connect, accept the host key, and the prompt window
opens. That path found a bug three passing tests did not: `prompt_url` was
correct and tested, and `open_window` built the URL a second time and got it
wrong, so every prompt opened onto "this prompt is no longer valid".

Two things about the container matter when driving it rather than testing it:

* **Host keys change every time it is recreated**, which is the point (see
  below) and a nuisance here: a recreated container makes a saved session hit
  the changed-key block instead of the prompt. Publish it on a second port
  rather than clearing `known_hosts`; a port with no entry takes the
  unknown-key path, and the entry you already trust stays valid.
* **The fingerprint is worth checking by eye**, since this is the one screen
  where the application's own computation is the thing under test:

  ```sh
  ssh-keyscan -p 2222 -t ed25519 127.0.0.1 | ssh-keygen -lf -
  ```

### Driving a release build from the tree

`pnpm tauri dev` serves the frontend from Vite and reloads on every edit, which
is the loop. A release binary is a different thing: it serves the frontend
**embedded in it at compile time**, which is what a packaged build does and what
a `tauri dev` run exercises none of.

Rebuilding one from the tree has a trap worth knowing, because it fails
silently:

```sh
pnpm build                        # writes dist/
touch src-tauri/src/lib.rs        # or cargo will not notice
cd src-tauri && cargo build --release
```

**Without the `touch`, `cargo` reports `Finished` in under a second and leaves
the old binary in place.** Nothing declares `dist/` as an input, so a frontend
change alone never invalidates the build, and the binary goes on serving the
interface it was compiled with. Measured: `dist/index.html` written at 08:01:30,
`target/release/runic-ssh` still stamped 07:51:31, and `cargo` said it was
finished.

The date on the binary is the check. `strings` on it is not: Tauri embeds the
assets compressed, so grepping for a string you just added finds nothing whether
or not the build is current.

`pnpm tauri build` does the whole thing correctly and also builds every
installer, which is minutes rather than one.

### Copy and paste

The clipboard is the one part of the terminal that cannot be asserted from a
test. It runs on the browser's own `copy` and `paste` events (ADR-0018), so what
is being checked is whether the webview raises them, and WebKitGTK and WebView2
each get their own vote. Half of this can be driven synthetically and half
cannot: `xdotool` typing reaches the webview on a display that has a window
manager, so a paste can be sent, but a drag never reaches it, so nothing can be
selected and copy is a person's job. See "What synthetic input can and cannot
drive" below before assuming either way.

Connect a session, then:

| Do this | Expect |
| --- | --- |
| Select with the mouse, `Ctrl-C` | the text is on the clipboard, and the selection clears |
| `Ctrl-C` again, nothing selected | the running process is interrupted |
| `Ctrl-C` while `yes` is flooding | interrupted. A flood leaves nothing selected |
| `Ctrl-V` with one line on the clipboard | it arrives |
| `Ctrl-Shift-C` and `Ctrl-Shift-V` | always the clipboard, selection or not |
| `Ctrl-Shift-P` | still opens the palette |

**The paste confirmation needs bracketed paste switched off**, and `bash` keeps
it on, so it will not appear there and that is correct. Run `cat` or `sh` on the
host and paste several lines into it: the confirmation lists the first eight and
counts the rest. Cancelling must leave the host with nothing.

What to check in the file that comes out of `cat > somefile`:

```sh
tr -cd '\r' < somefile | wc -c        # must be 0
iconv -f UTF-8 -t UTF-8 somefile      # accents must survive
```

The carriage returns are the point. A confirmed paste is delivered around xterm,
so it has to redo the newline normalising xterm would have done; get it wrong
and the shell receives line feeds and runs nothing. A 4409 byte paste with
accented text was how this was verified for 0.1.1.

**Above 32 KiB is not covered by any of this.** `send_input` refuses more than
that in one call and the frontend splits to stay inside it, which is proven by
unit test and has never been driven. Note that an SSH private key is far below
the limit, so the obvious test does not reach the split.

### Groups and synchronised typing

Two sessions at least, and four for the grid. The container recipe above gives
one host, so the grid needs three more. They are the same image on three more
ports, which is enough to make four sessions that are genuinely separate
connections:

```bash
for port in 2223 2224 2225; do
  podman run -d --name "runic-test-sshd-$port" -p "$port:2222" runic-test-sshd
done
```

Each one is a distinct host key, so the first connection to each prompts on its
own. That is the point: four groups that trust four different keys is closer to
what a person has on screen than four tabs onto one machine.

ADR-0019 is the reasoning behind typing into several at once, and ADR-0020 and
ADR-0021 are the anatomy it now lives in: the main area divides into groups,
each group is a strip of tabs over the body of whichever tab it is showing, and
the shapes are picked from the trailing edge of the top strip. There is no
separate pane header any more; the strip is the header.

Nothing here can be asserted from a test either, for the same reason as the
clipboard: what is being checked is what the webview does with a keyboard in
real rectangles. Typing can be sent synthetically, so most of this list can be
walked without a person; moving a host into an empty rectangle cannot, because
that is a drag.

Divide the area from the shape control in the top strip, or from the palette
(`Ctrl-Shift-P`, then "Split"). One open session is enough: dividing first and
connecting into the empty rectangle is the ordinary way round. With nothing
connected at all the commands are absent, because there is no area to divide.

| Do this | Expect |
| --- | --- |
| Divide into two columns, two sessions open | both paint, each with its own grid |
| Resize the window | both re-fit, and neither reports `0x0` |
| Click inside a group | that group is outlined, and its active tab is highlighted in the host list |
| Click a host that is not open | it opens as a tab in the focused group |
| Click a tab that is already on screen | only the focus moves, nothing rearranges |
| Right-click a tab | a menu offers to send it to another group |
| Read a group's trailing menu | closing says how many connections it is about to drop |
| Close one session of a division | its rectangle goes empty, the other stays |
| Read the empty rectangle | it says no session *in this group*, not that none is open |
| Read each strip | it names its session, and one group is marked focused |
| Read the status bar | it names the focused host, and shows its grid rather than the last resized |
| Back to one terminal | every tab is in one strip and nothing was disconnected |

Then arm the switch on a group's strip. It is refused unless two groups have a
session in them, and says so when you hover it.

| Do this | Expect |
| --- | --- |
| Type | it arrives in the active tab of every group, each host echoing its own |
| `Ctrl-C` | interrupts in every receiving group |
| Look at the window | the status bar's top edge is amber and carries the count and the way off; every receiving group is outlined; the rail is amber and holds the settings gear shut |
| Read the host list | every receiving host is marked, and every connected host that is not receiving is labelled `SPARED` |
| Find the focused group | the outline says nothing now, so the strip's marker is the only thing that does |
| Uncheck one group's box, with four open | that group stops receiving, the count drops by one |
| Type after unchecking | the spared group receives nothing |
| Type *into* the spared group | it reaches that group and no other |
| Leave a connected session behind another tab | it is connected and is not receiving, and the host list is where that is read |
| Uncheck until one is left | the bar stops claiming a broadcast |
| Turn the switch off and on again | every box is checked again |
| Click the way off in the status bar | the switch goes off in one click |
| Close a session, or change which tab a group shows | the switch disarms itself |
| Paste one line, under `bash` | the confirmation appears anyway, naming the host count |
| Cancel that confirmation | no host received anything |

**What a screen reader hears is the half no test can hold.** Every marker above
is a thing to look at. The status bar carries one live region, always present
and empty until the state first moves, and `announceBroadcast` decides what goes
in it. That the region says the right thing is asserted; that anything speaks it
is not, and cannot be from here.

Drive it with the reader the platform ships, Orca on Linux and Narrator on
Windows, with the terminal focused:

| Do this | Expect |
| --- | --- |
| Arm the switch from the palette | it says synchronised typing is on, and how many hosts |
| Spare one group | it says the new count |
| Leave one receiving | it says one host, not `1 hosts` |
| Turn the switch off | it says it is off, which no marker used to do |
| Open the window and touch nothing | it says nothing at all |

**The password case is what the switch cannot protect and the thing to see for
yourself.** The fixture is Alpine and has no `sudo`, so use the mechanism
directly. Any prompt that hides what you type does it the same way: the remote
pty turns the echo off, on the far side of the channel, where nothing here can
see it.

With the switch **off**, in one group only:

```sh
stty -echo; read secret; stty echo; echo "[$secret]"
```

That session is now waiting with the echo off, exactly as `sudo` or `ssh` would
leave it. Arm the switch and type a password, then Return.

The session that asked hides it and prints it back in brackets. **The other
three print it on screen** and try to run it as a command. That is the whole of
the limit, and it is a documented one rather than a defect: there is no signal
to key on, because the decision to stop echoing was made by the host and never
crossed the channel.

### How long a credential is kept

ADR-0025 gives the credential window three answers, and two of them are only
visible over time, so nothing in a single run distinguishes them. Drive them in
this order, against a host with no saved credential:

| Do this | Expect |
| --- | --- |
| Connect, choose *ask me again next time*, disconnect, connect again | the window opens again |
| Connect, choose *until Runic SSH closes*, disconnect, connect again | it does not ask |
| Close the application, reopen it, connect | it asks again, and `sessions.json` never held a `credentialId` |
| Connect, choose *in the system keychain*, restart, connect | it does not ask, and `sessions.json` now names an opaque id |
| Look for the secret anywhere but the keychain | it is not in `sessions.json`, not in `settings.json`, and not in any log |

On a machine with no secret service the third choice is absent and the window
says why. That is the case worth having a machine for: the middle answer is the
only one such a machine can honour, and it is the reason there are three
answers rather than a tick box.

### Where the credential prompt opens, and how it is closed

The prompt is its own window, and everything about that window is decided in
Rust against a component in a webview. Nothing measures one against the other,
so all of it is driven rather than tested.

Move the main window into a corner of the screen before connecting. Centring
over the application and centring on the screen are the same thing when the
window is where it starts.

| Do this | Expect |
| --- | --- |
| Connect to a host with no saved credential | the prompt opens in the middle of the **main window**, not the middle of the screen |
| Look at its top edge | no title bar. It is our chrome, like every other window this application opens |
| Move the main window, then connect | it follows: the prompt is always over the window that asked |
| Push the main window against the top or bottom of the screen, then connect | the prompt is pulled back inside the work area, clear of any bar the desktop keeps there |
| Alt-tab, or look at the task switcher | the prompt is grouped with Runic SSH rather than standing alone |
| Compare it with an unknown host key screen | the same shape: icon, title, sentence, and an action row under a rule |
| Count the keep options | **three**, or two on a machine with no keychain. Never one |
| Choose *Private key* | the key field is there, the two labels do not overlap, and Cancel and Authenticate stay on screen |
| Scroll the prompt with a key asked for | the buttons do not move |
| Connect through a jump host | the taller window, with the whole hop paragraph and every keep option visible without scrolling |

**Then close it four ways, because ADR-0028 spent the title bar on the fourth.**

| Close it by | Expect |
| --- | --- |
| Escape | the window goes, the attempt fails as cancelled |
| its own Cancel | the same |
| **Cancel in the main window**, while the prompt is up | the prompt goes with it, the panel returns to normal, and no window is left asking for a connection that no longer exists |
| quitting the application | the prompt goes too |

The third row is the one that matters. It is the way out of a prompt whose own
script never ran, which is what the desktop's close button used to provide, and
it is ours now: a control in a different document with a different script.
Nothing a machine runs asserts it, because what it asserts is that a window went
away. Until #193 it did not work, and the prompt stayed on top of everything
asking for an attempt already abandoned.

**Count the options**, every time. The window used to be sized with an allowance
for a title bar drawn inside its own surface, which cost 47 points of 420 on one
desktop and left a keep control showing one of its three answers and looking
complete. The allowance is gone with the title bar, but the height is still a
number chosen somewhere else.

Drive it in Brazilian Portuguese. It is the longest of the three catalogues and
the heights are chosen against it, so it is the one that runs out of room first
and the only one where fitting proves anything.

**Four groups flooding is unmeasured.** ADR-0011 measured the renderer against
one terminal. Run `yes` in two of four groups and watch whether the window stays
responsive; if it does not, the limit belongs at two groups and the measurement
belongs in ADR-0019.

### A bastion and a host behind it

Issue #133 needs a target that is genuinely unreachable except through a
bastion. A fixture where both hosts are reachable from the machine proves
nothing: a chain that quietly connected direct would pass it.

The topology does the proving. Two containers share a podman network. The
bastion publishes a port; the target publishes none, and answers to a name that
only resolves inside that network.

```bash
podman network create runic-jump

podman build -t runic-test-bastion \
  --build-arg USERNAME=jump \
  --build-arg PASSWORD=runic-bastion \
  --build-arg ROLE=bastion \
  src-tauri/tests/fixtures/sshd

podman build -t runic-test-target \
  --build-arg USERNAME=deploy \
  --build-arg PASSWORD=runic-target \
  --build-arg ROLE="target behind the bastion" \
  src-tauri/tests/fixtures/sshd

podman run -d --name runic-test-target \
  --network runic-jump --network-alias target.internal runic-test-target
podman run -d --name runic-test-bastion \
  --network runic-jump -p 2226:2222 runic-test-bastion
```

| | bastion | target |
| --- | --- | --- |
| reached at | `127.0.0.1:2226` | `target.internal:2222`, from the bastion only |
| user | `jump` | `deploy` |
| password | `runic-bastion` | `runic-target` |

**The two credentials differ on purpose.** They are the reason the
`Containerfile` takes build arguments. With one password on both hosts, a chain
that resolved the target's credential and sent it to the bastion as well would
connect, and the bug would ship.

Check the topology before trusting a result from it. All three have to hold:

```bash
getent hosts target.internal            # nothing: the name is the network's, not yours
ssh-keyscan -p 2226 -t ed25519 127.0.0.1 | ssh-keygen -lf -   # the bastion answers
podman port runic-test-target           # nothing: the target publishes no port
```

Then the chain itself, from a throwaway container on the same network, which
keeps `sshpass` off the machine:

```bash
podman run --rm --network runic-jump alpine sh -c '
apk add --no-cache openssh-client sshpass >/dev/null
O="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5"
INNER="sshpass -p runic-bastion ssh $O -p 2222 -W %h:%p jump@runic-test-bastion"
sshpass -p runic-target ssh $O -o "ProxyCommand=$INNER" -p 2222 deploy@target.internal \
  "cat /home/deploy/README"'
```

`hello from the target behind the bastion` is the answer. The other half of the
proof is on the far side: `podman logs runic-test-target` shows the connection
arriving from the bastion's address on the network, never from the host.

The tests that use it are in `against_openssh.rs` with the rest, and ignored
for the same reason:

```sh
cargo test --test against_openssh -- --ignored --nocapture
```

Four of the eight need this pair rather than the single host: the far key is
verified through the chain, a shell opens on a host this machine cannot resolve,
the bastion's password does not open the host behind it, and two hosts ride one
bastion on two channels of a single authenticated session.

Three things this fixture is for, beyond connecting at all:

* **Two host key prompts in one attempt**, each naming its own host. The two
  containers have two keys, so the first connection asks twice. The prompt that
  cannot say which host it is asking about is the one that gets clicked
  through, and this is where that is visible.
* **An error that names the hop.** Stop the target, leave the bastion up, and
  today the chain says `Connection timed out during banner exchange`. That
  sentence is the whole complaint in #133: it is true of both hosts and useful
  about neither.
* **Disconnect order.** `podman logs` on both shows which closed first, and
  whether the bastion was left open.

A bastion that refuses forwarding is a real configuration and worth having on
hand: `podman exec runic-test-bastion sh -c "echo 'AllowTcpForwarding no'
>> /etc/ssh/sshd_config"` and restart it. The chain should fail at the bastion
and say so.

#### The credential the jump host asks for

ADR-0027 lets the bastion prompt when it has nothing saved, which is what makes
a machine with no keychain able to use one at all. Two prompts now arrive in a
row for two different machines, so the thing being checked is mostly whether a
person can tell them apart.

Start from a bastion with no saved credential and no session open on it.

| Do this | Expect |
| --- | --- |
| Connect to the target | the bastion's key is asked about first, then a credential window naming the bastion |
| Keep going to the target's key, and accept it | **the bastion does not ask again.** Accepting that key rebuilds the chain, and the answer already given travels with the decision |
| Cancel the target's key instead | the attempt ends, and nothing is holding what you typed for the bastion |
| Read that window | the heading says the jump host is authenticated first, and the body names the host you actually clicked |
| Answer it, choose *until Runic SSH closes* | the target's own window follows, with the ordinary heading |
| Connect to a second host behind the same bastion | the bastion does not ask again |
| Close the application, reopen, connect | it asks again, and nothing was written anywhere |
| Answer it, choose *in the system keychain* | it does not ask on the next run, and this is the only answer that survives one |
| Cancel the bastion's window | the attempt fails naming the jump host, and `podman exec runic-test-bastion ps` shows no session left behind |

The last row is the one worth doing slowly. A bastion left open by a refusal
holds a slot against the server's `MaxSessions` until the application restarts,
and nothing on screen would name it.

**Lock the keyring for the other half.** On a machine with a secret service,
save the bastion's credential, then lock the keyring and connect. It must
refuse rather than prompt, and say that the keychain holds one and would not
give it up. Prompting there would teach somebody to retype a password instead
of unlocking, and ADR-0027 named that as the case it deliberately does not
cover.

**A slow answer is a new way to fail.** `sshd` closes an unauthenticated
connection after `LoginGraceTime`, two minutes by default, and the bastion now
sits unauthenticated for as long as the window is open. Leave the prompt up for
three minutes and answer it: the failure that arrives reads as the SSH
conversation not finishing, not as a timeout on a prompt.

Host keys survive `podman stop` and `podman start`, because `ssh-keygen -A`
generates only what is missing and the writable layer persists. They do not
survive `podman rm`, which is the same trade the single-host fixture makes.

### On WSL2

Reaching a container in WSL *from a Windows build* is a separate problem:
Windows `127.0.0.1` is not WSL's, and rootless podman is not always picked up by
WSL's localhost forwarding. Use the address from `ip -4 addr show eth0`, which
changes whenever WSL restarts, or set `networkingMode=mirrored` in `.wslconfig`
once and stop thinking about it.

WSLg runs Xwayland without a window manager, so there is no keyboard focus for
anything to be delivered to: `xdotool` clicks land, and typing goes nowhere.
Minimising also does nothing, because the compositor does not iconify, which is
indistinguishable from a broken button and will send you chasing one.

Run the application on a display of its own instead, with a window manager on
it, and both work:

```sh
Xvfb :99 -screen 0 1600x1000x24 -nolisten tcp &
DISPLAY=:99 openbox &
env -u WAYLAND_DISPLAY DISPLAY=:99 GDK_BACKEND=x11 pnpm tauri dev
```

`env -u WAYLAND_DISPLAY` is load-bearing, not tidying. WSL sets
`WAYLAND_DISPLAY=wayland-0` in every shell, and with it set the window opens on
the WSLg compositor and ignores `DISPLAY` entirely: the process starts, no
window is ever mapped on `:99`, and **nothing is printed**. It is
indistinguishable from a build that failed to launch, and the only way to see
what happened is to read `/proc/<pid>/environ`.

`import -window <id>` screenshots it and `xdotool` drives it, both with
`DISPLAY=:99`. Nothing touches the desktop the developer is using.

### What synthetic input can and cannot drive

This list was measured on 2026-08-26, on `:91` with `openbox` running and a
release build, while retaking the README screenshots (#146). It corrects a
claim this document made in two places: that injected keys never reach the
WebKit web process. They do, once something gives the window keyboard focus.

| Gesture | Reaches the webview |
| --- | --- |
| `xdotool type` and `key`, after `windowactivate --sync` | **yes** |
| `Ctrl-Shift-V`, pasting from the clipboard | **yes** |
| Middle click, pasting the primary selection into a form field | **yes** |
| `xdotool click` | **yes** |
| Middle click into the terminal | no |
| Any drag: selecting text, moving a host into a rectangle | no |
| `xdotool type --window <id>` | no |

Two of those are worth keeping in mind. `--window` sends `XSendEvent` and
WebKit ignores it, so a failure there says nothing about whether keys work; use
plain `xdotool type` with the window activated. And a drag failing silently is
what makes it expensive: the pointer moves, the button goes down and up, and
the application simply never hears it, which reads exactly like a bug in the
feature being driven.

A host key prompt or a credential window will time out while you debug the
coordinates. `sshd` closes the connection after its login grace period, and the
error the window shows is "the SSH conversation did not finish", not "you took
too long". Drive the whole sequence in one go.

## Measuring several terminals painting at once

This is issue #123's procedure, and it does **not** need a person driving a
packaged build. The harness runs from a query parameter and posts its own
result back, so nothing has to be typed into a window.

```bash
pnpm vite --port 5199 --strictPort            # a dev server, in one shell
xvfb-run -n 99 -s "-screen 0 1440x900x24" \
  /usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser \
  "http://localhost:5199/?flood=32"           # in another
```

`MiniBrowser` ships with `webkit2gtk-4.1` and is the engine Tauri embeds on
Linux, so this measures the renderer the product actually uses. The result is
printed by the dev server, under `renderer measurement`.

Xvfb means a software rasteriser, which is what the Linux figures in
`docs/measurements/terminal-throughput.md` already are. Running it on the real
display measures a GPU instead, and the two are worth keeping apart.

The run does two things. Flat out says whether there is headroom; paced at the
transport rate, ten seconds per shape, says whether the window keeps answering,
which is the question that was actually asked. Take the paced numbers as the
answer and the flat-out ones as the margin.

## Verifying the capability set

`capabilities/default.json` names one command per line (ADR-0013), and three of
those lines have no caller in this repository. They are invoked by scripts
Tauri injects into the page. No test here covers them, so after a Tauri upgrade
or an edit to that file, drive the five checks below.

| Grant | What proves it survived |
| --- | --- |
| `core:window:allow-start-dragging` | dragging the title bar moves the window |
| `core:window:allow-internal-toggle-maximize` | double-clicking the title bar maximises and restores |
| `core:window:allow-is-maximized` | the middle control switches between the maximise and restore glyphs |
| `core:event:allow-listen` | a connected terminal shows output from the host |
| `core:webview:allow-internal-toggle-devtools` | Ctrl+Shift+I opens the inspector |

**Two of them cannot be driven by `xdotool`.** The double click and the hotkey
never reach their handlers under synthetic input, on Xvfb or on WSLg. That is
not the ACL: granting all 45 commands the four `default` sets used to carry
fails in exactly the same way. Check those two by hand on a real desktop, and
do not read a synthetic failure as a missing permission: the control run is
what tells the two apart.

The other three do work under `xdotool`, on the display described above:

```sh
W=$(DISPLAY=:99 xdotool search --name "Runic SSH" | head -1)
DISPLAY=:99 xdotool getwindowgeometry $W          # before
DISPLAY=:99 xdotool mousemove 700 68 mousedown 1
DISPLAY=:99 xdotool mousemove 800 240 mouseup 1   # window should have moved
```

A wrong permission *name* needs none of this. Tauri's build script validates
every identifier, so a typo or an upstream rename fails `cargo build` with
`Permission ... not found, expected one of ...`. What the checks above cover is
the other half: a permission that is spelled correctly and is no longer the one
the script calls.

## Why a container rather than a public test server

Three public servers were checked on 2026-08-22:

| Host | Result |
| --- | --- |
| `test.rebex.net:22`, `demo` / `password` | authenticates; the shell is **simulated** and runs no commands |
| `github.com:22` | `publickey` only, and its host keys are published at `api.github.com/meta`; useful for verifying trust code, useless for a shell |
| `sdf.org:22` | a real machine, but needs an account and is a shared community system |

None of them can test the case that matters most. Rule 3 says a **changed**
host key blocks the connection, and a public server's key is stable by design,
which is exactly what makes it useless here. The container generates its host
keys at start, so recreating it changes the key:

```sh
podman rm -f runic-test-sshd
podman run -d --name runic-test-sshd -p 2222:2222 runic-test-sshd
```

Connect once before and once after, and the second attempt is the block screen.
That is the single most security-critical screen in the application, and this
is the only way to see it work.

`demo.testfire.net` appears on lists of public SSH test servers and is not one.
It resolves, but nothing answers on port 22; it is IBM's AltoroMutual, a
deliberately vulnerable **web** application, and its `demo` / `demo` credentials
are for that web login.
