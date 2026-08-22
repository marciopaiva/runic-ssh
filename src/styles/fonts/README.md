# Bundled typefaces

Both faces ship inside the application. Nothing here is fetched at runtime, and
nothing here may become a link to a font host: the CSP in `tauri.conf.json`
admits no external origin, and rule 5 of `docs/security-model.md` rules out a
network call to a host the user did not configure. An SSH client that contacts
a CDN on launch tells that CDN when its user starts work.

| File | Face | Licence |
| --- | --- | --- |
| `manrope-latin.woff2`, `manrope-latin-ext.woff2` | Manrope, variable 200–800 | SIL Open Font License 1.1 — `OFL-Manrope.txt` |
| `jetbrains-mono-latin.woff2`, `jetbrains-mono-latin-ext.woff2` | JetBrains Mono, variable 100–800 | SIL Open Font License 1.1 — `OFL-JetBrainsMono.txt` |

Both are variable fonts, so one file per subset covers every weight the
interface uses rather than one file per weight.

## Why only latin and latin-ext

Those two ranges cover English, Brazilian Portuguese and Spanish completely,
which is what the application ships in. Cyrillic, Greek and Vietnamese subsets
exist upstream and are deliberately not bundled: they would add four more files
that almost no user loads. Text outside the bundled ranges falls back to the
system stack, which is the correct outcome rather than a missing glyph.

Reconsider this when a language outside those ranges is added. Terminal output
is a separate question — a remote host can print anything, and the terminal's
own font handling covers what these subsets do not.

## Replacing or updating them

The files came from the Google Fonts CSS2 API, which serves the same upstream
releases. Fetch the stylesheet for the family with a browser user agent, take
the `latin` and `latin-ext` `src` URLs, and download those. Keep the
`unicode-range` values in `../fonts.css` in step with whatever the API returns:
a stale range makes the browser load a file that cannot render the character it
was loaded for.
