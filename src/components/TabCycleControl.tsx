import type { JSX } from 'react';

import { useTranslator } from '../features/settings';

import { ChevronLeftIcon, ChevronRightIcon } from './ui/icons';

interface TabCycleControlProps {
  readonly onPrevious: () => void;
  readonly onNext: () => void;
}

/**
 * Arrow keys move focus within a group; nothing moved it between groups
 * except the general palette's `tab:next`/`tab:previous`. This is that
 * action's replacement route, a paired control beside `ShapeControl` rather
 * than a new shortcut, since #122 already parks the shortcut-registry
 * question this would otherwise reopen.
 */
export function TabCycleControl({ onPrevious, onNext }: TabCycleControlProps): JSX.Element {
  const i18n = useTranslator();

  return (
    <div className="flex shrink-0 items-center">
      <button
        type="button"
        onClick={onPrevious}
        aria-label={i18n.t('command.tab.previous')}
        title={i18n.t('command.tab.previous')}
        className="text-ink-muted hover:bg-surface-raised/50 hover:text-ink flex h-6 w-6 shrink-0 items-center justify-center rounded"
      >
        <ChevronLeftIcon className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onNext}
        aria-label={i18n.t('command.tab.next')}
        title={i18n.t('command.tab.next')}
        className="text-ink-muted hover:bg-surface-raised/50 hover:text-ink flex h-6 w-6 shrink-0 items-center justify-center rounded"
      >
        <ChevronRightIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
