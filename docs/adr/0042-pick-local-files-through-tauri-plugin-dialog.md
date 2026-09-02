# ADR-0042: Pick local files through `tauri-plugin-dialog`

* **Status**: Superseded by ADR-0050
* **Date**: 2026-08-31

## Context

ADR-0041 settled which library speaks the SFTP protocol; it left open how the
user names the local half of a transfer. A download needs a destination
folder, an upload needs a source file, and neither is a value this
application already has: `capabilities/default.json` grants no plugin today,
and the webview cannot read the local filesystem to offer its own picker.

Two things constrain the choice:

* `docs/security-model.md` rule 6 and `CLAUDE.md` section 5 both require an
  ADR before widening a capability, and the app has never registered a Tauri
  plugin before this. `tauri::Builder::default()` in `lib.rs` carries no
  `.plugin(...)` call today, so this is also the first one.
* The three options actually differ in what they cost, not only in how they
  look, so this was asked as a real choice rather than assumed.

## Options considered

### Option A: `tauri-plugin-dialog`

The native picker: `save()` for a download's destination, `open()` for an
upload's source, matching what every other desktop application on the
platform already shows.

Resolves at `2.7.2` against `tauri = "2"` with no version conflict. Pulls in
`tauri-plugin-fs` as a compiled dependency for shared types, but that plugin
is never registered with `.plugin(...)`, so none of its own commands reach
the webview: only `open` and `save` are exposed, and only `dialog:allow-open`
and `dialog:allow-save` need to be granted, not `dialog:default` (which would
also carry `allow-message`, a dialog type nothing here uses). `MIT OR
Apache-2.0`, already in `deny.toml`'s allow list.

**Cost**: the first plugin this application has ever taken, one new crate
plus its transitive `tauri-plugin-fs` compiled (unregistered) alongside it,
and two new lines in `capabilities/default.json`. **Forecloses**: nothing;
a future need for more of the filesystem plugin's own surface would be its
own capability decision, unaffected by this one.

### Option B: A fixed local convention, no picker

Downloads land in the OS Downloads folder, resolved on the Rust side through
`tauri::path`, which the webview never touches; uploads are out of scope
until a picker exists.

**Cost**: an upload command with no way to name what to upload is not upload.
**Forecloses**: nothing architecturally, but leaves half of #127's first cut
unbuilt rather than genuinely simpler.

### Option C: `<input type="file">` for upload, the fixed convention for download

The browser's own file input needs no Tauri capability at all; the webview
already reads the chosen file's path without any grant, the same way any web
page can. Downloads stay on Option B's fixed convention.

**Cost**: no native "Save As" for downloads, and an upload picker that looks
and behaves like a web form control inside a desktop application otherwise
styled to not look like one. **Forecloses**: nothing; adding the dialog
plugin later remains exactly Option A.

## Decision

Option A, chosen by the maintainer directly over B and C. A file transfer
tool whose own transfer dialog looks like a web page is a worse result than
the two-line capability cost of the native one, and the two commands needed
are narrow enough that granting them does not compromise ADR-0013's minimal
set in any way its own reasoning would object to: `dialog:allow-open` and
`dialog:allow-save`, nothing else from the plugin.

## Consequences

**Good**: SFTP downloads and uploads name their local half the way every
other file transfer on the platform does. The capability stays narrow:
exactly the two commands used, named individually rather than through the
plugin's `default` set, following the pattern `capabilities/default.json`'s
own description already states for every other permission in it.

**Bad**: the plugin surface, and `tauri-plugin-fs` riding along uncalled, are
now part of what `cargo-deny` and `cargo-audit` watch on this project's
behalf. The first plugin taken is also the one precedent the next plugin
request will be measured against.

**Follow-up**: `capabilities/default.json` gains `dialog:allow-open` and
`dialog:allow-save`; `lib.rs` gains `.plugin(tauri_plugin_dialog::init())`.
Both belong in the same change as the SFTP commands that call them, not
merged in ahead of a caller existing.
