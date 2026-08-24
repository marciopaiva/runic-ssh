import type { JSX } from 'react';

import { useTranslator } from '../features/settings';
import { paletteKeys } from '../features/status';
import type { CommandModifier } from '../ipc';

interface EmptyPanelProps {
  readonly modifier: CommandModifier;
  /**
   * Which nothing this is.
   *
   * `panel` is a window with no session at all. `pane` is one slot of a split
   * with sessions running in the others, where saying "no session open" would
   * be plainly false and the way forward is a different one: the tabs are
   * already there, and picking one fills the empty pane first.
   */
  readonly variant?: 'panel' | 'pane';
}

/**
 * The main area with nothing open in it.
 *
 * A blank panel and a blank status bar is indistinguishable from a window that
 * failed to paint, which is the first thing a new user meets. This says which
 * of the two it is, and names the two ways forward.
 */
export function EmptyPanel({ modifier, variant = 'panel' }: EmptyPanelProps): JSX.Element {
  const i18n = useTranslator();
  /* The same helper the status bar uses, so the shortcut is never spelled two
     ways in one window — and so a Mac reads ⌘ in both places. */
  const keys = paletteKeys(modifier).join(' ');

  return (
    <div className="flex h-full flex-col items-center justify-center gap-[18px] p-8">
      <svg viewBox="0 0 24 24" className="h-[46px] w-[46px] opacity-50" fill="none" aria-hidden="true">
        <circle cx="9.5" cy="12" r="7" className="stroke-brand-start" strokeWidth="1.2" />
        <circle cx="14.5" cy="12" r="7" className="stroke-brand-end" strokeWidth="1.2" />
        <path
          d="M12 6.5v11M12 10l3-2.5M12 14l3 2.5M12 12l-2.6-2.2"
          className="stroke-brand-rune"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>

      <div className="flex flex-col items-center gap-[7px]">
        <span className="text-ink-secondary text-[14px] font-semibold">
          {i18n.t(variant === 'pane' ? 'empty.pane.title' : 'empty.title')}
        </span>
        <span className="text-ink-faint text-[12.5px]">
          {variant === 'pane' ? i18n.t('empty.pane.hint') : i18n.t('empty.hint', { keys })}
        </span>
      </div>
    </div>
  );
}
