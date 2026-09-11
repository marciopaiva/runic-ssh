# ADR-0069: Choose the shell from the toolbar

* **Status**: Accepted
* **Date**: 2026-09-11

## Context

ADR-0066 put the map behind a preview setting: a fresh install shows the
classic navigation, four rail slots and no map, and the command palette's
"Show the map (preview)" adds a fifth slot, `Map`, beside Home, Sessions,
SFTP and Monitor. That made the map one more workspace on the same rail as
the three it is meant to succeed, which was the cheapest way to ship it
behind a switch and was accepted as such.

ADR-0046 gave every workspace one shared toolbar between the Titlebar and
its body, and ADR-0062 put the two set-once choices, theme and language,
at that toolbar's trailing edge in every workspace. On 2026-09-11, reviewing
the v0.8.0 artboards, the maintainer found the map drawing a second toolbar
of its own under the shared one and asked for one bar, the map's crumb and
controls inside the shared row with theme and language; then asked whether
that bar could carry a selector between the classic navigation and the map.

Two things make the question more than a shortcut to the fifth slot:

* ADR-0064 planned the rail after the cut as Home and Map. ADR-0066
  deferred the cut and left three directions open, cut classic, keep both,
  cut the map, to be decided on the signal the preview gathers. A fifth
  slot gathers a weak signal: someone who opens the map tab is still in the
  classic shell and drifts back to Sessions without deciding anything.
* A shell is a set-once choice of the same kind as theme and language: it
  changes what the whole window is, not what one workspace shows.

## Options considered

### Option A: a selector in the shared toolbar, the map as a shell

A segmented control, `Classic | Map`, at the trailing edge of the shared
toolbar in every workspace, in the group that holds theme and language,
separated from them by the same hairline. Choosing Map swaps the shell: the
rail becomes Home and Map, the rail ADR-0064 planned, and the map is the
workspace in front. Choosing Classic brings the four-slot rail back and the
workspace that was in front before, or Home. The choice is written to
`settings.json` as `shell`, `classic` by default, so a launch opens in the
shell last chosen. The fifth slot goes; the selector is what replaces it.

The selector appears only with `preview_features` on, and the palette's
command stays the way to turn the preview on and off. Turning it off with
the map shell in front returns to classic, as hiding the slot did. Home is
the same in both shells: the host book and the settings.

Costs: `App.tsx` reads a shell as well as a workspace, and `ActivityRail`
draws two sets of slots. Sessions, SFTP and Monitor are unreachable from
the rail in the map shell, which is the point, and a person who wants one
of them switches back with one click.

### Option B: the selector beside the fifth slot

Keep the slot and add the selector as a second way to the same workspace.

Costs: two controls for one thing, and the selector says "shell" while the
slot says "tab"; the signal ADR-0066 wants stays as weak as it is.

### Option C: the selector always visible, Map marked as a preview

No preview setting: the selector is in every toolbar from the first launch,
its Map half labelled preview.

Costs: this is the default rail entry ADR-0066 rejected, by another name:
an unfinished map in front of a person who came for a finished client.
Revisiting the default is a different decision from choosing where the
switch lives, and this record does not make it.

## Decision

Option A.

It beats Option B because one thing gets one control, and the control says
what the thing is: a shell, not a tab. It beats Option C because ADR-0066's
default stands, and the selector only sharpens the signal it is gathering;
it does not widen who sees the map.

The tradeoff accepted is that the map shell hides three workspaces behind a
switch rather than beside a tab, which is one click further for a person
who lives in the map and needs the SFTP workspace's four-destination grid
once. That is the cut ADR-0064 planned, made reversible, and it is what
"keep both" looks like as a product rather than as a maintenance state.

Rules restated so the selector cannot loosen them:

* ADR-0066 holds: a fresh install shows the classic shell, no map, no
  selector. The preview setting is the gate; the selector is its surface.
* The shell is one setting with two values, `classic` and `map`, and a
  file without it reads as classic. No migration.
* Home is one workspace in both shells. Nothing in `ssh/`, `sftp/`, the
  registry or the credential model knows which shell is in front.
* Terminals mounted in one shell stay mounted across a switch (ADR-0014):
  a session opened in Sessions is still open when the map shell is chosen,
  and the map shows it in its component when one exists.

## Consequences

**Good**: the toolbar carries the three shell-level choices in one group,
theme, language and navigation, and the map stops being a fifth tab on a
rail it was meant to replace. The signal ADR-0066 is gathering becomes a
choice people make and keep, which is the evidence the deferred decision
needs. "Keep both" is already built if that is where the evidence points,
and cutting either half is a deletion, not a rewrite.

**Bad**: two shells to keep working on one backend, for as long as both
exist, and every shell-level flow (the credential redirect, the
missing-credential banner, the palette's session commands) has to make
sense in both. A person mid-broadcast who switches shells changes what the
status bar's warning edge reads from; the switch is locked while a
broadcast is armed, the way the rail already locks.

**Follow-up**: this supersedes the fifth rail slot of ADR-0066 and amends
ADR-0064's rollout: the two-slot rail arrives with the selector rather than
with the cut. `PreviewSetting.dc.html` is redrawn to show the selector
appearing, not the slot. The classic-versus-map decision stays open and
stays ADR-0066's.
