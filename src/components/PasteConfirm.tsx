import type { JSX } from 'react';

import { pasteLines } from '../features/terminal/clipboard';
import { useTranslator } from '../features/settings';

import { SessionSurface, SurfaceAction } from './SessionSurface';

interface PasteConfirmProps {
  readonly text: string;
  /** How many hosts a confirmed paste reaches. One, unless sync is armed. */
  readonly hosts: number;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** How much of the paste is shown before it is summarised. */
const SHOWN = 8;

/**
 * The question asked before a multi-line paste the remote shell has not
 * bracketed.
 *
 * A shell runs each line of a paste as it arrives, so text carrying a line
 * break executes without anybody pressing Return. Bracketed paste closes this
 * and most shells ask for it, which is why this screen is rare: it appears only
 * where the protection is absent.
 *
 * The weight is carried by the preview rather than by the buttons. Pasting
 * several lines is an ordinary thing to do, and a surface that makes it
 * difficult would teach people to click through the one paste that mattered.
 * What changes a decision is seeing an unexpected line in your own clipboard,
 * so the lines are shown as they will run, in the terminal's own typeface.
 *
 * Unlike `HostKeyPrompt` the primary action is armed from the start, and
 * deliberately: this is a question the user just asked for by pressing a key,
 * not one that arrived on its own.
 *
 * With typing synchronised the screen appears for every paste, one line
 * included. There the danger is not the shell running a line, which bracketed
 * paste already handles: it is the paste reaching four hosts because the wrong
 * pane had focus, and no protocol feature closes that.
 */
export function PasteConfirm({
  text,
  hosts,
  onConfirm,
  onCancel,
}: PasteConfirmProps): JSX.Element {
  const i18n = useTranslator();
  const lines = pasteLines(text);
  const shown = lines.slice(0, SHOWN);
  const hidden = lines.length - shown.length;

  return (
    <SessionSurface
      titleId="paste-confirm-title"
      title={
        lines.length === 1
          ? i18n.t('terminal.paste.line')
          : i18n.t('terminal.paste.title', { count: String(lines.length) })
      }
      icon={
        <svg viewBox="0 0 16 16" width="19" height="19" fill="none" aria-hidden="true">
          <path
            d="M5.5 2.5h5v2h-5z M4 3.5H2.8v10h10.4v-10H12 M5 7.5h6M5 10.5h4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      }
      /* The reason we are asking, which is not always the same reason. Past
         one line the danger is the shell running them as they arrive. At
         exactly one line that cannot be it, because a single line is only ever
         asked about when the paste is going to more than one host — so saying
         it would be describing a risk this paste does not carry, next to a
         banner naming the one it does. */
      body={
        lines.length > 1 ? i18n.t('terminal.paste.body') : i18n.t('terminal.paste.body.one')
      }
      actions={
        <>
          <SurfaceAction onClick={onCancel} variant="secondary">
            {i18n.t('terminal.paste.cancel')}
          </SurfaceAction>
          <SurfaceAction onClick={onConfirm} variant="primary">
            {i18n.t('terminal.paste.confirm')}
          </SurfaceAction>
        </>
      }
    >
      <div className="bg-surface-base border-line-subtle max-h-56 overflow-auto rounded-lg border p-3">
        <ol className="flex flex-col gap-0.5">
          {shown.map((line, at) => (
            <li
              /* Keyed by position: the list is one paste, rebuilt whole, and
                 never reordered. */
              key={at}
              className="text-ink-secondary font-mono text-[12px] leading-relaxed whitespace-pre-wrap"
            >
              {/* A blank line is part of what makes a paste look shorter than
                  it is, so it keeps its row rather than collapsing away. */}
              {line === '' ? ' ' : line}
            </li>
          ))}
        </ol>
      </div>

      {hosts > 1 && (
        /* Above the count of hidden lines, because how many machines this
           reaches outranks how much of it is off screen. */
        <p className="bg-warn-soft text-warn border-warn/40 rounded border px-2.5 py-1.5 text-[12px] font-semibold">
          {i18n.t('terminal.paste.hosts', { count: String(hosts) })}
        </p>
      )}

      {hidden > 0 && (
        <p className="text-ink-faint text-[11.5px]">
          {i18n.t('terminal.paste.more', { count: String(hidden) })}
        </p>
      )}
    </SessionSurface>
  );
}
