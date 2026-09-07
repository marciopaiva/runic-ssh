import type { JSX } from 'react';

import { pasteLines } from '../features/terminal/clipboard';
import { useTranslator } from '../features/settings';

import { MacroGlyph } from './MacroGlyph';
import { SessionSurface, SurfaceAction } from './SessionSurface';

interface MacroConfirmProps {
  readonly name: string;
  readonly text: string;
  /** How many hosts a confirmed run reaches. Always more than one: a single
   * target runs immediately, without asking. See `App.tsx`'s `runMacro`. */
  readonly hosts: number;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** How much of the macro is shown before it is summarised. */
const SHOWN = 8;

/**
 * The question asked before a macro reaches more than one host at once.
 *
 * A single-target run never asks: picking a macro from the palette is
 * already the deliberate act, the same way running any other command there
 * is. What earns a question here is `PasteConfirm`'s own reason with typing
 * synchronised: the risk is not a shell running a line unexpectedly, it is
 * a saved command reaching four hosts because the wrong pane had focus, and
 * no amount of care taken saving the macro closes that.
 */
export function MacroConfirm({
  name,
  text,
  hosts,
  onConfirm,
  onCancel,
}: MacroConfirmProps): JSX.Element {
  const i18n = useTranslator();
  const lines = pasteLines(text);
  const shown = lines.slice(0, SHOWN);
  const hidden = lines.length - shown.length;

  return (
    <SessionSurface
      titleId="macro-confirm-title"
      title={i18n.t('macro.confirm.title', { name })}
      icon={<MacroGlyph className="h-[19px] w-[19px]" />}
      body={i18n.t('macro.confirm.body', { count: String(hosts) })}
      actions={
        <>
          <SurfaceAction onClick={onCancel} variant="secondary">
            {i18n.t('macro.confirm.cancel')}
          </SurfaceAction>
          <SurfaceAction onClick={onConfirm} variant="primary">
            {i18n.t('macro.confirm.confirm')}
          </SurfaceAction>
        </>
      }
    >
      <div className="bg-surface-base border-line-subtle max-h-56 overflow-auto rounded-lg border p-3">
        <ol className="flex flex-col gap-0.5">
          {shown.map((line, at) => (
            <li
              key={at}
              className="text-ink-secondary font-mono text-[12px] leading-relaxed whitespace-pre-wrap"
            >
              {line === '' ? ' ' : line}
            </li>
          ))}
        </ol>
      </div>

      {hidden > 0 && (
        <p className="text-ink-faint text-[11.5px]">
          {i18n.t('terminal.paste.more', { count: String(hidden) })}
        </p>
      )}
    </SessionSurface>
  );
}
