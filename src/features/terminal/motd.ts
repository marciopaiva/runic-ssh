/**
 * The brand banner printed into a terminal the moment it opens (ADR-0051).
 *
 * A pure function of already-typed values, so what it prints can be asserted
 * without a live `xterm.js`. `use-terminal.ts` writes the result between
 * `terminal.open` and `watchTerminal`, which is what keeps it from ever
 * racing a host's own real `/etc/motd` arriving over the same channel.
 */

import type { Translator } from '../../lib/i18n';
import type { Session } from '../../ipc';
import { bastionName } from '../sessions/jump';

/**
 * The maintainer's own conversion of the brand mark through asciiart.eu's
 * image-to-ascii tool, `≈` for the shaded body of the two overlapping
 * circles and `∞`/`≠` for the brighter points where the tool's own
 * conversion marks the rune crossing them. Kept verbatim, byte for byte,
 * with `design/canvas/gen.py`'s `MOTD_ART`: the shading technique has no
 * equivalent in path data, so a future resize starts from the same source
 * image and tool rather than a second, independent conversion.
 */
const ART: readonly string[] = [
  '              ≈≈≈≈≈≈≈≈≈≈≈≈   ≈≈≈≈≈≈≈≈≈≈≈≈',
  '           ≈≈≈≈≈        ≈≈≈≈≈≈≈  ≈≈≈   ≠≈≈≈≈',
  '         ≈≈≈≈           ≈≈≈≈≈≈≈≈≈≈  ≈≈≈   ≈≈≈≈',
  '        ≈≈≈           ≈≈≈≈   ≈≈≈≈ ≈≈≈≈      ≈≈≈',
  '       ≈≈≈          ≈≈≈≈≈  ≈≈≈≈≈≈≈≈≈         ≈≈≈',
  '       ≈≈≈        ≈≈≈≈≈≈≈≈≈≈≈≈ ≈≈ ≈≈≈≈        ≈≈≈',
  '       ≈≈       ≈≈≈≈  ≈≈≈≈≈ ≈≈∞≈≈  ≈≈≈≈       ≈≈≈',
  '       ≈≈≈        ≈≈≈≈≈≈≈≈≈≈≈≈ ≈≈ ≈≈≈≈        ≈≈≈',
  '       ≈≈≈         ≈≈≈≈≈≈≈ ≈≈≈≈≈≈≈≈≈         ≈≠≠',
  '        ≈≈≈       ≈≈≈≈≈≈≈≈   ≈≈≈≈≈          ≈≈≈',
  '         ≠≈≈≈    ≈≈≈ ≈≈≈≈≈≈≈≈≈≈           ≈≈≈≈',
  '           ≈≈≈≈≈   ≈≈≈≈  ≈≈≈≈∞≈         ≈≈≠≈',
  '              ≈≈≈≈≈≈≈≈≈≈≈≈    ≈≈≈≈≈≈≈≈≈≠≠',
];

const ART_WIDTH = Math.max(...ART.map((line) => line.length));
/** Columns of breathing room between the art and the field column, side by
    side. Matches `design/canvas/gen.py`'s `motd_row`. */
const GAP = 2;

/* Plain SGR codes into the terminal's own existing ANSI palette slots
   (`terminalTheme()`), not truecolor: xterm.js re-renders already-printed
   text in a new palette the instant the theme changes, which a truecolor
   escape would not. Blue is `--rs-accent`, cyan is `--rs-accent-bright`,
   magenta is `--rs-brand-end`; the left ring and right ring of the mark
   split blue/magenta the same way `motd_art_lines_html()` splits
   `bstart`/`bend`, and a crossing point (`∞`/`≠`) takes cyan, the
   brightest of the three, as the highlight `brune` reads on the canvas
   itself. Bright black is `--rs-text-faint`, for a label dim enough not to
   compete with its own value. */
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';
const FAINT = '\x1b[90m';

function colorArtLine(line: string): string {
  const center = ART_WIDTH / 2;
  let colored = '';
  let current: string | null = null;
  let index = 0;

  for (const ch of line) {
    const color = ch === '∞' || ch === '≠' ? CYAN : index < center ? BLUE : MAGENTA;
    if (color !== current) {
      colored += color;
      current = color;
    }
    colored += ch;
    index += 1;
  }

  return `${colored}${RESET}`;
}

interface Fields {
  readonly host: string;
  readonly address: string;
  readonly via: string | null;
  readonly user: string;
}

function fieldsOf(session: Session, sessions: readonly Session[]): Fields {
  const port = session.port === 22 ? '' : `:${String(session.port)}`;
  return {
    host: session.name,
    address: `${session.host}${port}`,
    via: bastionName(session, sessions),
    user: session.user,
  };
}

interface InfoRow {
  /** Undecorated text, for measuring how wide the field column actually is. */
  readonly raw: string;
  readonly colored: string;
}

function infoRows(fields: Fields, i18n: Translator): readonly InfoRow[] {
  const title = i18n.t('app.name');

  const named: ReadonlyArray<readonly [string, string]> = [
    [i18n.t('terminal.motd.host'), fields.host],
    [i18n.t('terminal.motd.address'), fields.address],
    ...(fields.via === null ? [] : [[i18n.t('terminal.motd.via'), fields.via] as const]),
    [i18n.t('terminal.motd.user'), fields.user],
  ];
  const labelWidth = Math.max(...named.map(([label]) => label.length)) + 2;

  return [
    { raw: title, colored: `${BOLD}${title}${RESET}` },
    { raw: '', colored: '' },
    ...named.map(([label, value]) => {
      const paddedLabel = label.padEnd(labelWidth);
      return { raw: `${paddedLabel}${value}`, colored: `${FAINT}${paddedLabel}${RESET}${value}` };
    }),
  ];
}

/**
 * The banner text to write into a freshly opened terminal, `\r\n`-terminated
 * per row the way a raw write into `xterm.js` needs (see `flood.ts`).
 *
 * Side by side (ADR-0051, Option B) once `columns` is wide enough for the art
 * and the widest field row together; stacked, art first, below that. A
 * terminal narrower than the stacked art itself (49 columns) still overflows,
 * a named and accepted limit rather than one guarded here.
 */
export function motdBanner(
  session: Session,
  sessions: readonly Session[],
  columns: number,
  i18n: Translator,
): string {
  const info = infoRows(fieldsOf(session, sessions), i18n);
  const fieldWidth = Math.max(0, ...info.map((row) => row.raw.length));
  const sideBySideWidth = ART_WIDTH + GAP + fieldWidth;

  const lines =
    columns >= sideBySideWidth
      ? ART.map((artLine, index) => {
          const pad = ' '.repeat(Math.max(0, ART_WIDTH + GAP - artLine.length));
          return `${colorArtLine(artLine)}${pad}${info[index]?.colored ?? ''}`;
        })
      : [...ART.map(colorArtLine), '', ...info.map((row) => row.colored)];

  return `${lines.join('\r\n')}\r\n\r\n`;
}
