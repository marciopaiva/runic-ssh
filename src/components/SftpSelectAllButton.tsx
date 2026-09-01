import type { JSX } from 'react';

import { useTranslator } from '../features/settings';

import { BroadcastGlyph } from './BroadcastGlyph';

interface SftpSelectAllButtonProps {
  readonly onSelectAll: () => void;
}

/**
 * The SFTP toolbar's own "select every occupied destination" shortcut
 * (ADR-0047), before `SftpSplitControl`.
 *
 * Deliberately not `BroadcastButton` with a different label: that one arms
 * a *mode*, every keystroke reaching every group until disarmed. Sending a
 * file has no equivalent mode, since a send is already a one-shot action
 * per file rather than a continuous broadcast, so this is a plain click
 * that un-spares every destination rather than a switch with an on/off
 * state of its own. Neutral at rest, never warn-tinted, so it never
 * claims a persistent state that does not exist here.
 */
export function SftpSelectAllButton({ onSelectAll }: SftpSelectAllButtonProps): JSX.Element {
  const i18n = useTranslator();
  const label = i18n.t('sftp.selectAllDestinations');

  return (
    <button
      type="button"
      onClick={onSelectAll}
      aria-label={label}
      title={label}
      className="text-ink-muted hover:bg-surface-raised/50 hover:text-ink flex h-6 w-7 shrink-0 items-center justify-center rounded"
    >
      <BroadcastGlyph className="h-3.5 w-3.5" />
    </button>
  );
}
