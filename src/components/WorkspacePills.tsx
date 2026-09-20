import type { JSX } from 'react';

import { useTranslator } from '../features/settings';

import type { Workspace } from './ActivityRail';
import { FolderIcon, TerminalIcon } from './ui/icons';

interface WorkspacePillsProps {
  readonly workspace: 'sessions' | 'sftp';
  readonly onChoose: (workspace: Workspace) => void;
}

/**
 * The toolbar's own switch between the two workspaces ADR-0072 folded out of
 * the rail: SSH (the `sessions` workspace's new name on screen; the value
 * `Workspace` carries is unchanged) and SFTP. Both are always visible, the
 * segmented-control shape rather than `ShapeControl`'s fold-to-popover one:
 * that pattern answers "pick 1 of a set too large to show," and this is a
 * fixed set of two the ADR asks to read directly.
 */
export function WorkspacePills({ workspace, onChoose }: WorkspacePillsProps): JSX.Element {
  const i18n = useTranslator();

  return (
    <div role="tablist" aria-label={i18n.t('toolbar.pills.label')} className="bg-surface-raised flex gap-0.5 rounded-md p-0.5">
      <button
        type="button"
        role="tab"
        aria-selected={workspace === 'sessions'}
        onClick={() => onChoose('sessions')}
        className={`flex h-6 items-center gap-1.5 rounded px-2 text-[11.5px] font-medium ${
          workspace === 'sessions' ? 'bg-surface-base text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
        }`}
      >
        <TerminalIcon className="h-3.5 w-3.5" />
        {i18n.t('toolbar.pills.ssh')}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={workspace === 'sftp'}
        onClick={() => onChoose('sftp')}
        className={`flex h-6 items-center gap-1.5 rounded px-2 text-[11.5px] font-medium ${
          workspace === 'sftp' ? 'bg-surface-base text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
        }`}
      >
        <FolderIcon className="h-3.5 w-3.5" />
        {i18n.t('toolbar.pills.sftp')}
      </button>
    </div>
  );
}
