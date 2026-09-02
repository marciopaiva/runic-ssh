# ADR-0053: Stop Sessions and SFTP from tearing each other's connection down

* **Status**: Accepted
* **Date**: 2026-09-02

## Context

SFTP and Sessions share one SSH connection per host on purpose: `Connection`
keeps the `russh` transport alive for the life of a session, and a shell and
an SFTP subsystem are two channels multiplexed over it, which is what SSH is
for (`docs/architecture.md`, already cited by #120 for the same reason). That
part of the design is correct and not what this ADR changes.

What is not correct: nothing downstream of "a handle exists" asks *why* it
exists, and two real bugs follow from that, reported directly by the
maintainer.

**Opening a host in SFTP opens a real shell for it too.**
`assignSftpEndpoint` (`App.tsx:767-799`) connects a host dragged into the SFTP
workspace through the exact same `connect(sessionId)` `useConnect` gives
Sessions. That much is fine. But which sessions "earn a tab" is decided by
`openTabs` (`src/features/chrome/tabs.ts`), and its filter is `live.handle !==
null || live.kind === 'connecting' || live.session.id === attentionId`, no
distinction for which workspace asked. `mounted = mountedTerminals(tabs)`
(`App.tsx:529`) then mounts a `TerminalView` for every tab, and
`useTerminal`'s own effect (`use-terminal.ts`) calls `openTerminal(handle,
...)` on mount, which is what actually opens a shell. An SFTP-only connection
was never supposed to have one.

**Closing a Sessions tab kills an SFTP connection still in use.**
`disconnect(sessionId)` (`App.tsx:713-724`), called from the tab's own close
button, a group closing, and the row menu's "disconnect" alike, calls
`disconnectSession(live.handle)` unconditionally. If that same handle is
`fanout`'s current source or one of its destinations, SFTP's connection dies
with it, mid-browse, because Sessions decided it was done with a shell nobody
else was told about.

Both bugs have the same root: a `LiveSession`'s only signal today is "is this
connected" (`handle !== null`), asked to answer two different questions,
"does Sessions want a tab for this" and "is it safe to actually close this."

## Options considered

### Option A: Track who actually wants the connection, keep it shared

Add one new piece of state, which sessions Sessions has actually asked a
shell for, and use it to gate both the tab filter and the teardown: a tab (and
therefore a shell) only exists for a session Sessions itself asked for, and
`disconnect` only calls `disconnectSession` once nothing, neither a Sessions
tab nor an SFTP endpoint, still needs the handle.

**Cost**: one new piece of state (`terminalWanted`, a set of session ids) and
a handful of call sites that already exist (`activate`, `openHere`, `onOpened`,
`disconnect`) need to read or write it. **Forecloses**: nothing; the shared
connection stays shared, which is the property #120 already argued for.

### Option B: Never share the connection between Sessions and SFTP

SFTP always opens its own SSH connection to a host, independent of whatever
Sessions is doing with the same host.

**Cost**: two authentications and two host-key checks for one host used from
both places at once, and it argues against the transport's own multiplexing,
which `docs/architecture.md` already documents as the reason one connection
serves more than one channel. **Forecloses**: the efficiency the shared
connection exists for in the first place. Named to be set aside, not a real
contender: the maintainer's own report was about the two features tearing
each other down, not about wanting two separate sockets.

## Decision

Option A. A new `terminalWanted: ReadonlySet<string>` in `App.tsx`, set
wherever Sessions itself asks for a session (`activate`, `openHere`, and
`onOpened`'s own Sessions branch, as a safety net for any path that reaches a
settled connection without going through the first two), cleared when
Sessions is done with it (`disconnect`, and the abandoned/failed branches of
`onOpened`'s sibling callbacks, for hygiene rather than correctness, since a
stale id with no handle and no in-progress attempt already fails every other
part of the filter).

`openTabs` gains `terminalWanted` as a parameter and gates its existing
condition with it: `terminalWanted.has(id) && (handle !== null || connecting
|| id === attentionId)`. This also fixes a second-order version of the same
bug: an SFTP-initiated connection that stops on a host-key decision used to
set `attentionId` and earn a tab in Sessions too, even though the actual
decision surface renders over the SFTP pane. Gating on `terminalWanted`
closes that the same way.

`disconnect` checks `fanout`'s current source and destinations for the
handle being closed before calling `disconnectSession`; if SFTP still holds
it, the Sessions tab and `terminalWanted` entry go away but the connection
itself does not.

## Consequences

**Good**: opening a host in SFTP no longer starts a shell nobody asked for,
and no longer creates a tab in Sessions. Closing a Sessions tab no longer
takes an SFTP browse session down with it, in either direction covered by
what the maintainer reported.

**Bad**: this is one more small piece of UI-local state to keep in sync by
hand at each call site, rather than something derived purely from `sessions`
the way `openTabs` used to be. It does not fix the reverse gap already
present before this ADR and left as-is: clearing an SFTP endpoint
(`fanout.clearDestination`) never calls `disconnect` at all today, so a
connection opened purely for SFTP is never proactively closed when that pane
empties, `terminalWanted` or not. That is a real, separate leak, named here
rather than fixed as a side effect of this change.

**Follow-up**: whether an emptied SFTP slot should disconnect a connection
nothing else is using is its own decision, not assumed by this one.
