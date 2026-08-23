# Testing against a real SSH server

Every SSH test in this repository runs against `russh`'s own server, in
process, on a loopback port. That keeps CI fast and needs no `sshd` on three
platforms' runners — and it shares an implementation with the client, which
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
open and the server has asked for a credential — so no amount of clicking gets
there without a server that asks.

Save a session against it, connect, accept the host key, and the prompt window
opens. That path found a bug three passing tests did not: `prompt_url` was
correct and tested, and `open_window` built the URL a second time and got it
wrong, so every prompt opened onto "this prompt is no longer valid".

Two things about the container matter when driving it rather than testing it:

* **Host keys change every time it is recreated**, which is the point (see
  below) and a nuisance here — a recreated container makes a saved session hit
  the changed-key block instead of the prompt. Publish it on a second port
  rather than clearing `known_hosts`; a port with no entry takes the
  unknown-key path, and the entry you already trust stays valid.
* **The fingerprint is worth checking by eye**, since this is the one screen
  where the application's own computation is the thing under test:

  ```sh
  ssh-keyscan -p 2222 -t ed25519 127.0.0.1 | ssh-keygen -lf -
  ```

### On WSL2

WSLg runs Xwayland without a window manager, so there is no keyboard focus for
anything to be delivered to: `xdotool` clicks land, and typing goes nowhere.
Minimising also does nothing, because the compositor does not iconify — which is
indistinguishable from a broken button and will send you chasing one.

Run the application on a display of its own instead, with a window manager on
it, and both work:

```sh
Xvfb :99 -screen 0 1600x1000x24 -nolisten tcp &
DISPLAY=:99 openbox &
DISPLAY=:99 GDK_BACKEND=x11 pnpm tauri dev
```

`import -window <id>` screenshots it and `xdotool` drives it, both with
`DISPLAY=:99`. Nothing touches the desktop the developer is using.

## Why a container rather than a public test server

Three public servers were checked on 2026-08-22:

| Host | Result |
| --- | --- |
| `test.rebex.net:22`, `demo` / `password` | authenticates; the shell is **simulated** and runs no commands |
| `github.com:22` | `publickey` only, and its host keys are published at `api.github.com/meta` — useful for verifying trust code, useless for a shell |
| `sdf.org:22` | a real machine, but needs an account and is a shared community system |

None of them can test the case that matters most. Rule 3 says a **changed**
host key blocks the connection, and a public server's key is stable by design —
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
