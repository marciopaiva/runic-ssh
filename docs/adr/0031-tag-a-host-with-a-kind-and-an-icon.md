# ADR-0031: Tag a host with a kind and an icon

* **Status**: Proposed
* **Date**: 2026-08-29

## Context

A saved host today carries nothing about what it *is*, only how to reach it:
host, port, user, an optional group and an optional jump host
(`config/sessions.rs`). The sidebar and the wizard ADR-0030 is building both
draw every host the same way regardless of whether it is a jump server, a
database box, a web server or something else, and a list of a dozen hosts
under one group reads as a dozen identical rows with different names.

The Sessions sidebar already carries one small glyph per row —
`SessionMarker`, described in `features/sessions/state.ts` — but that glyph is
about *connection state* (connected, connecting, saved, unreachable), a
different axis entirely from what a host *is*. The file's own opening comment
is explicit that state is never carried by shape alone precisely because a
second signal is being asked to share the row with the first; a kind icon is
a third thing on that row, not a stand-in for either existing one.

The request was raised mid-conversation, while ADR-0030's wizard was being
rebuilt: tag a host as a jump server, a database, a web host or something
else, with an icon, "para ajudar na hora de mostrar nos sessions" — purely
categorisation and recognition, confirmed explicitly not to change any
authentication behaviour. That rules out the coupling that would have made
this a bigger decision (a kind implying a default credential method, say);
what is left is a field, a small closed set of values, and where it is drawn.

## Options considered

### Option A: a closed enum with a curated icon per value

`HostKind` with four variants — `JumpServer`, `Database`, `Web`, `Other` —
serialized the same way `Keep` and `SuggestedMethod` already are: a bare
lowercase-first string, one `#[default]` variant so an old `sessions.json`
with no field for this loads as `Other` rather than refusing to load at all,
matching the shape `credentialId` and `proxyJump` already established for a
field that did not always exist. Four inline SVGs, one per kind, in the same
hand-drawn style every other icon in the tree already is — no icon library,
no new dependency.

Cheap to add, cheap to reason about, and it never needs to draw a shape
nobody designed: the whole set is these four glyphs, ever. Its cost is the
one closed sets always carry: a fifth kind is a code change, not something a
user can add from the interface.

### Option B: free text with a user-chosen icon

A short label the user types, paired with an icon chosen from a fixed palette
(or the same four as Option A, picked independently of the label). Reaches
categories Option A cannot name — "load balancer", "CI runner" — without
waiting on a release.

The label becomes one more piece of text to validate, translate nothing about
(a user's own word has no locale to translate it into), and keep out of a
list Sessions groups and sorts by. Two hosts a user thinks of as the same
kind can end up labelled differently by a typo, which is the exact failure
class #221 already named for group names — a form that invites a duplicate
that means the same thing to a human and different things to the file. An
icon chosen independently of the label can also disagree with it, which a
closed set makes structurally impossible.

## Decision

Option A.

The request was for four named kinds with icons, not an open taxonomy, and
Option B's freedom answers a want nobody expressed while reintroducing a
defect this project has already paid once (#221) in a different field. A
closed set can still grow — adding a fifth `HostKind` variant is a small,
ordinary change, not an architectural one, the same way `Trust` and
`ConnectionKind` have grown variants before without needing a decision this
size again.

`Session.kind` and `SessionDraft.kind` are both `HostKind`, not
`Option<HostKind>`: every host has one, `Other` is what a host has until
somebody says otherwise, and `#[serde(default)]` on both is what lets a
`sessions.json` written before this field existed keep loading exactly as it
did before — no migration script, the same guarantee `proxyJump` already
rests on and the same test (`a_file_written_before_jump_hosts_existed_still_
loads`) extended to cover this field too.

Drawn in two places for v1: the icon picker on `HostFields` — shared by
ADR-0030's wizard step 1 and the plain edit form, so an existing host can be
tagged after the fact and not only at creation — and a small icon in the
Sessions sidebar row, beside `SessionMarker` rather than replacing it. Not
drawn on tab labels or the group strip; nothing today asks for it there; it
is a place this decision could extend to without another ADR of this size, if
it turns out to be wanted.

## Consequences

**Good**: a saved host list stops reading as a column of identical rows.
Adding this to `HostFields` rather than to the wizard alone means an existing
host is not permanently untagged just because it predates this feature.
Nothing about authentication, storage of a credential, or the connect
sequence changes — this is the one field in `Session` with no security
content at all, which is also why it needed no ADR-0030-sized proposal on the
credential side.

**Bad**: four icons is a promise to keep drawing consistently as the product
grows. `Other` is doing double duty as both "chosen deliberately" and
"nobody has said yet", and the sidebar cannot currently tell those apart —
somebody who deliberately calls a host "other" looks identical to somebody
who never opened the picker.

**Bad**: this is a fourth thing on a sidebar row (the connection marker, the
name, the host address, now a kind icon), and row real estate is not
infinite. Untested at four; revisit if a fifth signal is ever proposed for
that row.

**Follow-up**: decide whether `Other` should render at all in the sidebar, or
only the three named kinds get an icon and an untagged host stays exactly as
it draws today. Revisit growing the enum if a genuinely common host type
(load balancer, CI runner) turns out to be asked for often enough that
`Other` is doing real work hiding it.
