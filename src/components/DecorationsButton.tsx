import type { JSX } from 'react';

import { useTranslator } from '../features/settings';

import { WindowIcon } from './ui/icons';

interface DecorationsButtonProps {
  readonly native: boolean;
  readonly onToggle: () => void;
}

/**
 * ADR-0005's escape hatch, in the one toolbar row every workspace renders
 * (ADR-0062): whether the title bar comes from us or from the window
 * manager needs to be reachable from wherever the window already is, not
 * from a settings screen it might not be on.
 */
export function DecorationsButton({ native, onToggle }: DecorationsButtonProps): JSX.Element {
  const i18n = useTranslator();
  const label = i18n.t(native ? 'command.window.drawnDecorations' : 'command.window.nativeDecorations');

  return (
    <button
      type="button"
      aria-pressed={!native}
      onClick={onToggle}
      aria-label={label}
      title={label}
      className={`flex h-6 w-7 shrink-0 items-center justify-center rounded ${
        !native ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-surface-raised/50 hover:text-ink'
      }`}
    >
      <WindowIcon className="h-3.5 w-3.5" />
    </button>
  );
}
