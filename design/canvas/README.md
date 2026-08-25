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
| `Surfaces` | Thirteen screens plus the credential window |
| `Variants` | Light, and the same window in pt-BR and neutral es |

## Files

| File | Artboard |
| --- | --- |
| `Anatomy.dc.html` | Window regions, a group in detail, the seven rules, what ADR-0020 amends |
| `Tokens.dc.html` | Surfaces, accent and state, type, density, connection markers |
| `Empty.dc.html` | Nothing open yet |
| `NewSession.dc.html` | The sidebar `+`, and the host form it opens as a tab |
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
| `Settings.dc.html` | What the gear opens |
| `Credential.dc.html` | The credential window, which is a window of its own |
| `Main{Light,PtBr,Es}.dc.html` | The same window, generated |

Every screen a user can meet is drawn here. That is the point of the set rather
than a boast. The surfaces that were never drawn, the failure and the revoked
key and the credential window and the host form, are exactly the ones that
drifted into five different shapes before ADR-0015 pulled them back together.

Screens that live inside the main window are drawn **inside it**, and now
inside the group that owns them. The host key artboards used to be standalone
cards at 940x640, which is why the components built from them arrived with the
card right and the surface around it wrong. They are drawn in place here.

## What is not here yet

* Locale variants of the host key screens. The old canvas had them, and that is
  where its one real layout break was found, so they are worth rebuilding
  rather than quietly dropped.
* The revoked and certificate-required refusals. They differ from the changed
  key by a title and a sentence, and by having no override at all.
* Connecting as its own artboard. It appears inside `Groups.dc.html`, which is
  enough to see it and not enough to design it.
