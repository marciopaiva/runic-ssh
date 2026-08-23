# ADR-0016: Give a connection a deadline

* **Status**: Accepted
* **Date**: 2026-08-23

## Context

Runic SSH puts no time limit on opening a connection, and neither does anything
underneath it.

`ssh::connection::connect_reporting` builds `client::Config::default()`. In
russh 0.63.0 that leaves `inactivity_timeout` at `None`, and russh has no
connect timeout of its own — `client::connect` resolves the address and hands
the socket to `TcpStream::connect`, which inherits the kernel's. On Linux that
is `tcp_syn_retries`, six by default, or roughly 127 seconds before the SYN
gives up.

Two failures follow, and they are not the same size.

A host that never answers costs about two minutes of a screen that says
`connecting` and nothing else. That is bad, and it is bounded.

A host that **completes the TCP handshake and then stops talking** is not
bounded at all. No retry budget is spent, because the connection succeeded;
russh waits for a protocol banner that never arrives; and with
`inactivity_timeout: None` there is nothing that will ever fire. A firewall that
accepts the connection and drops the reply, a server too loaded to finish the
key exchange, a middlebox terminating TCP and forwarding nothing — all of these
leave the attempt pending until the application is closed. This was reproduced
in a test that binds a socket, accepts, and says nothing.

The interface now offers a Cancel while an attempt is running (ADR-0015), which
gives the user a way out. It does not give the *application* one: a cancel
abandons the answer, it does not stop the work, because there is nothing to
stop it with.

Section 6 of the working agreement says anything touching the network is async
and must never block the IPC thread. It is not blocked here — but "not blocked"
and "will finish" are different claims, and only the first one was true.

## Options considered

### Option A: leave it to the operating system

Do nothing in the client, and rely on TCP giving up. This is what OpenSSH does
by default: `ConnectTimeout` is unset unless the user asks for one.

It costs nothing to implement and matches a tool people already trust. It also
does not address the failure that matters: the OS timeout only exists before
the connection is established, so the unbounded case stays unbounded. It would
leave the application with a state it can enter and never leave.

### Option B: one deadline covering connect and handshake

Wrap the whole of `client::connect` in `tokio::time::timeout`. When it fires,
the future is dropped, which closes the socket with it — nothing is left
half-negotiated on either end.

One number covers both failures, and the expensive one is the reason the number
exists. The cost is that a legitimately slow link now has a ceiling, and the
ceiling is a guess: too low and a working connection is refused, too high and
the hang it exists to prevent stays uncomfortable.

### Option C: separate deadlines for the socket and the handshake

Time the TCP connect and the SSH negotiation independently, so each can be
tuned to what it actually does — a connect is fast or it is wrong, while a
handshake on a loaded server can legitimately take seconds.

More accurate, and more surface: two constants to explain, two failure paths to
distinguish, two messages to write and translate. russh does not expose the
seam, so it would mean connecting the socket separately and handing it over,
which is a larger change to a module that currently has one entry point.

## Decision

Option B, with a twenty-second deadline covering the connect and the handshake
together, and a `ConnectionError::TimedOut` distinct from `Unreachable`.

Twenty seconds is not a measurement, and pretending otherwise would be worse
than admitting it. It is chosen to sit well above a slow link and a busy server,
and well below the point where a person concludes the application has hung.
Option C is the better model and stays available: if the two failures turn out
to want different numbers, the seam to split them is this one function.

The deadline is applied **only while opening**. It is deliberately not an
inactivity timeout on the established session: this is a client people leave
connected and idle for hours, and a timeout there would close the terminal they
walked away from — the same class of failure this decision exists to remove,
pointed at a different moment.

`TimedOut` is separate from `Unreachable` because they send the user to
different places. "Nothing answered at that address and port" asks them to check
whether the host is up and whether the port is right. On a timeout the host
usually *did* answer on the right port, and that advice is a wrong turn.

## Consequences

**Good**: the application no longer has a state it can enter and never leave. A
stalled handshake ends in an error the interface already knows how to draw, on
the session's own panel, with a Try again that means something. The timeout is a
parameter on `connect_within` rather than a constant read at the call site, so
the behaviour is covered by a test that runs in a quarter of a second instead of
twenty.

**Bad**: twenty seconds is a guess, and the first person it hurts will be
someone on a link where the handshake legitimately takes longer. They have no
way to raise it — there is no setting for this, and adding one is its own
decision. Until then the answer is to try again, which is the wrong answer if
the link is reliably that slow.

**Bad**: one number covers two different events, so neither is tuned. A connect
that takes nineteen seconds is almost certainly broken, and this will wait for
it anyway.

**Follow-up**: expose the deadline as a per-session setting if anyone hits the
ceiling on a real link — the value already travels as a parameter, so the work
is storage and interface, not transport. Revisit Option C if the connect and the
handshake turn out to want different numbers. Neither is in the v0.1.0 scope.
