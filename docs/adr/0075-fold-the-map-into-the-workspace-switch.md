# ADR-0075: Fold the map into the workspace switch

* **Status**: Accepted
* **Date**: 2026-09-20

## Context

ADR-0069 gave the app two shells, `classic` and `map`, as one setting
persisted to `settings.json` (`shell`, default `classic`, no migration). Its
Decision named the shell a choice "of the same kind as theme and language: it
changes what the whole window is, not what one workspace shows," and it holds
today exactly as written: `App.tsx` reads `shell` and `workspace` as two
separate pieces of state, kept in sync by a one-way effect (`App.tsx:290-298`)
that reverts `workspace` out of `'map'`/`'home'` whenever `shell` is not
`'map'`; four independent `<Toolbar>` branches render depending on
`workspace`, one per shell's own chrome; `ActivityRail` mounts only when
`shell === 'map'`, with two slots, `home` and `map`, that do not exist for
classic at all; and `ShellSelector`, gated to render only on the map, is the
sole way back to classic.

ADR-0072 built the toolbar switch (`WorkspacePills`) that replaced classic's
own rail slots for `home`, `sessions` and `sftp`, and its Decision text left
`map` out on purpose: "What remains [of `ActivityRail`] is `map` (fixed
pending ADR-0073) and nothing else from the current five." ADR-0073 then
promoted `map` from a gated, sometimes-absent rail slot to a pill that always
renders in `WorkspacePills`, next to SSH and SFTP, indistinguishable from
them by sight. But `WorkspacePills`' `onChoose('map')` still resolves, in
`App.tsx`'s `openWorkspace`, to `chooseShell('map')`: a full shell switch,
with its own toolbar, its own two-slot rail, and `ShellSelector` as the only
way out. ADR-0073's own text names this seam directly, in its Consequences:
"ADR-0073 already pushes the UI toward 'map is just another pill' while the
plumbing (ADR-0069) still treats it as a separate shell."

The maintainer raised this seam directly after using the shipped feature:
choosing MAPA looks like picking a tab and behaves like leaving the room.
Asked to choose among leaving it as is, folding the map into the same
navigation frame as SSH and SFTP, or going all the way to retiring classic
navigation outright, the maintainer chose the middle option. This document
records that choice.

What is already true in the code, confirmed by reading it rather than
assumed, and load-bearing for the Decision below:

* `MapStage` does not render its own chrome. It reports what it needs
  through callback props (`onToolbarChange`, `onReceivingChange`,
  `onFocusedSessionChange`, `onMapReachChange`) that `App.tsx` already folds
  into the same state (`mapToolbar`, `mapReceivingCount`, `mapFocusedSession`,
  `mapReachRef`) the other three workspaces' toolbars and status-bar reads
  use. It has no assumption in its own source that it is the sole content of
  a shell; that assumption lives entirely in `App.tsx`'s conditional
  rendering and the shell/workspace sync effect.
* The broadcast/macro-target resolution the status bar and macro runner use
  (`App.tsx:793,888,907`) already branches on `workspace === 'map'`, not on
  `shell`. It does not need to change shape for `map` to become a peer
  workspace; it already treats it as one.
* `shell` is persisted the same way as `previewFeatures`/`theme`/`locale`,
  through `settings-context.tsx`, `src/ipc/settings.ts`'s `Shell` type and
  `setShell`, and a `set_shell` Tauri command in
  `src-tauri/src/commands/settings.rs`, backed by the same `SettingsStore`.
  `workspace` is not persisted at all; it is a plain `useState` that starts
  at `'sessions'` every launch.
* `CommandContext.workspace` (`App.tsx:1820`), read by the command palette's
  host-book commands, already narrows away `'home'` and `'map'` to
  `'sessions'`; those commands do not know the map exists.
* `tests/ipc-contract.test.ts` pins the `SettingsView` JSON shape including
  `shell`, the `Shell` type literal, and the `set_shell` command's existence.
  `tests/workspace-pills.test.ts` pins the MAPA pill as never selected and
  its click as calling `onChoose('map')`, both written against ADR-0073's
  shell-switch mechanism.

## Options considered

### Option A: Leave ADR-0069 as it stands

Keep the two shells. `WorkspacePills`' MAPA pill keeps calling
`chooseShell('map')`; the map keeps its own toolbar, its own two-slot rail,
and `ShellSelector` as the way back.

**Cost**: none beyond the one already being paid: a pill that looks like a
peer of SSH and SFTP but drives a different chrome underneath, which is the
seam the maintainer flagged after using the shipped feature, not a
hypothetical one. **Forecloses**: nothing; this is the status quo.

### Option B: Fold the map into the workspace switch

`workspace` gains `'map'` as a fourth ordinary value alongside `'sessions'`,
`'sftp'` and `'home'`, chosen through the same `WorkspacePills` row the other
two already use. The pill reflects selection like its siblings, so
`tests/workspace-pills.test.ts`'s "the map pill is never the selected tab"
assertion inverts. `openWorkspace` keeps the `previewFeatures` check it
already has, but now guards `setWorkspace('map')` directly instead of
`chooseShell('map')`; `mapPreviewPromptOpen` and `MapPreviewPrompt` keep
their job unchanged; only what accepting the prompt does underneath changes.

