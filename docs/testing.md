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
