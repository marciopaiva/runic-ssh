# Design canvas

Source files for the interface design canvas. Each `*.dc.html` is one artboard;
`canvas.json` lays them out across three pages, `System`, `Surfaces` and
`Variants`.

`runic-ssh-interface.html` is the published canvas. It is generated, roughly
2 MB, and deliberately not committed. Rebuild it from these sources rather than
editing it.

## The artboards are generated

`gen.py` builds every surface from one skeleton. The top strip, the rail, the
sidebar, a group and the status bar are functions, so the anatomy is written
once and thirteen screens inherit it. Two artboards cannot drift apart by hand,
which is the failure the old canvas had: a pane header drawn in one file and a
tab strip drawn in another, both naming a session, neither aware of the other.

```sh
python3 gen.py            # every artboard, dark, English
python3 gen.py --light    # MainLight, the same code with the token values swapped
node gen-locales.mjs      # MainPtBr and MainEs from Main
```

`gen.py --light` is the proof of the claim `tokens.css` makes. Light is the
same token names with different values, so the light artboard is the same code
with `T` swapped. If light ever needed a different layout, that claim would be
false and this command would be impossible.

`gen-locales.mjs` substitutes catalogue strings and **fails hard** when a
replacement does not match exactly once. Zero matches means the artboard changed
and the file did not; two means one string is doing two jobs.

Copy comes from `src/locales/`. A string in an artboard that is not in the
catalogue is the drawing inventing interface, which is the thing rule 6 of
ADR-0020 exists to stop.

## Pages

| Page | What is on it |
| --- | --- |
| `System` | The anatomy and its seven rules, and the token, type, density and marker sheet |
| `Surfaces` | Twenty-two screens |
| `Variants` | Light, and the same window in pt-BR and neutral es |

## Files

| File | Artboard |
| --- | --- |
| `Anatomy.dc.html` | Window regions, a group in detail, the seven rules, what ADR-0020 amends |
| `Tokens.dc.html` | Surfaces, accent and state, type, density, connection markers |
| `Empty.dc.html` | Nothing open yet |
| `Main.dc.html` | One group, three sessions |
| `Collapsed.dc.html` | The sidebar closed |
| `Groups.dc.html` | Four groups, six sessions |
| `Broadcast.dc.html` | Typing into two of three groups |
| `HostKey.dc.html` | Unknown host key, inside the group that asked |
| `HostKeyChanged.dc.html` | Changed host key, blocked |
| `Failure.dc.html` | A host that did not answer |
| `Sftp.dc.html` | SFTP as a tab beside the terminals |
| `PasteConfirm.dc.html` | A paste going to three hosts at once |
| `Palette.dc.html` | The command palette |
| `HomeHosts.dc.html` | Home, the host book: General, Topology, Access and Forwarding on one screen (ADR-0052, ADR-0056, ADR-0054) |
| `HomeHostsEmpty.dc.html` | Home, nothing picked yet, with the same brand mark Sessions' own empty state carries |
| `HomeCollapsed.dc.html` | Home, its own host list hidden, the rail's Home icon toggling it the same way Sessions' and SFTP's already do |
| `HomeDeleteConfirm.dc.html` | Home, the one question Delete now always asks first |
| `TerminalMotd.dc.html` | The brand banner, printed into the terminal on connect (ADR-0051) |
| `SftpWorkspace.dc.html` | SFTP's own workspace, nothing picked yet (ADR-0044) |
| `SftpFanout.dc.html` | One source, a grid of up to four destinations (ADR-0045) |
| `SftpFileOps.dc.html` | Creating, renaming and deleting a file or folder in place (ADR-0048) |
| `SftpFolderCopy.dc.html` | Copying a folder: one still in progress, one finished with failures (ADR-0049) |
| `SftpDeleteConfirm.dc.html` | The one question a delete always asks first, scoped to the pane that asked (ADR-0050) |
| `SftpSelection.dc.html` | Click selects, double-click opens, every pane picks rename and delete (ADR-0050) |
| `Main{Light,PtBr,Es}.dc.html` | The same window, generated |

