# ADR-0070: Split macros into sequential and script types

* **Status**: Proposed
* **Date**: 2026-09-13

## Context

A macro today is `{ id, name, text }` (`src/ipc/macros.ts`). Running one
applies `$host`/`$port`/`$username` as literal text substitution
(`applyVariables`), turns `\n` into `\r` (`preparePaste`), and writes the
whole result in one `sendInput` call into whatever pty the target session
already has open. Nothing about this is aware of commands, exit codes, or
where one line ends and the next begins beyond the bytes themselves.

A headless test run against this exact code (`sleep 3` followed by
`echo AFTER-SLEEP-DONE`, saved as one macro) showed that an ordinary
foreground command already blocks the next line from running: the second
line did not even appear on screen until the `sleep` finished. Ordinary pty
line discipline already serializes commands sent this way, as long as each
line ends in a newline. What the current model does not give is real:
a macro whose last line has no trailing newline never runs it at all
(typed, never submitted); nothing stops a macro's `cd` or exported
variable from leaking into the interactive session after the macro
finishes, since it is just typed into the live shell; and
`$host`/`$port`/`$username` are dumb text replacement rather than
variables a script's own logic (a conditional, a loop) could depend on
safely.

The maintainer asked for two kinds of macro: one that keeps today's
behavior, and one that runs like a `.sh` script, with real variables and a
result the next line can depend on. Editing a macro's text also currently
happens inline in the 300px docked sidebar panel (`MacrosSidebar.tsx`),
which the maintainer called too cramped for anything script-shaped, and
asked for a popup with a bigger, line-numbered editor.

`@headlessui/react` is already an approved dependency (ADR-0063) and backs
`src/components/ui/Dialog.tsx`, a generic modal already used once
(`MapStage.tsx`'s `AlertDialog`). A bigger popup needs nothing new for the
modal shell itself. Nothing in the tree today gives a text field line
numbers or syntax highlighting.

## Options considered

### Option A: Fix the trailing newline gap, nothing else

Trim a macro's text and always send it with exactly one trailing newline,
regardless of what is stored. No data model change, no dependency, no new
UI.

**Cost**: the smallest possible change.
**Forecloses**: does not give the maintainer variable manipulation,
isolation, or a bigger editor. The actual request stays unmet.

### Option B: Two macro types, script isolated via a heredoc, plain textarea popup

Add `kind: 'sequential' | 'script'` to `Macro`/`MacroDraft` (additive;
absent on an old saved macro reads as `sequential`, so nothing on disk
needs a migration). `sequential` keeps today's behavior, plus the
trailing newline fix. `script` wraps the macro's text in a heredoc,
`sh <<'RUNIC_MACRO_<random>_EOF'` through a matching closing marker, or
the interpreter named by a leading `#!` line in the text, defaulting to
`sh`, sent as one write into the same already-open interactive terminal,
with `$host`/`$port`/`$username` exported as real shell variables ahead
of the heredoc rather than substituted into the text. The editor moves to
a popup (`Dialog`, size `xl`) with a hand-rolled, scroll-synced
line-number gutter beside a plain `<textarea>`.

**Cost**: moderate frontend work (popup, heredoc construction and
escaping, the new field on both ends of the IPC boundary), no new
dependency.
**Forecloses**: no syntax highlighting. The editing surface stays a plain
textarea with numbers painted beside it, which is the part the maintainer
said felt thin for something meant to read like a script.

### Option C: Same as B, editor built on CodeMirror 6

Same data model and execution model as Option B. The popup's editor
becomes a CodeMirror 6 `EditorView`, hand-composed from `@codemirror/state`,
`@codemirror/view` (for `lineNumbers()`), `@codemirror/commands` (a basic
keymap), and `@codemirror/legacy-modes`'s `shell` stream language wrapped
in `StreamLanguage.define` for highlighting, not the batteries-included
`codemirror` convenience package, which also pulls in search, code
folding, and autocomplete that a macro's text has no use for.

**Cost**: a new dependency (several `@codemirror/*` packages) and the
review burden that comes with one; on the order of 60 to 100kb gzipped
added to the frontend bundle for the editor itself; a wrapper component
around `EditorView` that the frontend gate now has to cover, at minimum a
test that it mounts, shows line numbers, and reports edits back through
the same shape the plain textarea used.
**Forecloses**: nothing Option B did not already forgo. CodeMirror's own
extension model leaves room to add more (autocomplete, lint) later
without a second migration if that is ever wanted.

## Decision

Option C, at the maintainer's explicit call: CodeMirror is richer for the
user. Real line numbers and shell syntax highlighting for a `script`
macro's own editor, accepting a new dependency and the bundle weight it
brings, over staying dependency-free with a plainer gutter.

## Consequences

**Good**: `script` macros get real editing ergonomics matching what was
asked for. `sequential` macros behave exactly as today, plus the newline
fix, so every macro saved before this change keeps working with no
migration. The heredoc execution model needs no new IPC command and no
backend change beyond the additive `kind` field. A script macro is still
"type this into the terminal that is already open," the same trust
boundary macros have always run inside.

**Bad**: CodeMirror is a real new dependency, several packages deep, in a
project whose whole pitch is being small and auditable. Every future
`package.json` review now carries it. The heredoc's own delimiter
(`RUNIC_MACRO_<random>_EOF`) can in principle collide with text a script
legitimately contains; a per-run random suffix makes this astronomically
unlikely rather than impossible. A `script` macro's text is no longer
sent exactly as saved, the way `src/ipc/macros.ts`'s own doc comment
currently promises for every macro. It is wrapped in a heredoc header and
preceded by variable exports, so its observable behavior differs from
pasting the same text as `sequential`. That doc comment needs updating to
say so. A `script` macro that backgrounds a process with `&`, expecting
it to outlive the macro, will not: the heredoc's subshell exiting is what
hands control back to the interactive shell, and a backgrounded child
does not survive that.

**Follow-up**: the shebang detection rule (a leading `#!/usr/bin/env bash`
picks the interpreter; anything unrecognized falls back to `sh` rather
than failing the macro) needs a small parser and a code comment
explaining the fallback, not a second ADR. Revisit the CodeMirror choice
if its bundle cost is ever shown to matter for cold start time on a
low-end machine. Nothing has measured that yet.
