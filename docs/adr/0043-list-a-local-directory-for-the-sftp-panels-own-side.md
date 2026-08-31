# ADR-0043: List a local directory for the SFTP panel's own side

* **Status**: Accepted
* **Date**: 2026-08-31

## Context

`Sftp.dc.html`, drawn before #127 had any code, shows a two-column browser:
a local directory on one side, the remote one ADR-0041/0042 already built on
the other. ADR-0042 gave the webview a native picker for naming one file or
folder at a time, chosen through a modal the user drives. Matching the
canvas's local column means something categorically different: browsing
freely, one directory at a time, without a picker in between.

That is a wider grant than ADR-0042 made, even though nothing about it adds
a line to `capabilities/default.json`. Custom commands registered through
`generate_handler!` are not gated by Tauri's capability ACL at all; the ACL
governs plugin commands, which is why `dialog:allow-open` and
`dialog:allow-save` are the only lines either ADR needed. A command this
application writes and registers itself answers to nothing but its own
argument validation. "No capability line changes" is true and is not the
same claim as "nothing changed": section 7.6's actual concern, a permanent
grant to code that renders hostile input, is decided by what a command
*does*, and `local_list_directory` does something ADR-0042's two commands
deliberately do not: answer any path the caller sends, not only one a person
just chose in a dialog.

## What this command is not defending against

`docs/security-model.md`'s adversaries are the remote host and the network;
the local filesystem is the user's own, already fully open to them through
every other application on the machine. A path this command is given did
not come from a hostile server, and the entries it returns are not rendered
as if a server had sent them.

## Options considered

### Option A: `local_list_directory`, unrestricted

Lists any path the caller sends, defaulting to the user's home directory
when none is given. Simple, matches what `std::fs::read_dir` already is, and
treats the local machine the way it actually is: the user's own, not a
boundary this application enforces.

**Cost**: if the webview were ever compromised through an unrelated bug, a
free-form `local_list_directory` call is one more thing it could do:
enumerate the local filesystem, and hand what it finds to a host the user is
already connected to through `sftp_upload`, which trusts that connection
completely. Small next to what a compromised webview can already reach
(every session's own credential-free handle, every open channel), but not
zero, and worth writing down rather than only accepting silently.

### Option B: Confine listing to the user's home directory and below

Refuses a path outside `$HOME`, the same shape `sftp::path::check_name`
refuses a remote name escaping the directory chosen for it.

**Cost**: a real difference from the canvas and from every other file
manager on the platform, which let a person browse anywhere they have
permission to. A local project a person keeps outside their home directory,
common enough on machines set up by someone else, becomes unreachable from
this panel for a boundary the OS itself does not draw. Forecloses nothing
technically, since it could be lifted in the same change that regrets it,
but the day-to-day cost is real and constant rather than the day-may-never-
come cost Option A accepts.

## Decision

Option A, chosen by the maintainer after the trade above was named plainly.
The local machine is not the adversary this project defends against, and a
boundary drawn around the user's own files, on their own computer, protects
against a scenario, a webview compromise independent of anything SFTP-
specific, that a directory listing command neither causes nor meaningfully
worsens once it exists.

## Consequences

**Good**: the local panel matches the canvas and matches how a person
already expects to browse files on their own machine. `local_list_directory`
is read-only, metadata-only: it does not open, does not read a byte of
content, and does not write anything, which keeps its own blast radius to
"knows what is there," not "can act on it."

**Bad**: a webview compromise from an unrelated bug has one more thing to
reach, as described above. Accepted rather than mitigated, because
mitigating it here (confining to `$HOME`) trades a constant, real cost for a
narrow, conditional one, and the condition it guards against is already a
worse problem than this command by itself.

**Follow-up**: if a future finding makes "the webview can be handed hostile
content that runs" a live rather than hypothetical concern for this
application, this ADR is the one to revisit first, since it is the one that
assumed that gap would stay closed.
