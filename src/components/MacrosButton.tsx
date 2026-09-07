import type { JSX } from 'react';

import { useTranslator } from '../features/settings';

import { MacroGlyph } from './MacroGlyph';

interface MacrosButtonProps {
  readonly open: boolean;
  readonly onToggle: () => void;
}

/**
 * The toolbar's own way into the macros sidebar, beside `BroadcastButton`
 * (ADR-0046's shared row for a workspace's own controls).
 *
 * The command palette's "Snippets" section and its own "Manage macros"
 * entry still work exactly as before; this is a second, always-visible way
 * in, added after the palette-only shape turned out not to read as a real
 * feature once it actually shipped.
 */
export function MacrosButton({ open, onToggle }: MacrosButtonProps): JSX.Element {
  const i18n = useTranslator();
  const label = i18n.t(open ? 'toolbar.macros.hide' : 'toolbar.macros.show');

  return (
    <button
      type="button"
      aria-pressed={open}
      onClick={onToggle}
      aria-label={label}
      title={label}
      className={`flex h-6 w-7 shrink-0 items-center justify-center rounded ${
        open ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-surface-raised/50 hover:text-ink'
      }`}
    >
      <MacroGlyph className="h-3.5 w-3.5" />
    </button>
  );
}
