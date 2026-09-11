# ADR-0066: Ship the map as an opt-in preview and keep classic navigation the default

* **Status**: Accepted
* **Date**: 2026-09-10

## Context

The map is not one release. It is an arc: v0.7.0 draws the lines (ADR-0065),
v0.8.0 adds visions, and v0.9.0 is where ADR-0064 planned to remove the old
workspaces and leave the map. Between here and there the map is unfinished by
design, with the empty `visions` and `layers` arrays already sitting in
`workspace.json` waiting to be filled.

Two facts about how Runic ships bear on this. Every tag lands as a
pre-release: `package.yml` passes `--prerelease` without a condition, so a
`v*` tag is never presented as a finished product. And the map already
shipped. It has been the fifth entry on the rail since v0.6.0 (ADR-0064),
visible to everyone who installed that release, gated behind nothing.

The worry that prompts this decision is one of perception. A prominent
feature that is half-built reads as a broken product rather than as work in
progress, and a person who meets an unfinished map where they expected a
finished client may leave with the sense that the whole thing is unreliable.
The instinct that follows is to stop tagging until the map is complete.

That instinct has a cost the project cannot pay. Holding tags strands every
improvement that is not the map, the close button and the terminal menu and
the fixes behind #363 and #364, behind a release that will not come for two
more minors. Worse, it withholds the one thing the map most needs, which is
evidence. Whether the map should replace classic navigation, sit beside it,
or be cut is an open question, and it is answered by watching what people
reach for, which cannot happen while nobody can try it. Holding also breaks
the cadence section 10 describes, where a minor opens named ground release by
release.

And holding does not even buy what it is meant to. The map already shipped in
v0.6.0, so withholding v0.7.0 protects nobody from an unfinished map; it only
keeps people on an older and less finished one, without the fixes.

So the lever is not whether to tag. It is how much the unfinished map imposes
itself on someone who did not ask for it.

## Options considered

### Option A: hold every tag until the map is complete

No `v*` between now and the map's completion around v0.9.0. The next release a
person sees is the finished map.

Cost: two minors with no release; every non-map fix stranded; no signal on the
classic-versus-map question until the most expensive moment to learn it was
wrong; section 10's cadence broken. It does not even remove the v0.6.0 map
already in the field. It forecloses the feedback that would settle the
direction ADR-0064 set.

### Option B: keep shipping, the map stays a default rail entry

The status quo since v0.6.0. Keep tagging, and the map is the fifth slot
everyone sees.

Cost: exactly the perception risk that prompted this. Every install meets the
unfinished map in the default path, and the pre-release flag alone has not
been enough to frame it as a preview rather than as a broken core feature.

### Option C: keep shipping, the map behind a preview setting, classic the default

Keep tagging pre-releases. A fresh install shows classic navigation, Home and
Sessions and SFTP and Monitor, and no map. A setting, off by default, reveals
the map on the rail. The changelog carries the map under `Known limitations`
each release.

Cost: the map's audience is only those who opt in, so the signal comes from a
self-selected and smaller group rather than everyone; a setting is a new
surface to carry and to test in both states; and the default has to flip
later, which is a second decision this one does not make.

## Decision

Option C. Keep shipping pre-release tags, put the map behind a preview
setting, and keep classic navigation the default a fresh install lands on.

This beats Option A because the project needs to keep releasing. The fixes
reach people, and the classic-versus-map question gets the evidence it can
only get from use. It beats Option B because the pre-release flag has not been
a strong enough frame on its own, and a default rail entry puts the unfinished
map in front of people who came for a finished client. The setting is the
frame Option B lacks: someone who turns the map on has opted into work in
progress, the way a pre-release tag is opted into, and someone who does not is
never handed a half-built feature as though it were done.

The tradeoff accepted is that the map's signal comes from a smaller and
self-selected group, and that this defers rather than answers the direction
ADR-0064 set. The deferral is the point. This decision does not choose between
cutting classic, keeping both, and cutting the map; it keeps all three open
and buys the evidence to choose among them, while protecting the default
experience in the meantime. The precedent is ADR-0007's own: Spanish shipped
present in the tree but held out of the language selector until a native
speaker had reviewed it, offered to those who went looking and withheld from
the default. The map is the same shape of decision at the scale of a
workspace.

Classic is the default because it is the finished half. It is what a first
install should be judged by, and the safe place to stand while the map is
built in the open.

## Consequences

**Good**: releases keep flowing, so non-map work is not held hostage to the
map, and section 10's cadence holds. The map gets real users and real feedback
while it is still cheap to change its direction. The default install reads as a
finished product, and the pre-release flag and the `Known limitations` section
stop carrying a load they were failing to carry alone. The classic-versus-map
decision moves to a point where it can be made on evidence rather than on a
guess.

**Bad**: two navigation shells are maintained at once for longer than ADR-0064
planned, over the shared backend ADR-0065 already established. A setting is one
more thing to carry and to test in both of its states. The map's feedback
comes from a self-selected minority, which is a biased sample, since the people
who turn on a preview are not the median user. And the default flip is a future
decision this one does not make, so the arc gains a step rather than losing
one.

**Follow-up**: the setting needs a home and a name, either a navigation mode or
a general preview-features toggle the map is the first of, decided when it is
built; it lands in `settings.json` with a default of classic. The rail's two
states, with the map and without it, and the setting itself are drawn in
`design/canvas` before implementation. This amends the rollout ADR-0064
described, in which the map was the temporary entry and the old workspaces were
to be cut at v0.9.0; the map is now the opt-in one and the cut is deferred with
its direction open. ADR-0064's file-layout decision stands unchanged. Revisit
when there is enough signal to make the default flip: if the opt-in group
reaches for the map and stays, classic's default is what moves; if the map is
tried and abandoned, that is the evidence for cutting it instead. The condition
to watch is retention inside the map, not how many people switch it on once.
