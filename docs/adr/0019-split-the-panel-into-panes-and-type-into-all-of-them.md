# ADR-0019: Split the panel into panes, and type into all of them

* **Status**: Accepted
* **Date**: 2026-08-24

Amends ADR-0015. The rule it set is kept; one word in it changes.

## Context

Somebody who administers servers rarely looks at one. Checking three machines
side by side is ordinary, and running the same command on the five in a pool is
what the job is. Runic SSH shows one session at a time: the panel belongs to the
focused tab, and `README.md` lists split panes among the things that do not
exist.

Three things constrain the answer.

**The session model is one shell per connection, and that is deliberate.**
`Registry::has_shell` answers "has this handle ever had a shell" and is never
cleared, so a repeat `open_terminal` returns `terminalAlreadyOpen`. ADR-0014
made that a rule after #94, where switching tabs opened a second shell and
abandoned the first. Any pane holding a second terminal on the same host has to
go through that decision rather than around it.

**The surfaces are already placed by session.** ADR-0015 put the host key
question, the connecting screen and the failure in the panel of the session they
name, and said plainly why: a modal blocks the window while the thing it is
asking about is one connection, and in a client whose normal state is several
open connections a question about one of them must not stop the others. It also
said only the focused session's panel is visible, which is the sentence a split
falsifies.

**Typing into several hosts at once is not a layout feature.** It is the one
control in this application whose blast radius is larger than the host being
looked at, and `docs/security-model.md` already lists terminal contents as an
asset that frequently holds tokens and customer data.

## Options considered

### Option A: a tree of splits, as tmux has

Any pane divides horizontally or vertically, without limit, held as a tree.

It is what somebody arriving from tmux expects, and it is the shape that never
has to be revisited: three panes over one, a column beside two rows, anything.

The cost is machinery. Directional movement between panes, collapsing a node
when its pane closes, serialising the tree so a window can be restored, and a
sensible answer to what "close this pane" means when the pane is a subtree.
Against a project whose argument is being small and auditable, that is the most
expensive thing in the repository, bought before anybody has used a second pane
at all.

### Option B: fixed shapes, equal parts

Two columns, two rows, or four in a grid. Equal parts, no draggable divider, at
most four panes.

The geometry becomes a table of rectangles, and which session is in which
rectangle becomes a pure function next to `mountedTerminals` and `resolveFocus`.
Everything that already places a surface by session keeps working: a pane is a
panel with a smaller rectangle.

It forecloses nothing structurally, and it will annoy somebody who wants 70/30.
Four panes is a guess rather than a measurement.

### Option C: a second window per session

Let a session be torn off into its own window, and let the window manager do the
tiling.

No layout code at all, and the tiling is better than ours would be. It also
means several webviews, each rendering hostile remote output, each needing its
own capability set, and it puts the split outside the application where a
synchronised-input switch has nothing to span.

## Decision

Option B, with panes holding sessions that are already connected. A second shell
on the same host is not part of this: it needs `Entry.input` to become a map,
`terminal://output` to be keyed by pane as well as handle, and `terminal_flood.rs`
rewritten, and none of that is needed to put web-01 beside db-01. It is recorded
as work rather than dismissed.

**ADR-0015's rule keeps its shape and changes one word.** A surface belongs to a
session, to a stored host, or to the application. A session's surface renders in
that session's **pane**; a host's is a tab named for it; the application's is a
tab. The only separate window is the credential prompt, because it carries a
secret. The editor and the settings panel are not session surfaces and go on
taking the whole panel, per ADR-0017.

Picking a tab fills an empty pane if there is one, replaces the focused pane if
there is not, and moves nothing when the session is already on screen. The empty
pane comes first because it cannot be focused: focus points at a session and an
empty pane has none, so without that ordering an empty pane would be a rectangle
asking to be filled with no way to fill it.

Each pane is headed with its session's name and `user@host`. With one terminal
the tab strip answers that and the header is absent. With four it is the only
thing on screen naming the host, since the shell prompt says whatever the remote
end put in `PS1`, and reading a hostname off the far side of the channel is a
poor way to decide what to run on all of them. The header is also where the
focus marker lives: with typing synchronised every pane carries the same warning
edge on purpose, which leaves the border nothing left to say about focus while
the status bar is describing one pane in particular.

A session's surface is not drawn at all when that session is in no pane. It used
to be mounted and hidden, because there was always exactly one panel it belonged
to; now there may be none, and drawing it anywhere else would be a claim about
which terminal it concerns.

**Synchronised input is one switch, off by default, spanning every pane that has
a session in it.** Per-pane opt-in was rejected: it is more flexible and much
harder to make obvious, because the state becomes a subset the user has to check
pane by pane before pressing Return, and being obvious is the property that
matters here. The switch disarms itself whenever the set of panes changes.

While it is armed, every paste is shown before it is sent, single lines and
bracketed pastes included. ADR-0018 asks the question when the remote shell
would run each line; this asks it when the paste reaches more than one machine,
which is a different danger with no protocol feature behind it.

## Consequences

**Good**: no new dependency, no capability, and no Rust. `send_input` already
took one handle at a time and the frontend already filtered output per handle —
the comment in `src/ipc/terminal.ts` anticipating "a second terminal must not
receive the first one's output" was written for exactly this. ADR-0014 is
untouched: one terminal per session, one shell per handle, hidden terminals
still measuring a real box. With the layout set to one pane the panel is what it
was, which is also the rollback.

The geometry, the resolution and the fan-out are pure functions asserted without
a DOM, which is the only way to catch a session drawn in two panes: that is two
React children sharing a key, which is one xterm silently reusing the other's.

**Bad**: a password typed at a `sudo` prompt with the switch armed goes to every
pane, where it lands on hosts that were not asking for it, is echoed to their
screens, and may reach their shell history. **A password prompt cannot be
detected.** The remote pty turns the echo off, on the far side of the channel;
all that arrives here is a byte stream. There is no signal to key on, so the
mitigation is that the switch is loud and off by default, not that it is clever.
That is a real limit and it is written here rather than left for somebody to
discover.

A destructive command reaches every pane with one Return, which is the feature
working correctly and is the reason it is not on by default.

Writes to one session are now queued, so the ordering that used to hold because
one person types slowly is stated instead of assumed. That is a small behaviour
change to a path every keystroke takes.

ADR-0011 measured the renderer against **one** terminal painting, and concluded
the transport bound is what the decision rests on, to be measured again if that
bound moves. Per session it has not; in aggregate four panes can deliver four
times what one could. Nobody has that number. Until somebody does, four panes is
a limit chosen for the shape of the layout and not for what the renderer was
shown to take.

Everything on the tab strip is still one tab per session, so a split of four is
four tabs and four panes describing the same four things. Whether that reads as
redundant or as reassuring is not something reading the code answers.

**Follow-up**: a second shell on a host already connected, multiplexed over the
transport that exists, which is what SSH channels are for. A draggable divider.
A keyboard shortcut for splitting and for moving between panes, which this round
leaves out because the terminal swallows nearly everything and the only path
that works today is the palette's own capture listener. Per-pane opt-in for the
switch, if "all of them" turns out to chafe. Revisit the four-pane limit when
somebody measures four terminals painting at once, and lower it to two if the
measurement says so rather than raising it because nothing has broken yet.
