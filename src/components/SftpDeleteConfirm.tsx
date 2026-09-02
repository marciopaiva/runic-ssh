import type { JSX } from 'react';

import { useTranslator } from '../features/settings';

import { FileIcon, FolderIcon } from './SftpPane';
import { SessionSurface, SurfaceAction } from './SessionSurface';

interface SftpDeleteConfirmProps {
  readonly targets: readonly { readonly name: string; readonly isDir: boolean }[];
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * The one question a delete always asks first, reached identically from
 * the nav bar's own trash icon, the right-click menu, and the Delete key
 * (ADR-0050). Neither SFTP nor a local filesystem offers a Recycle Bin on
 * either end of this application, so a mistaken multi- or folder-delete
 * has had no way back until this.
 *
 * The same danger-tinted `SessionSurface` shape `HostKeyBlocked`/
 * `PasteConfirm` already use, not a screen invented for this. Unlike
 * `HostKeyBlocked`, where the safe action is deliberately the only filled
 * button because the whole point is resisting a reflexive click, deleting
 * is an ordinary, deliberate action once asked for: *Delete* is filled
 * here, just tinted danger rather than accent, so it reads as the
 * recommended next step without reading as safe.
 */
export function SftpDeleteConfirm({
  targets,
  onConfirm,
  onCancel,
}: SftpDeleteConfirmProps): JSX.Element {
  const i18n = useTranslator();
  const hasFolder = targets.some((target) => target.isDir);
  const single = targets.length === 1;
  const target0 = targets[0];

  const body =
    single && target0 !== undefined
      ? target0.isDir
        ? i18n.t('sftp.menu.delete.detail.folder')
        : i18n.t('sftp.delete.confirm.body')
      : hasFolder
        ? i18n.t('sftp.delete.confirm.body.folders')
        : i18n.t('sftp.menu.delete.detail.selected', { count: String(targets.length) });

  return (
    <SessionSurface
      titleId="sftp-delete-confirm-title"
      title={
        single && target0 !== undefined
          ? i18n.t('sftp.delete.confirm.title.one', { name: target0.name })
          : i18n.t('sftp.delete.confirm.title.many', { count: String(targets.length) })
      }
      tone="danger"
      alert
      icon={
        <svg viewBox="0 0 16 16" width="19" height="19" fill="none" aria-hidden="true">
          <path
            d="M3.5 4.5h9M6.2 4.5V3a1 1 0 0 1 1-1h1.6a1 1 0 0 1 1 1v1.5M4.7 4.5l.7 9a1 1 0 0 0 1 .9h3.2a1 1 0 0 0 1-.9l.7-9"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      }
      body={body}
      actions={
        <>
          <SurfaceAction onClick={onCancel} variant="secondary">
            {i18n.t('sftp.cancel')}
          </SurfaceAction>
          <SurfaceAction onClick={onConfirm} variant="danger">
            {i18n.t('sftp.menu.delete')}
          </SurfaceAction>
        </>
      }
    >
      <div className="bg-surface-base border-line-subtle max-h-56 overflow-auto rounded-lg border p-3">
        <ol className="flex flex-col gap-1.5">
          {targets.map((target) => (
            <li key={target.name} className="flex items-center gap-2">
              {target.isDir ? (
                <FolderIcon className="text-ink-faint h-3.5 w-3.5 shrink-0" />
              ) : (
                <FileIcon className="text-ink-faint h-3.5 w-3.5 shrink-0" />
              )}
              <span className="text-ink-secondary truncate font-mono text-[12px]">{target.name}</span>
            </li>
          ))}
        </ol>
      </div>
    </SessionSurface>
  );
}
