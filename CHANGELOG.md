# Changelog

Notable changes, kept by hand. The commits are conventional and the history is
linear, so a generated list is always available from `git log`; this file is for
the things a person needs to know before installing or upgrading, which is a
different list and a much shorter one.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
versions follow [semantic versioning](https://semver.org/spec/v2.0.0.html),
with the caveat that anything below 1.0 may break, and this project intends to.

## [Unreleased]

## [0.4.0] — 2026-09-04

Opens the ground v0.3.0's roadmap named next: port forwarding. Everything
else below shipped in the same window and is not held back for a release
of its own, including a reorganization of the host book itself, prompted
by the same question the forwarding work kept raising: what a saved host
actually is, structurally, was never something the list showed. Session
import (OpenSSH and PuTTY), also named in v0.3.0's roadmap, did not make
this window and moves to v0.5.0 rather than holding the rest back
(#128).

### Added

- **Port forwarding: local, remote and dynamic** (ADR-0054, #301
  through #305). Saved per host, alongside its own credential, and
  started the instant that host's session connects, no separate command
  to remember and nothing left running once it disconnects.
  - **Local** forwards, the direction with the most production mileage
    already: `open_forward` is the same call site every jump chain has
    used since v0.2.0.
  - **Remote** forwards, the server initiating a channel back to this
    machine rather than the reverse, new surface for `ssh/connection.rs`'s
    own handler.
  - **Dynamic** forwards, a local SOCKS4/SOCKS4a/SOCKS5 listener whose
    destination is read from the handshake itself rather than fixed when
    the forward was saved; documented in `docs/security-model.md` as the
    one wider grant of the three, since where it can reach is chosen live
    by whatever client uses the proxy rather than named once by a person.
  - The host editor's own Forwarding section is where one is added,
    edited or removed; the status bar says how many are running for the
    session in front of you.

- **The host book organized by topology, not a free-text group**
  (ADR-0060). `proxyJump`, not a typed-in label, decides where a host
  lists: **Bastions**, a host carrying at least one other, its own
  riders nested directly beneath it, recursively; **Direct**, flat,
  everything else. `group` moves off the section axis onto a small pill
  per row instead. A bastion's own fold state survives closing the
  application, the first use of `localStorage` anywhere in this
  frontend, and a name search auto-expands whichever folded bastion
  holds the match it is reporting.

- **The host editor is one screen**, General, Topology, Access and
  Forwarding together (ADR-0056, #295 through #297, #308, #309, #311),
  the credential read and proven in the same click that saves everything
  else (ADR-0057) rather than a step reached after. A failed credential
  test reports inline, next to the field it is actually about, and Save
  is the retry (ADR-0058). Topology and Forwarding each fold to one bare
  line when a host's data says neither is in use, and open on their own
  the instant it is, driven by the same fields for a fresh draft and an
  existing host alike (ADR-0061).

- **Theme and language are reachable from every toolbar** (ADR-0059,
  ADR-0062), not Home's alone: each folds behind one button showing the
  current choice, the same fold `ShapeControl`/`SftpSplitControl`
  already used for "which one of several is this," rather than drawn as
  a flat row of chips.

- **A brand MOTD prints into the terminal on connect** (#294, ADR-0051),
  the same mark the empty states already carry, now the first thing a
  fresh shell shows too.

- **SFTP: rows select by click**, the way a file manager's already do,
  not a checkbox per row (#291). Rename and delete gained their own icons
  in the nav bar, F2 and Delete as shortcuts, and delete asks first
  (#292). The upload-from-dialog icon and its `tauri-plugin-dialog`
  dependency are gone, dragging in from the host's own listing having
  made it redundant (#293).

- **Home's own host list can hide**, the same rail click that already
  toggled Sessions' and SFTP's sidebars, and its empty state carries the
  brand mark the others always had (#325).

### Fixed

- Deleting a host asks first; it used to happen on the spot (#326).
- The wizard closes itself the instant a save succeeds, instead of
  waiting on a card and then a Finish click for an ending that needed
  neither (#329).
- A wrong password now reports inline, next to the password field, the
  way an ordinary form does; it used to open a separate card (#330).
- Reopening an editor mid-save no longer loses the credential form that
  was on screen (#322); a bastion's own credential listener no longer
  outlives the wizard that registered it (#324).
- SFTP's source pane can clear itself, the way every destination already
  could (#332).
- **Three visual regressions found in a pre-release audit** (#333): a
  banner in the host editor was narrower than the panel it should have
  spanned (ADR-0056's own rule); a locale string used first-person
  voice ("I remove it") where every other system message in the tree is
  impersonal; `hostKind.jumpServer` was translated per locale when it
  names the same technical term this project keeps untranslated
  everywhere else, "JumpServer."
- **Four more reported live after that pass**, none caught by it: the
  host editor's two columns were fixed at 440px/340px, inherited from
  the old single-column wizard, leaving a void on a wide window; the
  Access column's own input style was copied from a floating card and
  never restyled to match the rest of the form; a fresh draft's first
  field never actually received focus, an unrelated effect stealing it
  every time; the Delete/Cancel/Save row had no separator from the form
  above it.
- SFTP's empty source and destination drop targets drew a generic folder
  glyph and one line of text, the one empty rectangle in the app without
  the brand mark every other one already carries.
- `wnaf`, pulled in transitively through `russh`'s elliptic-curve stack,
  bumped past a version crates.io yanked the same day it landed.

### Known limitations

- **Session import from OpenSSH and PuTTY did not ship**, despite being
  named in v0.3.0's own roadmap entry for this release. Moved to v0.5.0
  rather than held back further (#128); nothing about this window's work
  narrows what it will need to do.
- **Remote and dynamic forwards are proven by their own unit tests, not
  by the same live, driven confirmation local forwarding got.** A local
  forward was driven end to end against a real fixture and its bind port
  checked to genuinely tunnel traffic; remote (the server-initiated
  channel) and dynamic (the SOCKS listener) are new surface this window
  did not drive the same concrete way.
- **A saved forward binds on every connection regardless of whether the
  service on the far end still exists.** The same cost OpenSSH's own
  config directives already carry, not a new one this design invents,
  but nothing here detects or reports it.
- Everything v0.3.0 listed that is not named above is still true,
  including SFTP having no resume and a folder copy that fails partway
  leaving no cleanup.

## [0.3.0] — 2026-09-01

Opens the ground v0.2.1's roadmap named next: SFTP, moving files over the
connection that is already open. Everything else below shipped in the same
window and is not held back for a release of its own.

### Added

- **SFTP, as a workspace of its own** (ADR-0041, ADR-0044 through ADR-0049).
  Reached from the activity rail, third icon, locked shut while synchronised
  typing is armed the same way Home is.

  - **Source and destination are both free.** Either side is `localhost` or
    any saved host, dragged in from the same sidebar Sessions uses
    (ADR-0046). Remote-to-remote is a real path, not local-only with a
    remote label: two different connections, neither one this machine.
  - **One source, up to four destinations**, each independently browsable,
    each filled by its own drag. A drop on an empty slot adds it; a drop on
    an occupied one replaces it outright, no confirmation (ADR-0045).
  - **A file sent from the source lands in every occupied, receiving
    destination at once.** A destination can be spared from a broadcast
    Send without being removed, and a direct drag onto one specific
    destination reaches it regardless of that switch (ADR-0047).
  - **A folder copies recursively**, depth first, one file at a time inside
    itself, and keeps going past a single file's failure rather than
    aborting the tree: it finishes and says how many files did not make it,
    not which ones (ADR-0049).
  - **Create, rename and delete**, on any pane, source or destination
    (ADR-0048). A directory deletes with everything inside it; there is no
    "must be empty" refusal SFTP v3 would have forced otherwise.
  - **Every name a server sends is checked before it is trusted**, the same
    instinct host key verification already uses for a different kind of
    server-supplied value: no path separator, no `.` or `..`, no control
    character, length capped. A name that fails this is dropped from the
    listing rather than shown mangled.
  - **Navigation carries a back stack, no forward**, a breadcrumb, and a
    shared toolbar with Sessions for the split control and select-all
    (ADR-0046, ADR-0047).

- **An opt-in internal vault, behind a master password** (ADR-0035). A
  machine with no OS keychain, a container, a minimal Linux install, WSL,
  used to mean retyping every password on every restart, with only a
  for-this-run credential as the alternative. The vault is a second,
  explicitly chosen store: nothing is written to it until it is turned on,
  and everything already resolvable through it is checked before it is
  trusted.

- **Home is a portal of its own**, split out of Sessions (ADR-0029). A card
  per domain, Sessions and Hosts among them, rather than Sessions carrying
  the settings and host management screens it never was designed to hold
  alongside a working terminal.

- **Saved hosts go through one wizard**, for both creating and editing
  (ADR-0030, ADR-0032 through ADR-0034, ADR-0039). A host's credential is
  set once, on the wizard's own Access step, and an ordinary Sessions
  connect that finds none saved is sent to that step directly rather than
  through a separate recovery screen, closing a path ADR-0034 had
  deliberately left open when this replaced it.

- **A bastion already open is found and ridden**, closing v0.2.1's own
  written limitation (#200). A chain opened by Sessions itself is now
  registered the same way a bastion opened as its own session already was,
  so a second chain to the same host shares the connection instead of
  opening another one against the same `MaxSessions`.

- **Sessions with nothing open names itself.** The mark beside the empty
  state now carries the wordmark next to it, the same brand mark and the
  same `app.name` string the title bar already uses, drawn larger. Purely
  decorative; nothing about the empty state's behaviour changed.

### Fixed

- **A shell that exits with no explicit status now shows the closed
  banner** (#281). `exitStatus: null` meant two different things, never
  closed and closed with nothing reported, and a plain `exit` on this
  session's own fixture produces exactly the second. A separate `closed`
  field replaces the overload.
- **The vault's remaining commands run off the IPC thread** (#284). Seven
  command bodies and one shared helper called into the keychain
  synchronously from async functions; each now goes through the same
  `spawn_blocking` wrapper `resolve_credential_async` already used.
- `chacha20` bumped past a version crates.io yanked.

### Security

- **npm dependencies are checked against known advisories** (#92). The
  Rust tree has been checked daily since v0.2.1; the frontend tree had a
  committed, frozen lockfile and nothing consulting a vulnerability
  database against it. `audit.yml` gained a `pnpm audit` job doing what
  `cargo audit` already does for the other side. Version drift with no
  advisory attached stays unwatched on purpose: a 16-dependency tree does
  not yet justify a bot opening one pull request per outdated package.
- **A credential is no longer collected in a document of its own**
  (ADR-0039, superseding ADR-0008). The dedicated window this used to open,
  its own webview, its own script, unreachable from the one rendering a
  remote host's hostile output, is retired: nothing but an already-obsolete
  recovery path still opened it. The credential now lives in a plain,
  uncontrolled field on the wizard's Access step, read once through
  `FormData` and never bound to application state, which keeps the secret
  out of the render tree the way `CLAUDE.md` already requires regardless of
  how many documents there are. What is genuinely narrower: the separate
  document meant an XSS anywhere else in the frontend could not reach this
  field even if one existed; that boundary is gone, and nothing since has
  re-argued the trade. Written into `docs/security-model.md` rather than
  left implicit.

### Known limitations

- **Two concurrent `sftp_list` calls on one connection were once observed
  to return a truncated listing** (#252). The frontend site that produced
  it, a sidebar's own ancestor-tree cache, has since been removed by two
  unrelated redesigns (ADR-0045, ADR-0046), and the generic mechanism has
  now been tested two different ways against the real fixture with nothing
  to show for it. Closed without a confirmed root cause, on the strength of
  the reachable site being gone; the regression tests stay as a guard if
  the shape ever resurfaces.
- **A folder copy that fails partway leaves no cleanup.** A subdirectory
  already created at the destination, with some or all of its files never
  sent, stays exactly as far as the walk got when it was cancelled or
  finished with failures. Disclosed in ADR-0049 rather than found later.
- **SFTP has no resume.** An interrupted upload or download starts over
  from nothing the next time, the same as every transfer in this release.
- Everything v0.2.1 listed that is not named above, or closed by #200
  above, is still true, including a locked keychain refusing rather than
  prompting, a credential kept for this run being invisible in the editor,
  and macOS remaining unopened by anyone.

## [0.2.1] — 2026-08-26

Finishes what v0.2.0 claimed. Three of the limitations that release wrote down
are closed: a machine with no keychain can now reach a host through a bastion,
a chain no longer opens a connection nothing on screen admits exists, and a host
already serving as a jump host can no longer be given one of its own. The
credential window, which v0.2.0 made people see far more often, was rebuilt
around that fact.

One thing v0.2.0 claimed that was not true is corrected below rather than
fixed, and is written into the limitations with the issue that will fix it.

### Added

- **Spanish is offered in the language selector** (ADR-0007, #4). It has been
  complete in the tree and held to the same key-parity tests as the other two
  since v0.1.0, and held out of the selector that whole time because a
  mistranslated host key warning is a vulnerability rather than a typo and
  nobody here could check it. A native speaker has now read the copy that
  describes a security decision to the user: both host key screens, the vault
  failures, and the authentication errors that say what to do next. Exposing it
  was the one-line change ADR-0007 said it would be.

- **A password can be saved for a host from its own form** (#189). "Connect once
  and save a password" opens the connection, verifies the host key, collects the
  credential in the window every other host uses, and closes the connection as
  soon as the server accepts it. There is still no password field on a form, and
  there never will be: the form is rendered in the document that also renders
  hostile output from a remote host, and ADR-0008 keeps every secret out of it.
  The block says whether a password is stored, and offers to replace it or to
  forget it.

- **A host carrying somebody else's session says so** (#168). Connecting to a
  host behind a bastion opens a second connection, to the bastion, which is
  authenticated. Nothing on screen admitted it existed: no tab, no marker, and
  the bastion's own row read "saved, not connected" while the application was
  logged in to it. Its row now has a state of its own, and the status bar of the
  session riding it names the host it travels through. Those are two different
  questions, "what is open" and "where does this go", and they are answered in
  the two places somebody looks for each.

- **A jump host asks for its own credential when it has none** (ADR-0027, #165).
  It came from the keychain and only from the keychain, so a machine with no
  secret service could not use a jump host at all: the chain was the one feature
  that hard-required one. It now opens the same prompt window every other host
  uses, and the answer kept for the life of the run serves every host behind
  that bastion until the application closes. The prompt says which hop it is
  asking about, in the heading as well as in the body, because two prompts
  arrive in a row for two different machines and telling them apart is the
  condition ADR-0023 attached to allowing this at all.

  A jump host is asked about **once** for one click, including when accepting
  the far host's key rebuilds the chain. Cancelling a host key prompt now tells
  the core, so a decision nobody answered stops holding what was typed for it.

  A keychain that exists and refuses is deliberately not covered. A locked
  keyring is a different problem from an empty one, and prompting past it would
  teach people to retype a password instead of unlocking it, so that case still
  refuses and now says why.

### Fixed

- **A host already serving as a jump host is no longer offered one of its own**
  (#171). The check refused a jump host that was itself behind one at the moment
  it was chosen, and did not refuse the other order, so a two-deep chain could be
  built by saving the pieces in the wrong sequence, and the hosts it broke were
  ones the user never opened. The core refuses it now, and the form says which
  hosts are reached through this one instead of offering a control that would be
  turned down. A session already saved in that state can still be repaired,
  because the value it holds stays in the list until it is cleared.

- **Forgetting a password forgets both copies** (#189). A credential kept for the
  life of the run is answered before the keychain is read, so clearing only the
  keychain left the next connection finding it anyway. The button would have said
  something it had not done.

- **A jump host says when its password was not kept** (#191, #167). The keychain
  refusing was reported for the host the user clicked and silently dropped for
  the hop with no tab, including on the rebuild that follows accepting a host
  key. The badge on the status bar now says which of the two it was about, rather
  than hiding the difference behind a hover.

- **The host form says when the core refused an action** (#198). `submitIn` had
  no `catch`: a save the core turned down was a rejected promise nobody read, and
  the form said nothing at all. There is now a line above the fields naming what
  did not happen and why, a failed save leaves the tab open holding what was
  typed, and a delete closes the form when the host is gone rather than before.

- **The credential prompt belongs to the application now** (#188). It was
  centred on the screen with no parent, so the desktop treated it as a stray
  dialog: it did not group with Runic SSH in the task switcher, and with the
  main window pushed to a corner it opened somewhere else entirely. It is now a
  child of the main window and opens in the middle of it. On Windows that also
  means the prompt is hidden while the main window is minimised, and comes back
  with it.

- **The credential prompt has no title bar of the desktop's** (ADR-0028, #193,
  #188). It carried one, against the chrome every other window in this
  application uses, because it was the only way to close a prompt whose script
  never ran, and a prompt that cannot be closed is a connection that hangs. The
  way out is now Cancel in the main window, which is a control in a different
  document with a different script and survives the same failure. That had to be
  built anyway: cancelling used to leave the prompt standing, on top of
  everything, asking for a connection that no longer existed.

- **The credential prompt speaks the same shape as the host key screens**
  (#188). It had one of its own: a bare heading, a different type scale, its own
  buttons. ADR-0015 replaced five shapes with one for exactly this reason, and
  this window escaped the rule because the rule was written about surfaces
  inside the main window and this one is not inside anything. It now renders
  through the same `SessionSurface`, at the same 560 points wide, filling a
  window rather than floating in a panel.

- **The credential prompt is one size, and nothing in it scrolls** (#188). It
  had two heights, picked from whether a jump host was being asked about, and
  neither had room for a private key with its passphrase and every keep option.
  There is now one height, measured rather than estimated by opening the window
  oversized and reading off where the content stopped. A password prompt carries
  the difference as space under the fields: empty space reads as a dialog with
  room in it, and a scrollbar over a credential form does not.

- **Every way of keeping a credential is on screen again** (#188). The prompt
  showed one of its three answers on desktops that draw a window's title bar
  inside the size the window was given: 47 points of the 340 asked for went to
  the decoration, and what fell off the bottom was two thirds of a control that
  still looked complete. The window is now sized with an allowance for that, the
  action row sits outside the part that scrolls so nothing can push it off, and
  a placement that would land under a task bar is pulled back into the work
  area. Asking for a private key was worse than clipped: the field collapsed to
  nothing and its label printed over the passphrase label, so a key could not be
  pasted at all.

- **Right clicking no longer offers to reload the window** (#179). WebKit's own
  menu carried Reload, which restarted the document and emptied the window while
  every connection stayed authenticated on the far side, reachable by nothing on
  screen. The menu is kept where it can only edit, which is the only way to
  paste with the pointer.
- **Arming and disarming synchronised typing is announced** (#154). Every marker
  for it was visual, so somebody using a screen reader was told nothing at all
  about the one control whose blast radius is larger than the host in front of
  them.
- **The copy no longer describes the anatomy ADR-0020 replaced** (#180). Ten
  strings called a group a pane, and the one shown while confirming a paste to
  several hosts described the older broadcast rule, which reached more sessions
  than the current one does.

### Security

- A bastion's credential is asked for in the same window every other host uses,
  and the window says which hop it is asking about, in its heading as well as in
  its body. Two prompts arrive in a row for two different machines, and telling
  them apart is the condition ADR-0023 attached to letting a bastion prompt at
  all. The far host's credential is still never sent to the bastion: the two
  hops authenticate end to end, and the bastion forwards ciphertext it cannot
  read.
- A host carrying a chain is now visible, which `docs/security-model.md` asks
  for: an open authenticated session on a bastion is a live credential in use,
  and a client holding one without saying so asks somebody to reason about what
  it has hidden.
- **The Portuguese security copy was reviewed for this release**, including the
  thirty strings added since the last review: the editor's password block, the
  four endings a kept credential can have, the jump host's refused keep, and the
  copy about a host carrying somebody else's session. The same pass replaced
  `keychain` with `chaveiro` throughout, which is the word somebody using the
  application in Portuguese would actually reach for. `src/lib/i18n/locales.ts`
  records what was covered and when; nothing in the tree fails when that note
  goes stale, which is #192, and it had gone stale twice by then.
- **The Spanish security copy was reviewed by a native speaker**, which is what
  ADR-0007 attached to offering it and what #4 tracked. The reviewer verified
  rather than translated, which is the job that issue describes, and the English
  stayed normative. What it changed was mostly consistency: the catalogue
  addressed the reader as `tú` in some strings and `usted` in others.

  The reviewer asked not to be named, and #4 asks for a named one, so that part
  of its wording is not met. What a name carries is somebody to ask, and the
  maintainer confirmed this review and stands behind it. That is weaker than a
  name and stronger than nothing, and it is written down as the middle thing it
  is.
- Two English strings lost a long dash used as a connector, which is the house
  rule in section 1 of `CLAUDE.md` and which the Portuguese pass had already
  applied to its side of them. English is normative and was the only one of the
  three still breaking it.

### Known limitations

- **A bastion is not shared as widely as v0.2.0 said it was** (#200). That
  release claimed three hosts behind one jump host open one connection to it.
  That is true only for a bastion already open as a session of its own, which is
  what a chain looks for. A bastion the chain opens itself is not registered, so
  the next chain to the same host cannot find it and opens another. ADR-0024
  says it should be registered and that part was never built; doing it needs a
  decision about when the registry lets go of a connection nobody asked for,
  which is why it is an issue rather than a line in this release.
- **A locked keychain still refuses rather than prompting** (#165, in part). A
  machine with no credential store at all now prompts, and the answer kept for
  the life of the run serves every host behind that bastion. A store that exists
  and says no is a different problem: prompting past it would teach people to
  retype a password instead of unlocking their keyring.
- **A credential kept for this run is invisible in the editor** (#197). The
  password block reads what is on disk, so a password held in memory until the
  application closes shows as no password at all. Nothing is wrong with the
  connection; the form is answering a narrower question than it appears to.
- **The bastion cannot be closed on its own.** Its row says it is carrying
  something and offers no way to drop it, because there is no honest one yet: the
  connection closes when the last session riding it leaves, so a button there
  would change the row and leave the connection up.
- Everything v0.2.0 listed that is not named above is still true, including the
  password typed with synchronised typing armed, the arrangements of six and
  nine, and macOS remaining unopened by anyone.

## [0.2.0] — 2026-08-26

### Added

- **The window has an anatomy, and it is written down** (ADR-0020). A top strip
  of mark, drag surface and window controls; a rail of activities down the
  leading edge that never closes; the session list beside it, which does; and a
  main area of groups. Four surfaces used to be decided one at a time, and the
  next one inherits this instead of deciding again.
- **Groups.** The main area divides into two columns, two rows or a grid of
  four, and every rectangle is a strip of tabs over the body of whichever tab
  it is showing. Six sessions in four rectangles is now expressible. The strip
  is the tab bar and the pane header at once: those were two objects naming the
  same rectangle, and nothing failed when they disagreed.
- **Everything opened is a tab.** A terminal, a host form and the settings page
  all live in a group. A session's questions, the host key prompt included, are
  drawn inside the group whose active tab that session is, and nowhere else, so
  a question about one host leaves the terminals around it readable.
- **A group's own controls.** The `+` opens a host form in that rectangle. The
  trailing button, and right-clicking a tab, open a menu that sends a tab to
  another rectangle or closes every tab in this one. Closing says how many
  connections it is about to drop before it is clicked, and never throws out
  unsaved work in bulk: a form holding changes stays where it is and asks.
- **Typing into every group at once.** One switch, off by default, reaching the
  active tab of each group. A session sitting behind another tab in the same
  group is connected and is not receiving. It disarms itself whenever the set
  of sessions on screen changes.
- **Any group can be spared**, from the check box on the tab that would
  receive, so three of four machines in a pool can take a command while the
  database does not. Typing into a spared group reaches only that group.
- **Every surface says who is receiving.** The whole top edge of the status bar
  turns amber and carries the count and the way off. Every receiving group is
  outlined. The sidebar marks each receiving host and labels every connected
  host that is not receiving `SPARED`, which is the only place two of the three
  ways to be spared can be read. The rail turns amber and holds the settings
  gear shut. The switch is a safety decision and not a convenience.
- Every paste is shown before it is sent while that switch is armed, single
  lines and bracketed pastes included. Bracketed paste stops the remote shell
  running the lines; nothing stops a paste reaching four machines because the
  wrong group had focus.
- **A host reached through a bastion** (ADR-0023). A saved session names
  another saved session as the host it is reached through, rather than
  repeating its address, because a bastion is a host in its own right: it has
  its own key to verify and its own credential to answer. The whole sequence,
  verify, authenticate, forward, verify, authenticate, runs in the core, which
  is where this feature's entire security content lives.
- **One bastion, shared by everything behind it** (ADR-0024). Three hosts
  behind the same jump host open one connection to it, not three, and it closes
  when the last of them does. The sidebar marks both ends of a chain, and a
  host with no chain is marked too, so the absence of a mark never has to be
  read as an answer.

  **Corrected in v0.2.1**: the sharing holds only for a bastion already open as
  a session of its own. A bastion a chain opens itself is not registered, so the
  next chain to the same host opens another connection to it. The claim above is
  left as it was written; the state of it is #200.
- **A credential can be kept for the life of the run** (ADR-0025). Three
  answers rather than a tick box: used once, held in memory until the
  application closes, or written to the OS keychain. The middle one needs no
  keychain, which is the only thing a machine without one can be offered, and
  it is written nowhere, so a restart asks again.
- **The theme is chosen in settings** (#149). Follow the system, light, or
  dark, remembered on this machine and sent nowhere. The palette is composed in
  dark and light is the same tokens with the values swapped, which the settings
  page says out loud so nobody reads light as an afterthought.
- **Randomart beside the host key fingerprint**, drawn the way `ssh-keygen -lv`
  draws it. Its whole value is being the same picture, since the way it gets
  used is comparing what is on screen against what OpenSSH printed somewhere
  you already trust, so the tests pin twelve pictures captured from the real
  command rather than twelve this code produced.
- **The status bar says which host it is describing**, from the same label a
  tab carries, so the two cannot come to call one session by two names.
- **The main area can be divided with a pointer** (ADR-0021). Four shapes at
  the trailing edge of the top strip, which is the only surface in the window
  that belongs to the window rather than to something inside it.
- **Three, six and nine rectangles** (ADR-0022), including both arrangements of
  six: three columns by two rows, and two by three. Three columns at full
  height is the shape with the most lines of terminal of any that divides the
  area, 43 x 34 at 1440x900. Three columns by two rows is the shape
  the area ADR-0020 freed actually bought: six rectangles at the same fifteen
  lines of terminal that four give today. Nine is for the fleet being restarted
  and watched rather than the fleet streaming; the measurement behind that
  distinction is in `docs/measurements/terminal-throughput.md` and the
  assumption is stated in the decision record.
- **Four terminals painting at once has been measured** (#123). Fed at the rate
  the transport actually delivers, they hold a 16 ms median gap between frames,
  with the worst gap in 620 frames at 24 ms. The four-rectangle limit rests on
  a number now rather than on a guess.

### Changed

- **The interface palette is the denser navy and cyan** the design canvas has
  been drawn in since ADR-0020. The canvas said its colours came from the token
  file and the token file still carried what came before them, so the record
  and the application disagreed about what colour the product is. A test reads
  the canvas generator and fails when they drift again.

### Fixed

- **A credential the keychain refused is reported rather than swallowed**
  (#167). A locked keyring must not undo a connection that worked, and the old
  code was right about that and then said nothing at all, so the tick box
  looked honoured when it was not.
- **The language select is drawn by the application** rather than left to the
  platform, which rendered it in the desktop's own colours in the middle of a
  window that had none of them.
- **Two writes to one session can no longer interleave.** Input was split to
  stay inside what the core accepts, which ordered the pieces of one write and
  nothing between two of them. Nobody hit it with one terminal and one person
  typing; typing into several at once makes overlapping writes ordinary.

### Security

- **One type holds every secret** (ADR-0026). Passwords, private keys and
  passphrases are carried in a type with a redacting `Debug`, no `Display` and
  no `Serialize`, so the rule that nothing secret reaches a formatter is held
  by the compiler rather than by remembering. Three hand-written `Debug`
  implementations were deleted when it landed, which is the check on whether it
  works: the rule now holds in those three places without anybody having
  decided that it should.

### Known limitations

- **A password typed with the switch armed goes to every receiving group.**
  There is no way to notice: the remote pty turns the echo off on the far side
  of the channel, so nothing here can tell a password prompt from any other
  output. The switch being loud and off by default is the whole of the
  protection. A session sitting in a group's background is connected without
  receiving, which is a second way to be surprised by where a keystroke went,
  and the sidebar is where that one is read.
- **A machine with no keychain cannot reach a host through a bastion** (#165).
  Both hosts prompt on every connection, which works, and the chain then asks
  for the bastion's credential again on the next connection through it. The
  credential kept for the life of the run narrowed this to a single run and did
  not close it.
- **A chain leaves a connection nothing on screen names** (#168). Connecting to
  a host behind a bastion opens a session on the bastion too, and the sidebar
  shows one connected host rather than two. It closes with the last host behind
  it, so nothing leaks; what is missing is the admission that it is there.
- **A host already serving as a jump host can be given one of its own** (#171).
  The check refuses a jump host that is itself behind one at the moment it is
  chosen, and does not refuse the other order, so a two-deep chain can be built
  by saving the pieces in the wrong sequence.
- **Nine rectangles is offered on an assumption rather than on a measurement.**
  Nine hosts all streaming at once ask for more than the renderer draws, and
  nothing on screen says so when it happens. Nine hosts being restarted and
  watched are nowhere near it. ADR-0022 says which is which and why the shape
  is offered anyway.
- Two columns by three rows gives nine lines of terminal at 1440x900, which is
  fewer than `top` wants. It is offered because which arrangement of six suits
  the work is not something the application can know.
- Groups hold sessions that are already connected. A second terminal on a host
  you are already on is not possible yet, and would need a second connection.
- No draggable divider, and no keyboard shortcut for splitting or for moving
  between groups. Both go through the command palette.
- SFTP has no code behind it, so the rail carries one view rather than the three
  the design canvas draws. The icon arrives with the feature.
- **macOS is still unopened by anyone.** The `.dmg` builds on every run and
  that remains the whole of what can be said about it. `docs/installing.md`
  tracks which packages a person has installed, per platform, which is not the
  list CI produces.
- **Windows 11 Snap Layouts is not coming**, and that is now a decision rather
  than a gap (#28). The drawn title bar cannot answer `WM_NCHITTEST` with
  `HTMAXBUTTON` without a window procedure Tauri does not expose, which was
  measured rather than argued. Snapping into a zone works by every other route,
  and ADR-0005 has been amended to withdraw the claim it used to make.

## [0.1.1] — 2026-08-23

Copy and paste, which v0.1.0 shipped without. A terminal you cannot get text out
of is not one you can work in, and this was the first thing the release ran into
in daily use.

### Added

- **Copy and paste in the terminal.** Ctrl-C copies when text is selected and
  interrupts when nothing is, which is the behaviour of every terminal that
  offers both. Ctrl-V pastes. Ctrl-Shift-C and Ctrl-Shift-V always mean the
  clipboard whatever is on screen, so there is a binding that never has to
  choose. On macOS the command key does the clipboard and Ctrl-C is left alone.
- **A confirmation before a multi-line paste** the remote shell has not
  bracketed, showing the lines that are about to run. A shell executes each line
  of a paste as it arrives, so pasted text with a line break in it runs without
  anybody pressing Return.
- The exit line under a closed session is translated, rather than English in
  every locale.

### Fixed

- **A paste larger than 32 KiB no longer disappears.** The core refuses any
  single input above that limit, and the refusal landed on a promise nobody
  awaited, so pasting a private key did nothing at all and said nothing about
  it. Input is now split to stay inside the limit and delivered in order.

### Security

- Copy and paste use the browser's own clipboard events, raised by the
  keystroke. No clipboard plugin, no new permission, and the capability set is
  still the six entries ADR-0013 settled on. The plugin route was refused
  because it grants the ability to read the system clipboard at any moment to
  the document that renders hostile output (ADR-0018).
- Copying moves terminal contents to the system clipboard, where any local
  process can read them. That is deliberate, asked for by the person at the
  keyboard, and now written into `docs/security-model.md` rather than left
  implicit.
- The Spanish string for the paste confirmation describes a security decision
  and has not been reviewed by a native speaker. Spanish is still held out of
  the language selector for exactly this reason (#4).

### Known limitations

- A selection left on screen costs one Ctrl-C: the first press copies it, and
  the second interrupts. Ctrl-Shift-C always copies for anyone who would rather
  never spend that press. ADR-0018 records why clearing the selection on every
  write from the host was rejected.
- There is no context menu on the terminal yet, so copy and paste are
  keyboard-only and a person who does not know the convention will not find
  them.

## [0.1.0] — 2026-08-23

First packaged release. It connects, and that is the claim: an SSH client that
opens a verified session and gives you a terminal on it. Pre-release, and
deliberately labelled one.

### Added

- **SSH sessions** over `russh`, with no OpenSSH process spawned (ADR-0003).
  One terminal per session, kept mounted across tab switches, and a second shell
  on one connection is refused rather than silently abandoning the first
  (ADR-0014).
- **Host key verification** with a screen per outcome. An unknown key prompts
  with its fingerprint and the trust button starts inert until you confirm you
  checked it out of band. A changed key blocks and takes the host name typed
  back before it will replace anything. `@revoked` and `@cert-authority` refuse
  outright, with no override offered. `known_hosts` is parsed here rather than
  shelled out to (ADR-0009).
- **Credentials collected in a window of their own**, destroyed after use, and
  referenced across the IPC boundary by opaque id. The secret is resolved
  against the OS keychain at the moment of use and never travels toward the
  frontend (ADR-0004, ADR-0008). Password or private key, with optional storage
  in the system keychain.
- **Saved hosts**, grouped, with a form per host on its own tab (ADR-0017) and
  unsaved work marked on the tab it belongs to.
- **A command palette** on `Ctrl+Shift+P`, reaching sessions, the host editor,
  the window controls and the settings.
- **Three locales**, English, Brazilian Portuguese and neutral Spanish, from
  typed error codes, with no i18n dependency (ADR-0007). Spanish ships in the
  tree and is **not offered in the selector**: its security copy has not been
  reviewed by a native speaker (#4).
- **Light and dark themes** resolved from one token set, following the system.
- **Our own window chrome**, with the native title bar available as a setting
  for anyone whose window manager needs it (ADR-0005).
- **A status bar** carrying connection state, round-trip latency, bytes moved,
  and the terminal's grid. Every connection state is distinguished by shape
  before colour, so it survives greyscale and colour blindness.
- Installers for Linux (`.deb`, `.rpm`, `.AppImage`), Windows (`.msi`, `.exe`)
  and macOS (`.dmg`, `.app`), with a `SHA256SUMS` that is checked against the
  bytes after they leave the build machines.

### Security

- **RSA private keys are refused.** RUSTSEC-2023-0071 is a timing attack on RSA
  private key operations with no fixed version available, and signing is the
  operation it reaches. Verifying an RSA *host* key stays supported, because
  that is a public-key operation and is not what the advisory attacks
  (ADR-0010). An Ed25519 or ECDSA key works.
- **No telemetry, no crash reporting, no update ping.** Nothing leaves the
  machine that was not asked for.
- **Nothing secret is logged**, at any level, including in errors returned to
  the interface.
- Tauri permissions are named one by one rather than taken as plugin default
  sets (ADR-0013).
- **The installers are not signed.** Windows will show SmartScreen and macOS
  will call the application damaged. Both are described, with the commands to
  work around them, in `docs/installing.md`.

### Known limitations

- **No SFTP and no port forwarding.** Both are designed and neither is built.
- **Nobody has installed a release build.** The packages that have been run were
  built on the machines that ran them, which is a different claim.
  `docs/installing.md` keeps the two apart, per platform.
- **macOS is entirely unexercised.** The `.dmg` builds on every run and no
  human has opened it.
- Windows 11 **Snap Layouts** does not offer its flyout from the maximise
  button, because the drawn title bar does not answer `WM_NCHITTEST`. Snapping
  into a zone works by every other route (#28).
- A connection gives up after twenty seconds (ADR-0016). That number is a
  choice, not a measurement, and there is no setting for it yet.

[0.2.1]: https://github.com/marciopaiva/runic-ssh/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/marciopaiva/runic-ssh/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/marciopaiva/runic-ssh/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/marciopaiva/runic-ssh/releases/tag/v0.1.0
