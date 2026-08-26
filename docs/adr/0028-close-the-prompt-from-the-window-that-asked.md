# ADR-0028: Close the credential prompt from the window that asked, and take its title bar off

* **Status**: Accepted
* **Date**: 2026-08-26

Amends ADR-0008. Which document collects the secret is not amended and is the
whole of what that decision is for. What changes is how a prompt that cannot
answer for itself is closed.

## Context

ADR-0008 put the credential prompt in a window of its own, and named the worst
failure of that design in its own Bad section: a window that fails to open, or
opens and never renders, leaves a connection waiting on a reply that will never
come. The application reads as hung, and there is nothing on screen to press.

`commands/credential.rs` answered that with native decorations on this one
window, against ADR-0005 and only here. The reasoning is sound as far as it
goes. The application draws its own chrome in the webview; if the webview is
what failed, it cannot draw a close button, and the window manager's is the only
one left.

Three things have happened since.

**The prompt is seen more often.** ADR-0027 lets a jump host ask for its own
credential, so a single click can produce two prompts for two machines. A window
that looks like it belongs to another application is met twice as often as it
was.

**It is now the same shape as the host key screens.** #188 moved it onto
`SessionSurface`, the shape ADR-0015 introduced to stop a session speaking in
five. The prompt renders that shape under a title bar drawn by the desktop in
the desktop's colours, which is the one surface in the product where the seam
is visible.

**The title bar costs the content.** `inner_size` is the inner size where the
window manager draws the frame around the window. On a desktop that draws the
title bar inside the surface, the same number is the outer size and the document
gets what is left: measured at 47 points of 420 on the maintainer's machine. The
window is sized in Rust from what it is about to render, and it cannot find out
what the decoration will take, so the figures carry an allowance that is a
guess. The first guess was short, and the visible result was a keep control
showing one of its three answers and looking complete. That is rule 6 of
ADR-0020, in the window where a mistake costs most.

The constraint that has not changed: whatever closes the prompt when its own
script has failed cannot be part of that script.

## Options considered

### Option A: keep the decorations

Do nothing. The guarantee holds, and it holds without any code: the window
manager provides the close button whether or not anything of ours is running.

It also keeps the seam, keeps the 47 points, and keeps the sizing a guess. Every
future change to what the prompt says is another round of choosing a number
against an allowance nobody can measure from where the number is chosen.

### Option B: a deadline in the core

Give the request a timeout. A prompt nobody answers is dismissed after some
number of minutes, and the connection fails cleanly rather than hanging.

This is what #188 proposed, and it does bound the failure. It does not answer
it: the bound has to be long enough for somebody to fetch a hardware key from
another room, so the user of a prompt that failed to render waits minutes
looking at a window they cannot close, and then the connection dies on its own
without them having chosen anything. It is a better hang, not a way out.

### Option C: close it from the main window

The main window already shows a Cancel while the attempt is running. Make that
Cancel close the prompt and answer the request, and the way out is a control in
a **different document with a different script**, which is exactly the property
the title bar was bought for.

The cost is that it is our code rather than the platform's, so it is a thing
that can be broken, and nothing outside a person driving it will notice. It also
does not cover a failure of the main window itself.

## Decision

Option C, accepted on 2026-08-26, with Option A's guarantee replaced rather than
dropped.

`abandon` in `use-connect` calls `dismissCredential(null)` when the attempt is
at the authenticating stage. No request id is needed: the core wires the prompt
window's destruction to a dismissal, so closing the window is what answers the
request. The prompt window is then built with `decorations(false)` and looks
like the rest of the application.

Option C beats A because A's guarantee was already incomplete in a way nobody
had noticed: cancelling from the main window left the prompt standing, on top of
everything, asking for a connection that no longer existed, with the core still
waiting inside it. The control a person reaches for first was on screen and did
not work, which is worse than not being there. C fixes that first and takes the
title bar as the change of hands, rather than removing a guarantee to buy a
look.

It beats B because a deadline never puts a control in front of the person. Both
could be had, and B is still worth having later for a prompt nobody is sitting
in front of; it is not what this decision needs.

**The tradeoff accepted is real.** The way out is now ours, and a way out that
is ours can be broken by a refactor in a file that has nothing to do with
credentials. It is covered by a row in `docs/testing.md` and by nothing a
machine runs, because what it asserts is that a window went away.

## Consequences

**Good**: the prompt looks like the product on the surface where that matters
most, and #188's actual complaint is answered rather than mitigated. The 47
points come back, so the window is sized against what it renders instead of
against a guess about somebody's window manager. Cancelling now cancels: the
orphaned prompt of #193 cannot happen, and neither can typing a password into a
window for an attempt already abandoned.

**Bad**: an undecorated window cannot be dragged. The prompt is centred over the
main window and lives for one answer, so this is small, but it is a thing a
person can want and cannot do, and giving it back means
`core:window:allow-start-dragging` in the credential capability, which is
deliberately empty (ADR-0013). Not worth it for a window that exists for one
answer.

**Bad**: the guarantee is now code. A window manager's close button cannot
regress; ours can, in a callback three files away from anything named
credential. The row in `docs/testing.md` is the whole of what defends it.

**Bad**: it does not cover a main window whose own script failed. Then neither
Cancel exists, and the way out is quitting the application, which does destroy
the prompt. ADR-0008's failure is bounded rather than eliminated, and this ADR
should not be read as saying otherwise.

**Follow-up**: the deadline of Option B is still the right answer for a prompt
nobody is in front of, and is worth revisiting when unattended reconnection
exists. If the drag turns out to matter, it is a capability change and therefore
its own proposal. #193 is closed by the first half of this; #188 by the second.
