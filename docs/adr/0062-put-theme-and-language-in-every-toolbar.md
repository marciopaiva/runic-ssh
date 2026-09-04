# ADR-0062: Put theme and language in every toolbar

* **Status**: Accepted
* **Date**: 2026-09-04

Amends ADR-0052.

## Context

ADR-0052 put `ThemeLanguageControls` in Home's own toolbar and confirmed,
directly, not placing it in Sessions' or SFTP's own toolbars too: *"They
are a 'set once and forget' choice... duplicating them into the two
surfaces the maintainer just confirmed are already right would add
permanent chrome to both for an action taken rarely."* That reasoning
traded a rare action's own convenience for less chrome on the two
workspaces where most time is actually spent.

Reported live: the maintainer wants the reverse trade. Reaching either
control today means switching to Home first, doing nothing else there,
and switching back, for a choice that lives in exactly the two workspaces
ADR-0052 declined to touch.

## Decision

`ThemeLanguageControls` renders in all three workspace toolbars, not
Home's alone. Sessions and SFTP each keep their own existing trailing
controls (`BroadcastButton`/`ShapeControl`; `SftpSelectAllButton`/
`SftpSplitControl`) first, then the same hairline divider
`ThemeLanguageControls` already draws between its own two folds, then the
controls themselves; Home's toolbar is unchanged, since it never had a
workspace-specific control to divide from in the first place.

No new component: `ThemeLanguageControls` and `Toolbar`'s existing
`trailing` slot already do everything this needs. `Toolbar`'s own doc
comment naming Home as this control's home is corrected in place.

## Consequences

**Good**: reaching theme or language no longer requires leaving whichever
workspace the maintainer is actually in. Nothing about ADR-0059's fold
behavior changes; three more mount points for the same two components,
not a third design for either.

**Bad**: the "permanent chrome on the two busiest workspaces" cost
ADR-0052 named for this exact placement is real and is exactly what is
now accepted, on the maintainer's own direct request superseding that
tradeoff.

**Follow-up**: none. This is a placement change with no new mechanism to
verify beyond what ADR-0059 already covers.
