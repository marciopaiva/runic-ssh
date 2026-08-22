# Design canvas

Source files for the interface design canvas. Each `*.dc.html` is one artboard;
`canvas.json` lays them out and splits them across the two pages, `Interface`
and `Idiomas`.

`runic-ssh-interface.html` is the published canvas. It is generated, roughly
2 MB, and deliberately not committed — rebuild it from these sources rather than
editing it.

## Files

| File | Artboard |
| --- | --- |
| `Main.dc.html` | Main window, dark |
| `MainLight.dc.html` | Main window, light |
| `Sftp.dc.html` | SFTP dual pane |
| `Palette.dc.html` | Command palette |
| `Appearance.dc.html` | Settings, appearance and the token table |
| `Sidebar.dc.html` | Sessions sidebar in detail |
| `HostKey.dc.html` | Unknown host key prompt |
| `HostKeyChanged.dc.html` | Changed host key, blocked |
| `*PtBr.dc.html`, `*Es.dc.html` | The same screens with the catalog swapped |

## Regenerating the derived artboards

The light theme and the translated screens are derived, never hand-edited. Edit
the English dark original, then re-run the generator:

```bash
node tolight.mjs Main.dc.html MainLight.dc.html   # dark tokens -> light tokens
node gen-locales.mjs                              # en -> pt-BR and es
```

Both scripts fail loudly if a string they expect to replace is missing or
matches more than once, so a rename in the source surfaces as an error rather
than as a silently untranslated screen.

## Colors

The palette is sampled from `assets/logo.png`, not invented: navy `#15273b`,
accent gradient from cyan `#1ea7e2` to violet `#b961e6`. Resolved token values
for both themes are on the Appearance artboard.
