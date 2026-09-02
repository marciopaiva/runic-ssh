# ADR-0052: Make Home a host book, not a dashboard

* **Status**: Accepted
* **Date**: 2026-09-02

## Context

ADR-0029 gave Home a shape of its own once it split from Sessions: a rail
switch between workspaces, `HomeNav` switching between Home's own
sections (Dashboard, Hosts), a Dashboard of cards (Hosts, Appearance, the
internal vault when offered), and Hosts as a list beside one form. Issue
#222, opened the same week, named a problem with that shape directly:
`HostsSection` did not carry the dashboard's own visual language, and
nothing said on purpose where the boundary sat between the portal's
generous, centred, card-based language and Sessions'/SFTP's dense,
chrome-minimal one (ADR-0020's seven rules). #222 closed itself the
shallow way: `HostsSection` was redrawn to match the dashboard's cards
(#237), rather than asking whether the cards were the right shape to
match at all.

They were not, on the maintainer's own direct read once Sessions and SFTP
had each had a real design pass and Home never had: *"a parte de ssh e
sftp está perfeito"* and Home, unreviewed since ADR-0029, was not. A grid
of bordered, padded, centred tiles is the layout every generic settings
screen already looks like; sitting next to Sessions' and SFTP's own
considered density, it reads as a different, less finished product bolted
onto the same window, which is the gap #222 named and #237 papered over
rather than closed.

The maintainer's own reference point, offered directly, was Termius' own
host-management screen: a dense, searchable book, not a landing page with
a Hosts tile among others.

## Options considered

### Option A: Tighten the existing card language

Keep the Dashboard-plus-card-grid shape and the list-beside-card-wrapped-
form shape #237 shipped, redrawn with ADR-0020's density rules: thinner
borders, tighter padding, no big centred title.

**Cost**: cheapest. **Forecloses**: nothing technically, but a tidier
grid of cards is still a grid of cards. It does not close the gap the
maintainer named, that Home reads as a different product from Sessions
and SFTP; it makes that product a little neater.

### Option B: Converge on Sessions' and SFTP's own dense language

Home stops being a landing page with a Hosts card among others and
becomes the host book directly, at the same density `SessionsSidebar`
and SFTP's own panes already prove out: flush panels, thin borders, a
filter box, no rounded tiles.

**Cost**: real rework across `HomeDashboard.tsx`, `HomeNav.tsx` and
`HostsSection.tsx`, not a redraw of one component. **Forecloses**:
nothing; this is the shape Option A is a smaller, incomplete version of.

### Option C: A distinct editorial "book" identity

An index-and-page layout with its own typographic language, closer to a
reference book than to either of the app's two existing visual registers.

**Cost**: the boldest option to build. **Forecloses**: the very thing the
maintainer asked for. Sessions and SFTP already read as one considered
product; a third, different-again visual language for Home would trade
one mismatch (Home vs. the rest of the app) for the same problem drawn a
different way. Named to be set aside, not as a real contender.

## Decision

Option B, iterated live against three artboards
(`design/canvas/HomeHosts.dc.html`, revised in place, and
`design/canvas/HomeBookProposal.dc.html`, still exploratory) rather than
settled in one pass. Six concrete pieces:

**No more `HomeNav` Dashboard/Hosts breadcrumb.** There is one screen now,
so nothing to switch between. This revises the specific clause of
ADR-0029 that gave Home a Dashboard section and a Hosts section as two
places to be; ADR-0029's larger decision, that Home is where the host
editor and settings live instead of inside Sessions, is untouched.

**The list-beside-one-form shape stays, but as the wizard's own dense
shell.** `hosts_shell()`/`hosts_header()`, the flush, thin-bordered
template `HostsHost.dc.html`/`HostsAccess.dc.html` already draw for the
creation wizard, replaces the card-wrapped list and card-wrapped form
#237 gave `HostsSection.tsx`. The host list keeps the `HostKindIcon` per
row already shipped this same cycle (ADR-0031, `HostsSection.tsx`), and
gains a filter box, the exact template `SessionsSidebar.tsx`'s own
`sessions_header()` already draws, since a book that cannot be searched
is not yet a book.

**Theme and language move into the toolbar, inline, not behind a menu.**
A first cut put them behind a gear icon in a small popover; reverted
directly once compared against `split_control()`/`select_all_button()`,
which already sit undisguised in SFTP's own toolbar (ADR-0046). The same
convention applies here: a small, fixed set of choices belongs visible in
the bar, not behind a click invented to hide it. This revises the specific
clause of ADR-0046 that kept Home out of the shared toolbar entirely
("Home keeps `HomeNav`... ADR-0029 already gave it that shape on
purpose"); ADR-0046's own decision that Sessions and SFTP each supply
their own trailing content to one shared bar shape is what this extends
to a third workspace, not what it revises.

**Theme and language stay Home-only, confirmed directly against the
alternative of also placing them in Sessions' and SFTP's own toolbars.**
They are a "set once and forget" choice, unlike the per-rectangle layout
questions `ShapeControl`/the split control answer; duplicating them into
the two surfaces the maintainer just confirmed are already right would
add permanent chrome to both for an action taken rarely. The vault status
card is deliberately left undrawn in the new toolbar or anywhere else in
this ADR: where it belongs is a real, separate question, not assumed here
by omission.

**Access becomes its own column, not a stacked section and not a wizard
step.** The detail panel splits into General and Topology, stacked in a
left column, and Access, the Password/Private-key picker
`HostsAccess.dc.html` already draws (with the stored-credential note
replacing the picker once one exists), in a column beside them rather
than behind a "Next" click. The panel is wide enough for this now, unlike
the wizard's own 440px-capped single column.

**This retires the two-step Host/Access wizard breadcrumb.** Confirmed
directly, and named as the largest single cost of this decision:
ADR-0030 gave host creation its two steps, and ADR-0032/ADR-0034 shaped
what Access does within the second one. A column beside General/Topology
answers the same questions those three ADRs answered, but not in the
shape they specified, and implementing this for real reopens those three
documents rather than only restyling `HostsSection.tsx`. Two questions
that reopening owes an answer, named here rather than assumed: where the
missing-credential notice (ADR-0039/ADR-0040's "this opened because
Sessions needs to authenticate" banner) renders once there is no second
step for it to open on, and whether a create-time draft (no `id` yet)
needs anything about this layout to differ from editing a saved host.
Access continues to show only the coarse credential-saved-or-not signal
already available (`credential_id.is_some()` on the Rust side); a real
password-or-key distinction is not invented here, since the app does not
store one today (see the credential-field isolation question already
open in #290, a related but separate decision).

## Consequences

**Good**: Home stops reading as a different, less-considered product
bolted onto Sessions and SFTP. The host list is searchable for the first
time. Access is reachable in the same glance as everything else about a
host, not gated behind a click that existed only because the wizard's own
column was too narrow to hold both. Almost everything reused is a
template the app had already closed somewhere else (`hosts_shell`,
`HostKindIcon`, `sessions_header`'s filter, `HostsAccess`'s picker,
`toolbar_row`), not a new component invented for Home alone.

**Bad**: retiring the two-step wizard is a real loss of guidance for
someone creating their very first host, not only a restyle; a wizard
sequences "where, then how you get in," and one dense screen with both
visible at once assumes a person who already knows both answers, which
this app's own audience (people who already know what a jump host is)
mostly is, but not universally. The missing-credential redirect and the
create-versus-edit question are both named without being answered, which
means this ADR authorizes the direction, not a finished implementation.
The vault status card has nowhere to go yet.

**Follow-up**: implementation is Phase 4, not yet done, and is split
across separate issues so the layout convergence (safe, additive) does
not wait on the wizard retirement (the riskier, credential-adjacent
piece). A second ADR is owed before the wizard retirement itself is
implemented: it has to actually answer the missing-credential-notice and
create-versus-edit questions this one only names, and record whichever
resolution ADR-0030/ADR-0032/ADR-0034 need as a result. The vault status
card's new home, if any, is its own follow-up once the rest of this
lands and it is clear whether its absence is actually missed.
