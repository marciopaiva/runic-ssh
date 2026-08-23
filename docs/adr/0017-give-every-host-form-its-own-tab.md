# ADR-0017: Give every host form its own tab

* **Status**: Accepted
* **Date**: 2026-08-23

## Context

ADR-0015 sorted every surface into two boxes:

> A surface belongs to a session or to the application. A session's surface
> renders in that session's panel; the application's renders as a tab.

A stored host is neither. It is not a session — there is no connection, and
often never was — and it is not a preference like the locale or the title bar.
With only two boxes it went into the one that was left, so creating a host meant
opening a tab labelled **Settings**, and the maintainer's reaction on meeting it
was that this made no sense: adding a host is a task, not a setting.

The arrangement carried the evidence on screen. The settings panel listed the
saved hosts in a column of its own, beside a sidebar that lists the saved hosts.
The same list, twice, in one window. That duplication is what made the screen
feel wrong before anyone could name why.

Underneath was a second problem, recorded and parked when the editor first moved
into the settings tab (#96): the editor was **one slot**, so "is there unsaved
work" was a question about *the form* rather than about a host. Editing `web-01`,
then clicking `db-01`, asked you to answer for `web-01` — a question about
something you were no longer looking at, and could no longer see.

Both problems have the same root. The editor had one place to be, and the place
belonged to something else.

## Options considered

### Option A: leave it in settings, drop the duplicate list

Keep the editor where it is and delete the host column, since the sidebar
already is that list. Clicking a row in the sidebar opens its form in the
settings tab.

Cheap, and it removes the most visible symptom. It does not touch the word
*Settings* sitting over a task that is not one, and it leaves the editor as one
slot, so the unsaved question stays attached to a form rather than to a host.

### Option B: one editor tab, outside settings

Give the editor its own tab, named for the host it is on. Settings keeps only
what is actually a setting.

Fixes the category error and the duplicate list. Still one slot, so #96's parked
limitation survives: two hosts cannot be open at once, and the unsaved question
still belongs to whichever host the slot happens to hold.

### Option C: a tab per host

Every host being edited gets its own tab, alongside the sessions and settings on
the same strip. The unsaved marker sits on the tab of the host it belongs to.

Fixes all three. It costs the most, and the cost is not in the markup: a form
per host cannot live in `useSessionEditor`, because a hook called once per open
tab breaks the rules of hooks the moment one opens or closes. The state has to
leave the hook.

## Decision

Option C. Every host form is a tab, named for its host, and the drafts live in a
pure module rather than in a hook.

> A surface belongs to a session, to a **stored host**, or to the application. A
> session's renders in that session's panel; a host's is a tab named for it; the
> application's is a tab. The only separate window is the credential prompt,
> because it carries a secret.

That is ADR-0015's rule with the missing third box added. Everything else it
decided stands — the flat panels, the credential window, the strip.

`useSessionEditor` is deleted. The drafts are a list of `OpenEditor` values in
`features/sessions/editors.ts`, and every operation on them is a pure function
the shell calls. This is the trade the rest of this feature already makes: what
decides anything is testable without a DOM, and the component only draws. Two of
the seventeen tests it gained could not previously be *written*, let alone fail —
"does not leak a keystroke from one form into another" and "marks only the form
that was typed into" have no meaning when there is one form.

The tab strip stops weaving its kinds by hand. Two could be special-cased in
`focus.ts`; three cannot, so the strip is built once as an ordered list and every
question — what is focused, what the arrow key reaches, what takes over when a
tab closes — is asked of that list.

Saving a host that did not exist closes the tab it was created on. The
alternative is a tab that goes on saying "New session" while holding one already
on disk, which is the tab lying about its contents, and what somebody wants next
is almost always to connect to it. Editing a host that already existed leaves the
tab open, because there the name on it stays true.

## Consequences

**Good**: the unsaved marker finally belongs to a host. Closing a tab asks about
the host on that tab. Two hosts can be edited at once, and a half-typed hostname
survives a glance at a session — and at the other half-typed hostname. The
duplicate list is gone, and so is the settings navigation column: navigation with
one destination is chrome pretending to be structure, and it comes back when
there is a second section to reach with it.

**Bad**: the tab strip can now fill with editors. Nothing bounds how many are
open, and a strip of eight host forms is a worse problem than the one this
solves. Nobody has hit it, and a limit invented before anyone has is a guess.

**Bad**: this is the fourth change to the navigation model in four days —
modal, settings tab, flat panels, and now this. Each was an improvement and the
churn is still real. What makes this one different is that it removes: a column,
a duplicated list, a hook, and a word that was wrong.

**Bad**: the state left a hook that encapsulated it and became a list the shell
holds and passes around. That is more wiring in `App.tsx`, which is already the
largest component in the tree.

**Follow-up**: `App.tsx` is doing enough now to be worth splitting, and the
editor handlers are the obvious seam. Revisit a cap on open editor tabs if
anyone ever opens enough to care.
