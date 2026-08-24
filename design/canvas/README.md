# Design canvas

Source files for the interface design canvas. Each `*.dc.html` is one artboard;
`canvas.json` lays them out and splits them across the two pages, `Interface`
and `Idiomas`.

`runic-ssh-interface.html` is the published canvas. It is generated, roughly
2 MB, and deliberately not committed. Rebuild it from these sources rather than
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
| `HostKeyRefused.dc.html` | Revoked host key, no override |
| `Failure.dc.html` | Connection failure, in the session panel |
| `Split.dc.html` | Two panes, with typing going to both |
| `States.dc.html` | Connecting, and nothing open |
| `SettingsSessions.dc.html` | Settings, sessions and the host form |
| `Credential.dc.html` | Credential window, password and private key |
| `Markers.dc.html` | The five connection state markers |
| `*PtBr.dc.html`, `*Es.dc.html` | The same screens with the catalog swapped |

Every screen a user can meet is drawn here. That is the point of the set rather
than a boast. The surfaces that were never drawn, the failure and the revoked
key and the credential window and the host form, are exactly the ones that
drifted into
five different shapes before ADR-0015 pulled them back together.

Screens that live inside the main window are drawn **inside it**, not as loose
cards. The two host key artboards predate that rule and are still standalone at
940x640, which is why the components built from them arrived with the card right
and no placement at all.

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
