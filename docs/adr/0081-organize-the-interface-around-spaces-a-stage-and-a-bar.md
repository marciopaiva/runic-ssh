# ADR-0081: Organize the interface around Spaces, a Stage and a Bar

* **Status**: Accepted on 2026-11-23. It follows ADR-0080. Slices 1, 2 and 4 of
  `docs/plans/spaces.md` supersede nothing. Slice 3, the Stage, gets its own
  ADR before any code, and that ADR is the one that supersedes parts of
  ADR-0020, 0029, 0044, 0071, 0072 and 0073
* **Date**: 2026-11-23

## Context

The interface is organized by protocol and by container: a workspace for SSH,
one for SFTP, a Home, and inside each a strip of tabs, groups and splits, with
a facet row inside every session. After removing the map (ADR-0080) it is
three workspaces and one shell. Reading the code and driving the application
on 2026-11-23 found four problems that are about the model and not about
polish:

* **Three levels of switching** before a terminal: the workspace, the group and
  tab, the facet. A person working on one host moves between SSH and SFTP to see
  a terminal and its files, because they are different workspaces.
* **No sense of where you are.** Nothing tells a lab host from a production
  host, and nothing asks before one command is typed into several of them.
* **No memory.** The application knows when a connection dropped and came
  back, which macro ran, what was sent, and keeps none of it. "What happened
  to this server?" has no answer inside the tool.
* **A first screen that does not work.** Home is a logo. The list of hosts is
  behind a sidebar that starts closed.

The interface review (`docs/plans/ui-review.md`) compared a structure-keeping
cleanup, a vertical stem for sessions and a dockable workbench. The maintainer
asked for something new, not bound to the existing structure, and chose the
direction below after reading an illustration of it.

## Options considered

### Option A: Tidy the existing structure

Keep the workspaces and tabs. Make Home the host book, unify the empty states,
regroup the toolbar, fix the status bar. Low risk and useful on its own. It
leaves the three levels of switching, the missing environment awareness and the
missing memory exactly where they are.

### Option B: Spaces, a Stage and a Bar, with a logbook per host

* A **Space** is an environment (Production, Staging, Lab, a client). It holds
  hosts, open sessions, macros and a layout. Switching Space swaps all of it,
  and sessions stay alive. A Space has a weight: a production Space is marked
  with a band, a glyph and a word, and asks before a command is sent to several
  hosts.
* The **Stage** is a tiled area. A host's terminal, files and monitor sit side
  by side. Sessions that are alive and not on screen are parked on a shelf.
* The **Bar** is one command field. `@` picks hosts, `>` runs a saved macro, `/`
  opens files. The scope is shown as chips, so what the keyboard reaches is on
  screen.
* The **Hall** is a Space's first screen: one plate per host with its sigil, its
  state, its latency and, once reviewed, its last line.
* The **Logbook** keeps, per host and only on this machine, the events that
  matter: connections, drops and reconnections, macros and their exit status,
  transfers, host key changes. Never keystrokes, output or secrets.

Cost: the largest of the three. The Stage replaces the tab strip, the groups
and the SSH and SFTP split, and needs a tiling engine. Two new stores, one
field on the host. Forecloses the tab strip as the primary way to hold sessions.

### Option C: A dockable workbench

Editor groups, side panels and bottom panels the user arranges and the
application remembers, in the style of an editor. The highest ceiling and the
highest cost, with a layout engine, persistence, and the same terminal-mounting
constraint as B without B's environment awareness or memory. Not chosen.

## Decision

Option B, delivered in four slices that can each ship and each end with a stop
for the maintainer to use it (`docs/plans/spaces.md`):

1. The Bar, as the command palette grown into a scope and a verb. No layout
   change.
2. Spaces and the Hall, with the production weight and the guard on casting.
3. The Stage. This is the slice that changes the shell, and it has its own ADR
   and its own decision to go ahead after slices 1 and 2 have been used.
4. The Logbook. It does not depend on the Stage and can come before it.

It beats A because A leaves the model problems in place. It beats C because C
adds a layout engine without answering where you are or what happened.

Rules that hold across the slices:

* **Saved macros only.** `>` chooses a saved macro. The Bar never sends a
  string it composed to several hosts, which is the rule ADR-0078 set for the
  fleet run, and it applies to casting too.
* **The guard is a guard, not a boundary.** The production confirmation (hold to
  confirm, about 800ms) prevents a slip. It is not a security control and the
  documentation says so.
* **Credentials.** Asking for a credential is a step that takes the whole
  Stage, with no terminal tile mounted, so nothing renders a host's output while
  the field is on screen (ADR-0032's premise, and the test that guards it,
  stay in force). Host key screens do not change.
* **No remote output outside a terminal without a review.** The Hall's "last
  line" is host output shown in a plate. It ships only after its own review of
  that premise (sanitised plain text, hidden while a credential field is open,
  with a guard test), and slice 2 ships without it until then.
* **Local and private.** The Logbook stays on this machine, has no telemetry,
  keeps no keystrokes, output or secrets, is bounded in size, and can be
  cleared per host.
* **No new runtime dependency.**

On-disk changes are additive. A host gains an optional `space`, and Spaces are
defined in a new `spaces.json` (name, weight, order). A missing field loads as
the default Space, so no migration is needed. The Logbook is a new directory of
bounded files. Existing `group` values can be offered as Spaces once, on the
maintainer's confirmation, and never silently.

## Consequences

**Good**: one answer to "where am I" and "what is on screen". Terminal, files
and monitor of a host in one view. A production host looks different and a
broadcast to several asks first. A first screen that shows which hosts are up.
A record of what happened to a server without leaving the tool. A command
field that serves hosts, actions and macros alike.

**Bad**: a change of model that touches the shell and the persistence, with the
biggest piece (the Stage) in the middle. A tiling engine to write and keep
accessible. The prefix grammar of the Bar has to be learned, and its tokens are
not translated. Two new files to specify, bound and test. A guard that people
will learn to hold through. The Hall without its last line is a weaker version
of the idea until its review is done. Visions and the map are gone (ADR-0080),
and Spaces are a different tool, not a replacement for them.

**Follow-up**:

1. Write the ADR for the Stage before slice 3, naming the ADRs it supersedes,
   and decide the tiling rules, the shelf and the credential step.
2. Add the Logbook and the guard to `docs/security-model.md` with slice 4 and
   slice 2.
3. Review the Hall's last line against ADR-0032 before it is built.
4. Revisit if the Bar's prefixes prove hard to learn, or if the Stage cannot
   carry what the group strip does today (splits and broadcast per group). The
   fallback is slices 1, 2 and 4 on the existing shell.
