import type { JSX } from 'react';

import { useTranslator } from '../features/settings';

import { PlusIcon } from './ui/icons';

interface OpenHostButtonProps {
  readonly onClick: () => void;
}

/**
 * Beside `WorkspacePills` (ADR-0072): opens the saved host book into
 * whichever of the two workspaces the pills are showing. The rail slots this
 * replaces (Sessions, SFTP) each had their own sidebar to click a host in;
 * folding them into one switch left nothing standing in front of the book
 * itself, which is what this button and the palette it opens are for.
 */
export function OpenHostButton({ onClick }: OpenHostButtonProps): JSX.Element {
  const i18n = useTranslator();
  const label = i18n.t('toolbar.host.open');

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="text-ink-muted hover:bg-surface-raised/50 hover:text-ink flex h-6 w-6 shrink-0 items-center justify-center rounded"
    >
      <PlusIcon className="h-3.5 w-3.5" />
    </button>
  );
}
