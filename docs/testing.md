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

The same container is the only way to reach a live credential exchange by hand.
ADR-0039 retired the separate prompt window: what opens now, when nothing
usable is saved, is that host's own entry in Hosts, with a note saying why.
Reaching it takes a saved session with nothing stored or kept, and a real
server to authenticate against. No amount of clicking gets there without one
that actually asks.

Save a session against it, connect from Sessions with no credential saved, and
the editor opens on the host in Hosts with `session.editor.missingCredential`
showing. For a bastion crossed mid-chain with nothing saved for it, the same
thing happens for the bastion's own entry, found by its `proxyJump`, once the
whole chain has failed rather than mid-connection: there is no longer a window
that pauses the attempt to ask.

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
manager, so a paste can be sent, but selecting text by dragging the mouse does
not, so nothing can be selected and copy is a person's job. See "What
synthetic input can and cannot drive" below before assuming either way.

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
real rectangles. Typing can be sent synthetically, and so, built up in real
steps, can moving a host into an empty rectangle: see "What synthetic input
can and cannot drive" below for the shape a drag needs to actually land.

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

**Four groups flooding is unmeasured.** ADR-0011 measured the renderer against
one terminal. Run `yes` in two of four groups and watch whether the window
stays responsive; if it does not, the limit belongs at two groups and the
measurement belongs in ADR-0019. This lived in the credential-window section
for a while, next to a note about window height it had nothing to do with;
moved here (#242) because a group flooding is not a credential check and never
was one.

### How long a credential is kept

ADR-0025 gave the credential window three answers; ADR-0034 already took
*ask me again next time* out of the wizard's own inline form, and ADR-0039
took the window itself away, so that choice is no longer reachable from any
screen. What is left picks itself, keychain when there is one, otherwise for
the run, and only the second is visible over a single run. Drive it in this
order, against a host with no saved credential:

| Do this | Expect |
| --- | --- |
| Connect from Sessions, authenticate in the wizard's own form, disconnect, connect again | it does not ask |
| Close the application, reopen it, connect | it asks again if the store was unavailable and the run held it; `sessions.json` never held a `credentialId` for that host |
| With a keychain available, authenticate, restart, connect | it does not ask, and `sessions.json` now names an opaque id |
| Look for the secret anywhere but the keychain | it is not in `sessions.json`, not in `settings.json`, and not in any log |

On a machine with no secret service, authenticating always lands on the
run-only answer: that is the case worth having a machine for, since it is the
only one such a machine can give.

### The password block on a host's form

A host's form says whether a password is stored for it, saves one, and forgets
one, and none of that puts a password field on the form. The credential is
collected by connecting once, in the wizard's own Access step, and the
connection closes as soon as the server accepts it (#189). What that leaves to
check is mostly whether the form tells the truth afterwards.

| Do this | Expect |
| --- | --- |
| Open a host with no saved password | the block says none is stored, and offers *Connect once and save a password* |
| Press it | the tab you are taken to is **the session's**, not the form's, and the host key screen appears there |
| Authenticate in the wizard, in the system keychain | a result surface saying the password is saved, and no terminal opens |
| Go back to the form | the block now says one is stored, and offers to replace or to forget it |
| Press *Forget it* | the block goes back to saying none is stored |
| Connect normally | it asks again |

The second row is the one worth reading twice. It was wrong when built: focus
stayed on the form, so the whole sequence ran in a tab nobody was looking at
and the button appeared to do nothing, with the host key screen among the
things nobody saw.

**A password kept for this run does not show in the block** (#197). The block
reads what is on disk, and a credential held in memory until the application
closes is written nowhere, so it shows as no password at all. That is a known
gap, not a failure of this check.

**Forgetting clears both copies.** A credential kept for the run is answered
before the keychain is read, so clearing only the store would leave the next
connection finding it anyway. Check it the slow way: keep one for the run, save
another to the keychain for the same host, forget, and connect. It must ask.

#### Forcing the core to refuse

Two things on this form are only visible when something fails, and neither
failure is easy to arrange: a keychain that refuses a write, and a session file
that cannot be written. Both were driven by making the core return the error,
which is worth writing down because the alternative is not driving them at all.

Patch the command to return the failure, run, then revert before the gate:

```rust
// in commands/sessions.rs, temporarily
return Err(IpcError::from(Error::KeychainWriteFailed {
    reason: "forced for driving".to_owned(),
}));
```

`SettingsUnwritable` needs a `PathBuf` and an `io::Error`, not two strings,
which the compiler will tell you.

| Force this | Expect |
| --- | --- |
| `forget_credential` refuses | a line above the form: *The password was not removed*, saying the keychain refused and to unlock it |
| `save_session` refuses | *This host was not saved*, the tab **still open**, and what you typed still in the fields |
| Either, then press *Dismiss* | the line goes, and the fields are untouched throughout |

The tab staying open is the point of the second row. A form that closed on a
save the core refused would take the draft with it and leave the host unsaved.

Revert the patch. A forced failure left in the tree passes every test in this
repository, because nothing here connects to a keychain.

### The credential fields, inline in the wizard's Access step

This used to be its own window (ADR-0008), positioned over the main one,
closable four ways because ADR-0028 spent the title bar on the fourth, and
offering a three-way choice of where to keep what it collected. ADR-0034
retired that choice (the wizard states what will happen rather than asking),
and ADR-0039 retired the window itself: the fields are `InlineCredentialForm`,
a panel in the wizard's own Access step, in the main window, with nothing left
to position, alt-tab to, or close a fourth way. The positioning, title-bar and
keep-option checks that used to live here no longer have a subject; #242
tracked re-driving what still applies against the inline shape.

**The jump-host layout.** `App.tsx`'s own comment on `bastionStage` says why
this is still worth a row of its own: only the wizard's own test ever needs it,
because that is the one call where a bastion mid-chain can turn up needing a
credential nobody saved, with nowhere else to ask for one now that the separate
window is not going to open. Everywhere else a missing credential redirects to
that host's own entry in Hosts (ADR-0039); this is the one path that still
shows a hop mid-flow, and `credential.hop.bastion` is the string that says so.

| Do this | Expect |
| --- | --- |
| Save a jump host with nothing stored for it, then a target through it with nothing stored either, and test the target from its own Access step | the hop sentence, the method picker and the password field all render for the jump host first, nothing scrolls |
| Authenticate the jump host | the breadcrumb's third segment changes from the jump host's name to *Entrar*, and the target's own field appears with no hop sentence above it |
| Authenticate the target | the same *the password is saved* surface `docs/testing.md` already describes for a direct host |

Confirmed on Linux on 2026-08-30, driving the real `runic-test-bastion` /
`runic-test-target` chain from #133 through the actual `InlineCredentialForm`,
in Brazilian Portuguese: the hop sentence is the longest of the three
catalogues' versions of `credential.hop.bastion`, and it still fit inside the
panel's `max-w-[440px]` with room to spare, no scrollbar appeared, and nothing
was clipped. The old "every keep option visible" wording no longer applies
because there is no keep option to show (ADR-0034); what replaced it, the hop
sentence plus the method picker plus one field, fits with more room than the
three-way choice it stands in for ever needed.

**Paste into all three fields.** The form sits in the main window now, which
carries the application's ordinary capabilities rather than the retired
window's empty one, so there is even less reason for this not to work than
when it was first written. Pasting still needs no grant either way: the
browser raises the event from the keystroke.

| Paste into | With |
| --- | --- |
| the password field | Ctrl-Shift-V under WebKitGTK, Ctrl-V elsewhere |
| the private key box | the same, and the line breaks survive |
| the passphrase field | the same, or a middle-click paste of the primary selection |

Confirmed on Linux under WebKitGTK on 2026-08-30, all three, against the
current inline form: a pasted password authenticated against a real fixture
(`docs/testing.md`'s own `runic-test-sshd`) rather than only looking right in
the field, and a pasted multi-line key kept its line breaks. Windows and macOS
are still unconfirmed, and #116 stays open for them: WebView2 and WKWebView are
different engines and this is exactly the sort of thing they differ on.

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
a machine with no keychain able to use one at all. ADR-0039 changed *where*
that happens for an ordinary connect from Sessions: the bastion no longer
prompts mid-chain, so a target and a bastion that both need a credential now
takes separate visits to Hosts rather than one continuous window sequence.
This whole section needs a live pass to confirm; it is written from the code,
not driven.

Start from a bastion with no saved credential, and a target behind it with
none either, and no session open on either.

| Do this | Expect |
| --- | --- |
| Connect to the target from Sessions | the whole attempt fails at once, no window, nothing waiting, and the bastion's own entry opens in Hosts with `session.editor.missingCredential` showing |
| Authenticate there, in the wizard's Access step, choose *in the system keychain* | the result surface says the password is saved; the target still has not been reached |
| Go back to Sessions, connect to the target again | the bastion's key and credential are silently reused, and now it is the **target's own** entry that opens in Hosts, with the same notice |
| Authenticate there too | the result surface says the password is saved |
| Go back to Sessions, connect to the target a third time | both credentials are reused silently, the target's key is checked, and the terminal opens |
| Connect to a second host behind the same bastion | the bastion is not asked about again |
| Close the application, reopen, connect | asks again only for whichever answer was *until Runic SSH closes* rather than *in the system keychain*; `podman exec runic-test-bastion ps` shows no leftover session from any attempt above |

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

#### What the window admits while a chain is open

A session behind a bastion opens a second connection, to the bastion, which is
authenticated and which used to appear nowhere at all (#168). The bastion's own
row said "saved, not connected" while the application was logged in to it.

Two places say it now, answering two different questions, and both are worth
checking because both are derived rather than reported.

| Do this | Expect |
| --- | --- |
| With everything closed, connect to the target | the **bastion's row** takes a marker of its own, a dot with the line continuing past it on both sides |
| Read the status bar | a cell naming the host this session travels through, beside the host it is about |
| Connect a second host behind the same bastion | the bastion's row is unchanged: it is carrying, not carrying twice |
| Close the first of the two | still carrying, because the second still rides it |
| Close the second | back to a plain saved host |
| Connect a host with no jump host | **no** cell on the bar |
| Open the bastion as its own session, then a host behind it | its row says connected, **not** carrying |

The last row is a rule rather than a detail. `connected` already admits a
connection exists, which is the whole complaint, so carrying never replaces it.
It does replace `unreachable`, because a host currently carrying a session is
demonstrably reachable, and it never replaces the blocked-host-key marker.

**Take the jump host off a connected session and the row must not change.** The
fact is captured when the session opens, not recomputed from the session file,
because the connection does not close when the file is edited. Doing it the
other way was tried and is wrong in both directions: this way, and giving a jump
host to a session already open directly, which would mark a bastion carrying
nothing.

**The sharing is narrower than the sidebar implies** (#200). A bastion the chain
opens itself is not registered, so two hosts behind an unopened bastion cost it
two connections. `podman exec runic-test-bastion ps` is where that is visible,
and the row says "carrying" either way, which is true and is not a count.

#### A jump host whose password the keychain refused

The keychain refusing is reported for the host you clicked and used to be
dropped silently for the hop with no tab (#191). Forcing that refusal is the
same technique as in *Forcing the core to refuse* above, applied to
`persist_credential`.

| Do this | Expect |
| --- | --- |
| Force the refusal, connect to the target, ask to keep the **bastion's** password | the session opens, and the status bar carries *Jump host not saved* |
| Hover it | it names the bastion and says that host asks again next time |
| Ask to keep the **target's** password instead | *Not saved*, with the wording for this session's own credential |
| Accept a host key so the chain rebuilds | the refusal is still reported, once, and the bastion is not asked a second time |

Two different badges rather than one with a tooltip. They read identically at a
glance otherwise, and the difference is which machine will ask again.

### A host that already serves as a jump host

The core refuses a jump host for a host that other saved hosts are reached
through, because allowing it would break hosts the user never opened (#171).
The form is where that is visible, and what it does is stop offering the
control rather than let the save be turned down.

| Do this | Expect |
| --- | --- |
| Open the form for a host nothing is behind | *Reached through* offers every eligible host |
| Open the form for the **bastion** | no select at all, and a sentence naming the hosts reached through it |
| With two behind it | the sentence lists both, joined the way the language joins a list |
| A host saved with a jump host **before** this rule existed | the select appears holding that value alone, plus a way to clear it |

The last row is the only way a broken session gets repaired, so it is worth
building one: write the `proxyJump` into `sessions.json` by hand on a host that
already carries others, and open the form.

### SFTP

ADR-0044 through ADR-0049. One fixture on 2222 is enough for browsing,
transferring toward `localhost`, and every create/rename/delete/folder-copy
row below; the remote-to-remote row needs a second instance on 2223, the same
one `docs/adr/0045-let-sftp-fan-out-to-several-destinations.md`'s own test
uses:

```sh
podman run -d --name runic-test-sshd-2223 -p 2223:2222 runic-test-sshd
```

The rail's third icon opens the workspace. It carries a numeric badge, how
many panes are currently occupied, and it locks shut while synchronised
typing is armed, the same rule Home follows, because a workspace switch mid
broadcast is the wrong moment to invite one.

**Filling a pane is always a drag**, from the same saved-hosts list Sessions
uses, now shared between both workspaces (ADR-0046). `localhost` sits pinned
above the search box and drags the same way a saved host does. A plain click
on any row in that sidebar goes to the **source** pane, always; a
destination is only ever filled by dropping a row onto one of its slots.
There is no click-to-fill-a-destination shortcut, which is worth checking for
directly since it is the one place this UI's two input styles, click and
drag, do different things rather than the same thing two ways.

| Do this | Expect |
| --- | --- |
| Click a saved host in the sidebar | it fills the source pane, replacing whatever was there |
| Click `localhost` | it fills the source pane the same way |
| Drag a saved host onto an empty destination slot | it fills that slot and starts browsing there |
| Drag a host onto an **occupied** slot | it replaces that slot outright, no confirmation |
| Occupy a slot already marked as spared from an earlier session | it resets to receiving, not spared |

The drag itself needs the multi-step form "What synthetic input can and
cannot drive" describes below, not a single jump; that section's own
2026-09-01 measurement is this exact gesture, dragging a saved host into an
SFTP destination slot.

Splitting the destination side into 1 through 4 rows is the toolbar's fold
control (`sftp.split.into`), mirroring the shape control Sessions already
has. Lowering the count never hides a slot that already has a host in it,
only how many empty drop targets are pre-drawn.

**Navigating a pane**: a row click enters a directory; the `..` row, the Up
chevron, and a clickable breadcrumb segment all go up, three ways to do the
one thing, all worth trying at least once. Back is one level of history, no
forward, so a wrong turn is undone by Back rather than retraced by hand.

| Do this | Expect |
| --- | --- |
| Click a folder row | enters it, breadcrumb grows one segment |
| Click a breadcrumb segment | jumps straight there |
| Click `..`, or the Up chevron | goes to the parent, same destination either way |
| Click Back after entering three directories | returns one level, not to the root |
| Navigate into a directory you lack permission for | the whole listing is replaced by one red line, not a blank pane |

**Selecting and sending** live only on the source pane; a destination pane
has no checkbox and cannot be dragged from at all.

| Do this | Expect |
| --- | --- |
| Click a file row | selects only it |
| `Ctrl`/`Cmd`-click a file | toggles it without touching the rest |
| Shift-click | selects the range between the last plain click and this one |
| Click a directory row, plain | opens it, exactly like before |
| `Ctrl`/`Cmd`-click or Shift-click a directory | selects it instead of opening it |
| Tick a directory's own checkbox | selects it without navigating in, the one way to do that with no modifier key |
| `Ctrl`/`Cmd`-A with focus in the source listing | selects every row currently listed |
| `Ctrl`/`Cmd`-A with focus in a destination pane | nothing, by design: the shortcut is not wired there |
| Select two files, press Send | one transfer per file, to every occupied and receiving destination at once |
| Select a folder, press Send | a recursive copy, sequential inside itself, to every occupied and receiving destination |
| Drag a file straight onto one destination pane | reaches only that one, **even if its receive toggle currently spares it from Send** |
| Navigate away and back in the source pane | the selection from before is gone |

That last drag row and the receive toggle disagreeing on purpose is worth
seeing once rather than taking on faith: spare a destination, then drag a
file onto it directly. It lands anyway.

**Cancelling** has no group control: a fan-out to three destinations is three
rows in the transfers bar at the bottom of the window, and each is cancelled
or dismissed on its own.

| Do this | Expect |
| --- | --- |
| Cancel a file transfer mid-flight | its row turns into a grey "Cancelled" line, not red "Failed" |
| Cancel a folder copy mid-flight | the file in flight finishes, no further file in the tree is dispatched, the row shows the count reached so far |
| Dismiss a finished row | it leaves the list; nothing on disk changes |
| Fan a file out to three destinations, cancel one | the other two keep running and finish on their own |

**Create, rename and delete** (ADR-0048) work on any pane, source or
destination, right-click for the menu:

| Do this | Expect |
| --- | --- |
| Click the folder-plus icon in the nav bar | an inline "New folder" row appears, pre-selected, ready to type over |
| Press Escape while naming it | discarded, nothing created |
| Right-click one file, not part of a selection | menu offers Rename and Delete |
| Right-click a file that is part of a multi-selection | menu offers only Delete, for the whole selection |
| Delete a folder | removes it and everything inside, no "must be empty" refusal, one line under the item warns before you click |
| Cause a rename to collide with an existing name | the pane's own listing stays correct; a red banner under the nav bar names the failure, the row list is untouched |

**A folder copy's progress is a file count, never bytes** ("N of M files"),
and a copy that finishes with failures says how many, not which ones:

| Do this | Expect |
| --- | --- |
| Copy a folder with everything readable | progress bar in the accent colour while running, green once done |
| Copy a folder where one file's permission is refused mid-copy | the copy keeps going past it; finishes amber, "N of M files, K failed" |
| Look for which file failed | it is not shown anywhere in this UI; only the count is |

That last row is worth confirming rather than assuming: a tester expecting a
per-file error list will not find one, and that is the shipped shape
(ADR-0049), not a gap in the walkthrough.

**Remote-to-remote**, against the second fixture on 2223: drag one host into
the source, a different host into a destination, and send a file between
them with neither endpoint being this machine. The transfers bar draws this
with its own icon, two arrows crossing, distinct from the plain download and
upload arrows, which is the detail to check if the two are being told apart
by eye rather than by reading the row.

**What this section cannot assert from a test**: the same limit "Groups and
synchronised typing" names above, restated for a second feature that leans on
it just as hard. Whether a row is actually draggable, whether a drop target
highlights under the pointer, whether the transfers bar animates in rather
than appearing already full, is what a person watching the window answers.
The IPC layer and the pure reducers in `browser.ts` have their own test
coverage; this section is for the part above them that no assertion reaches.

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
The drag rows were re-measured on 2026-09-01 (dragging a saved host into an
SFTP destination slot, then a folder row between panes) and corrected below;
everything else here is still the 2026-08-26 measurement.

| Gesture | Reaches the webview |
| --- | --- |
| `xdotool type` and `key`, after `windowactivate --sync` | **yes** |
| `Ctrl-Shift-V`, pasting from the clipboard | **yes** |
| Middle click, pasting the primary selection into a form field | **yes** |
| `xdotool click` | **yes** |
| An HTML5 drag, built up in real steps (see below) | **yes** |
| Middle click into the terminal | no |
| Selecting text by dragging the mouse | no |
| A single-jump drag: `mousemove` straight to the target, `mousedown`/`mouseup` | no |
| `xdotool type --window <id>` | no |

One of those is worth keeping in mind on its own: `--window` sends
`XSendEvent` and WebKit ignores it, so a failure there says nothing about
whether keys work; use plain `xdotool type` with the window activated.

**A drag needs real steps, not a jump.** `xdotool mousemove ...; mousedown 1;
mousemove ...` (several calls, each a small step, roughly 150ms apart)
`; mouseup 1` reliably fires a real `dragstart`/`drop` on a `draggable`
element in this webview. A single `mousemove` straight to the target followed
by `mousedown`/`mouseup` does not: WebKit needs the pointer to actually cross
its drag-start distance threshold before it begins a drag, and one jump never
does. This was the source of an earlier, wrong "a drag never reaches it"
finding here: the failure is silent either way, so a single-jump attempt and a
webview genuinely ignoring the gesture look identical, and only the multi-step
form tells them apart. It has not been checked whether the same distance
threshold applies to selecting text by dragging; that row above is still the
2026-08-26 measurement, unrevisited.

**Read coordinates off `xwininfo`, not off `xdotool getwindowgeometry.`** With a
window manager running they disagree: `xdotool` reports the frame and
`xwininfo`'s *Absolute upper-left* reports the client area. On the credential
window that is 22 points, which is enough to miss the password field and look
exactly like a webview ignoring clicks. `getwindowgeometry` is right for
measuring whether a window *moved*, which is what the capability section below
uses it for, because there only the delta matters.

Crop and enlarge what you captured rather than trusting a coordinate twice.
`import -window root -crop WxH+X+Y +repage -resize 400%` on the row or the cell
being checked is how three of today's defects were found, and each of them
passed every test in this repository.

A host key prompt or the wizard's own inline credential form will time out
while you debug the coordinates. `sshd` closes the connection after its login
grace period, and the failure surface says "the SSH conversation did not
finish", not "you took too long". Drive the whole sequence in one go.

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
