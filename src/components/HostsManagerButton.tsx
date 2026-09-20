import type { JSX } from 'react';

import { useTranslator } from '../features/settings';

import { DatabaseIcon } from './ui/icons';

interface HostsManagerButtonProps {
  readonly open: boolean;
  readonly onToggle: () => void;
}

/**
 * The toolbar's own way into the hosts-manager sidebar (ADR-0076), beside
 * `MacrosButton`: same toggle shape, same reason. The command palette's
 * "Manage hosts..." entry and the "+" host book palette still work exactly
 * as before; this is the always-visible way in.
 */
export function HostsManagerButton({ open, onToggle }: HostsManagerButtonProps): JSX.Element {
  const i18n = useTranslator();
  const label = i18n.t(open ? 'toolbar.hosts.hide' : 'toolbar.hosts.show');

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
      <DatabaseIcon className="h-3.5 w-3.5" />
    </button>
  );
}
