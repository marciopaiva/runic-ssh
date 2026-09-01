import type { JSX } from 'react';

import { useTranslator } from '../features/settings';

import { BroadcastGlyph } from './BroadcastGlyph';

interface SftpSelectAllButtonProps {
  /** How many occupied destinations are currently spared, i.e. how many
   * this button would include again. `select_all_button()`'s own badge in
   * the canvas: absent once nothing is spared. */
  readonly sparedCount: number;
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
 * claims a persistent state that does not exist here; the badge follows
 * the same rule, a neutral pill rather than `BroadcastButton`'s warn one.
 */
export function SftpSelectAllButton({ sparedCount, onSelectAll }: SftpSelectAllButtonProps): JSX.Element {
  const i18n = useTranslator();
  const label = i18n.t('sftp.selectAllDestinations');

  return (
    <button
      type="button"
      onClick={onSelectAll}
      aria-label={label}
      title={label}
      className="text-ink-muted hover:bg-surface-raised/50 hover:text-ink relative flex h-6 w-7 shrink-0 items-center justify-center rounded"
    >
      <BroadcastGlyph className="h-3.5 w-3.5" />

      {sparedCount > 0 && (
        <span
          aria-hidden="true"
          className="bg-surface-raised text-ink-muted absolute -right-1 -bottom-1 flex h-[13px] min-w-[13px] items-center justify-center rounded-full px-[3px] font-mono text-[8.5px] font-bold"
        >
          {sparedCount}
        </span>
      )}
    </button>
  );
}
