/**
 * A `script` macro's own execution model (ADR-0070).
 *
 * A `sequential` macro's text goes straight into the open shell. A
 * `script` macro's text is wrapped in a heredoc piped into a fresh
 * interpreter instead, so it runs isolated from the session it started
 * in: a `cd` or an export inside it does not outlive the macro, and
 * `$host`/`$port`/`$username` are that interpreter's own variables rather
 * than text substituted ahead of time the way `applyVariables` already
 * does for `sequential`.
 *
 * Pure, for the reason `variables.ts` already is: what goes wrong here is
 * a byte reaching a shell it should not have, and nothing shows it until
 * it has.
 */

import { ensureTrailingNewline } from './variables';
import type { MacroVariables } from './variables';

/** Single-quotes a shell value: closes the quote, escapes the one
    apostrophe single quoting cannot hold, reopens it. Safe for any byte a
    hostname or username could plausibly contain. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * The interpreter a script macro runs under.
 *
 * Named by a leading `#!` line, the same way a real script would name one,
 * except this text is piped into an already-running shell rather than
 * executed as a file, so the line itself never does anything: it is read
 * here only to decide what reads the rest. `#!/usr/bin/env bash` names
 * `bash`, the same as `#!/bin/bash` would; anything unrecognized, or no
 * `#!` line at all, falls back to `sh`.
 */
function scriptInterpreter(text: string): string {
  const first = (text.split(/\r?\n/, 1)[0] ?? '').trim();
  const match = /^#!\s*(.+)$/.exec(first);
  if (match === null) return 'sh';

  const words = (match[1] ?? '').trim().split(/\s+/);
  const named = (word: string | undefined): string | null => {
    const command = word?.split('/').pop();
    return command !== undefined && command !== '' ? command : null;
  };

  const command = named(words[0]);
  if (command === null) return 'sh';
  if (command !== 'env') return command;

  return named(words[1]) ?? 'sh';
}

/** A heredoc delimiter a script's own text is astronomically unlikely to
    contain on its own line: a fixed prefix plus a run-specific random
    suffix, so two macros run back to back never share one either. */
function heredocMarker(): string {
  const suffix = Math.random().toString(36).slice(2, 10);
  return `RUNIC_MACRO_${suffix}_EOF`;
}

/**
 * Wraps a script macro's text for the interactive shell it is about to
 * run in.
 *
 * The exports live inside the heredoc, not ahead of it: run in the outer
 * shell, `export host=…` would set it in the session the macro is
 * supposedly isolated from. Read by the interpreter the heredoc opens
 * instead, they, and anything the script itself exports or `cd`s into,
 * go away with that interpreter once the marker closes it.
 *
 * The marker is single-quoted (`<<'MARKER'`), which is what stops the
 * outer shell from expanding `$host` itself before the interpreter this
 * is piped into ever sees it.
 */
export function wrapScript(text: string, session: MacroVariables): string {
  const marker = heredocMarker();
  const interpreter = scriptInterpreter(text);
  const exports = [
    `export host=${shellQuote(session.host)}`,
    `export port=${shellQuote(String(session.port))}`,
    `export username=${shellQuote(session.user)}`,
  ].join('\n');

  return `${interpreter} <<'${marker}'\n${exports}\n${ensureTrailingNewline(text)}${marker}\n`;
}