The four separate `<Toolbar>` branches fold into one shared shape with
per-workspace leading/trailing content, the pattern `MapStage`'s own
`onToolbarChange` reporting already anticipates: it exists, per its own doc
comment, so the shell could render map content "in the shared bar... instead
of a second one here." `ActivityRail` retires the same way it already
retired three of its five slots for classic under ADR-0072: `home` folds
into the same "+" host palette classic's `home` folded into, `map` becomes a
pill, and the component mounts nowhere once both its remaining callers are
gone, exactly as `HostsSection`, `SessionsSidebar` and `SessionMenu` were
deleted outright once ADR-0072 retired their last callers rather than kept
for ones that no longer existed. `ShellSelector`, the `shell` setting, its
`settings-context.tsx` state, `src/ipc/settings.ts`'s `Shell` type and
`setShell`, and the `set_shell` Tauri command all retire with it: nothing
left in `App.tsx` reads a shell once no chrome branches on one.
`previewFeatures` keeps its name, its meaning and its default (off); it
moves from gating a shell switch to gating a workspace switch, which is
materially what `openWorkspace` already does today for the shell case.

`CommandContext.workspace` (`App.tsx:1820`) needs to learn `'map'` as a real
value instead of narrowing it away, so the palette's host-book commands stop
being blind to it.

**Cost**: the largest of the three that stays in scope. Touches the
shell/workspace sync effect (deleted, not adjusted: with one state instead
of two there is nothing left to keep in sync), all four toolbar branches,
`ActivityRail`'s mount and its two remaining slots, `ShellSelector` and its
locale strings (`shell.switch.*`, `shell.current.*`), the `set_shell` IPC
command and its Rust-side test, and `tests/ipc-contract.test.ts` and
`tests/workspace-pills.test.ts` in lockstep. No new dependency, no change to
`vault/` or how credentials cross the IPC boundary, no change to host key
verification, no on-disk session format touched. Removing `set_shell` is
removing a command with no caller left to break, not changing a contract an
existing caller still relies on, but it is still an IPC surface shrinking,
named here so it is decided knowingly rather than discovered mid-diff.
**Forecloses**: keeping `shell` in reserve as a coarser, harder boundary than
a workspace if the map ever again needs to diverge from assumptions the
shared `Toolbar`/rail bakes in for the other three workspaces. ADR-0069's own
Rules ("nothing in `ssh/`, `sftp/`, the registry or the credential model
knows which shell is in front") stop being enforced by a type boundary and
become an informal convention again.

### Option C: Retire classic navigation outright

Go straight to the rollout ADR-0064 planned and ADR-0066 deferred for
v0.9.0: cut classic, leave only the map, and let SSH sessions and SFTP
folders exist as components on it rather than as workspaces beside it.

**Cost**: the largest by far, and not one this document has evidence to
pay. ADR-0066's Decision was explicit that this cut waits on retention
signal from real use of the opt-in preview; none has been gathered or is
cited here. **Forecloses**: "keep both," which ADR-0069's Consequences
named as already built and reversible only as a deletion, not a rewrite,
if the evidence ever points the other way. Conflating "one navigation
frame" with "one navigation destination" would decide that still-open bet
as a side effect of a UI-consistency fix, not on its own terms.

## Decision

Option B. It answers exactly the seam the maintainer named, a pill that
looks like a workspace and is not one, without deciding the larger and
still-open question Option C would settle by side effect. Option A leaves
the seam in place with no new information gained by waiting.

This reverses ADR-0069's Decision that a shell is a window-level choice
distinct from a workspace: `map` becomes a workspace like the other three,
sharing their toolbar and their entry into the "+" host palette's absence
(`home` remains folded into it, unchanged since ADR-0072). ADR-0069's Status
is updated to `Superseded by ADR-0075`. It amends, without reversing,
ADR-0073's Decision: the pill stays fixed and still opens `MapPreviewPrompt`
when `previewFeatures` is off, but what accepting the prompt does underneath
changes from a shell switch to a workspace switch. ADR-0073's Status is
updated to note the amendment. It completes, rather than reopens, ADR-0072's
own rail reduction: the two slots ADR-0072 left on `ActivityRail` "pending
ADR-0073" retire the same way the other three already did.

## Consequences

**Good**: the MAPA pill means what it looks like. One `Toolbar` shape
instead of four keeps leading/trailing content honest by construction
instead of by four separate call sites agreeing with each other.
`ActivityRail` and its shell-gated mount go away entirely, closing the exact
asymmetry (classic has no rail, map has one) that ADR-0072 stopped one slot
short of removing. Code that already keyed off `workspace` rather than
`shell` (the broadcast/macro-target resolvers, `MapStage`'s own reporting
callbacks) needed no reshaping to become correct; it already was.

**Bad**: this reopens two files (`ADR-0069`, `ADR-0073`) inside the same
week they shipped, which is the literal cost ADR-0069 named and accepted
("two shells to keep working on one backend... for as long as both exist")
turning out shorter-lived than that Consequence implied. The wall ADR-0069's
Rules put between the map and everything in `ssh/`, `sftp/`, the registry and
the credential model was a type-level guarantee; after this it is a
convention enforced by review, not the compiler. A `settings.json` written
while `shell` still existed keeps a `shell` field nothing reads anymore;
whether that is silently ignored or needs an explicit drop is a Phase 1
question for the implementer, not answered here.

**Follow-up**: Phase 1 confirms how the orphaned `shell` field in an old
`settings.json` deserializes once nothing declares it. Phase 4 inverts
`tests/workspace-pills.test.ts`'s "never selected" assertion, removes the
`shell`/`set_shell` pins from `tests/ipc-contract.test.ts` and its Rust-side
counterpart, and folds `home` into the "+" palette the same way ADR-0072
already did for classic. Whether the `shell.*` locale namespace, left with
only `shell.preview.*` once `shell.switch.*` and `shell.current.*` retire
with `ShellSelector`, is worth renaming now that "shell" is not a concept in
the app, is deferred the same way ADR-0073 deferred `previewFeatures`'
possible rename: worth asking, not decided here.