Every screen a user can meet is drawn here. That is the point of the set rather
than a boast. The surfaces that were never drawn, the failure and the revoked
key and the credential window and the host form, are exactly the ones that
drifted into five different shapes before ADR-0015 pulled them back together.
The credential window itself is gone since ADR-0039, and its artboard went
with it rather than staying as a drawing of a screen nobody can open.
`Settings.dc.html` went the same way (#236): ADR-0029 folded it into a card on
Home's own dashboard, drawn at the time in `HomeDashboard.dc.html`, so the
artboard was retired rather than redrawn against a premise, a rail gear
opening a tab, that no longer exists. `NewSession.dc.html` went the same way
again (#233): its pre-wizard, pre-Home-split premise, a single form saved
with no credential asked for, was gone once ADR-0030 through ADR-0034 landed,
and `HostsHost.dc.html`/`HostsAccess.dc.html` already drew the two-step
wizard that replaced it. `HomeDashboard.dc.html` itself went the same way
once more (ADR-0052): the dashboard-and-cards premise it drew is gone, Home
is one screen now, and `HomeHosts.dc.html` is that screen. `HostsHost.dc.html`
and `HostsAccess.dc.html` followed them (ADR-0056): the two-step premise they
drew is gone too, General/Topology/Access render together now, and
`HomeHosts.dc.html` draws that shape directly rather than splitting it
across two retired artboards.

Screens that live inside the main window are drawn **inside it**, and now
inside the group that owns them. The host key artboards used to be standalone
cards at 940x640, which is why the components built from them arrived with the
card right and the surface around it wrong. They are drawn in place here.

`HostsHost.dc.html` and `HostsAccess.dc.html` were exploratory from
2026-08-30 until the same day: drawn against the maintainer's own complaint
that the wizard's Access step "não mostra onde você está" once it hands off
to its automatic phase, they redrew the real current shape (`HostFields`,
the missing-credential notice, ADR-0039) while a third artboard,
`HostsPhase.dc.html`, proposed the actual breadcrumb fix, a third,
unclickable item naming which sub-phase Access had handed off to. That
proposal was accepted and shipped the same day (`wizard_breadcrumb` in
`gen.py`, computed for real by `SessionWizard.tsx`), `HostsPhase.dc.html`
retired rather than keep drawing a screen the app now draws itself, and the
remaining two joined the set above, closing #233 along with
`NewSession.dc.html`'s retirement. Both retired in turn (ADR-0056,
2026-09-03) once the wizard's own Host/Access breadcrumb, the shape they
existed to draw, went with it: `wizard_breadcrumb` is gone from `gen.py`
along with `wizard_panel`, and `HomeHosts.dc.html` draws General, Topology
and Access as one screen instead.

## What is drawn here and not built

The canvas is the record of the anatomy, not a checklist of the tree. Nothing
here currently draws a feature with no code behind it, but the list stays,
so a gap like this gets written down the day it is found rather than the day
somebody trips over it.

**SFTP was this list's entry from ADR-0020 until #250.** `Sftp.dc.html` and
the rail's second icon drew a slot with nothing behind it, deliberately: rule
6 of ADR-0020 refuses an icon that switches to nothing, and the slot was
meant to arrive with the feature. #250 built the dual-pane browser the slot
promised; ADR-0044 through ADR-0049 then gave it its own workspace,
drag-and-drop, fan-out to several destinations, create/rename/delete, and a
recursive folder copy, each drawn (`SftpWorkspace.dc.html`,
`SftpFanout.dc.html`, `SftpFileOps.dc.html`, `SftpFolderCopy.dc.html`) before
it was built. This is the direction this section exists for: the drawing
ahead of the tree, not behind it.

This list had a third entry for a while without anybody writing it down, which
is the failure the list exists to prevent. Nine artboards drew `SYNC OFF` in the
status bar and nothing built it: the way off lived there and the way on lived
only in the command palette, so a person driving with a pointer could not arm
the switch at all. It is built now. What the canvas draws and the tree lacks
belongs here on the day it is noticed, not on the day somebody trips over it.

The theme control went the same way. `Settings.dc.html` has drawn three
segmented buttons since ADR-0020, `tokens.css` has defined a light palette since
the tokens existed, and nothing in the tree ever wrote `data-theme`, so the only
way to see light was to change your operating system. Nobody wrote it here
either. That is twice this list has been found short after the fact rather than
kept, which is worth more than the two entries it was missing: a drawing with no
code behind it is not noticed by reading the drawing. #149 built it.

That list used to have a second entry, the split control on a group's strip.
It is gone from both sides now: ADR-0021 decided splitting belongs to the top
strip, because it changes the whole main area and a button on one group's strip
reads as splitting that rectangle. The generator draws it there, the strip
draws two trailing controls rather than three, and #152 built it.

## What is not here yet

* Locale variants of the host key screens. The old canvas had them, and that is
  where its one real layout break was found, so they are worth rebuilding
  rather than quietly dropped.
* The revoked and certificate-required refusals. They differ from the changed
  key by a title and a sentence, and by having no override at all.
* Connecting as its own artboard. It appears inside `Groups.dc.html`, which is
  enough to see it and not enough to design it.
