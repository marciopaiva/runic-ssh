/**
 * A macro's own placeholders, resolved against the session it runs in.
 *
 * Pure and testable without a session or a window: what a macro's text
 * looks like once `$host`/`$port`/`$username` are filled in.
 */

/** The three fields a macro can reference. Whatever `Session` already is. */
export interface MacroVariables {
  readonly host: string;
  readonly port: number;
  readonly user: string;
}

/**
 * Three names rather than one, because "the same info as the address bar"
 * is three different things a saved command wants: the plain hostname, the
 * port (rarely 22 once bastions and containers are involved), and the
 * account it connects as.
 *
 * `$host`/`$port`/`$username` rather than brace-wrapped placeholders: this
 * catalogue's own interpolation syntax is `{word}` (`translator.ts`'s
 * `PLACEHOLDER` regex), so a hint string that showed a braced form would
 * itself need `host`/`port`/`username` arguments just to render. An
 * unresolved placeholder is left exactly as written rather than emptied
 * out: a typo in `$hostt` reads as a typo in the terminal, which is
 * recoverable, rather than vanishing into a blank nobody can trace back to
 * it.
 */
export function applyVariables(text: string, session: MacroVariables): string {
  return text
    .replace(/\$host\b/g, session.host)
    .replace(/\$port\b/g, String(session.port))
    .replace(/\$username\b/g, session.user);
}

/**
 * A trailing newline, added only if the text does not already end in one.
 *
 * `Macro.text` is sent as saved, and a macro whose last line has no
 * newline is a line typed but never submitted: the shell sits there
 * holding it, waiting for an Enter that never comes. Nobody saving a
 * macro means that, so a run always ensures one, regardless of what was
 * actually stored.
 */
export function ensureTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`;
}
