import { useRef, useState } from 'react';
import type { FormEvent, JSX } from 'react';

import { useTranslator } from '../features/settings';
import { asIpcError } from '../ipc';
import type { Space, SpaceDraft } from '../ipc';

import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';

interface SpaceEditorDialogProps {
  readonly open: boolean;
  /** `null` while creating; the Space being edited otherwise. */
  readonly space: Space | null;
  readonly onSave: (draft: SpaceDraft) => Promise<Space>;
  readonly onDelete: (id: string) => Promise<void>;
  readonly onClose: () => void;
}

/**
 * Create, rename, weigh or delete a Space (ADR-0081).
 *
 * The weight is one checkbox, because a Space is either asking for care or it
 * is not. Deleting a Space deletes no host: they fall back to the default
 * Space, and the dialog says so before it is asked.
 */
export function SpaceEditorDialog({
  open,
  space,
  onSave,
  onDelete,
  onClose,
}: SpaceEditorDialogProps): JSX.Element {
  const i18n = useTranslator();
  const name = useRef<HTMLInputElement>(null);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      initialFocus={name}
      title={space === null ? i18n.t('spaces.editor.new') : i18n.t('spaces.editor.edit', { name: space.name })}
    >
      <SpaceEditorForm
        key={space?.id ?? 'new'}
        space={space}
        onSave={onSave}
        onDelete={onDelete}
        onClose={onClose}
        nameRef={name}
      />
    </Dialog>
  );
}

function SpaceEditorForm({
  space,
  onSave,
  onDelete,
  onClose,
  nameRef,
}: Omit<SpaceEditorDialogProps, 'open'> & {
  readonly nameRef: React.RefObject<HTMLInputElement | null>;
}): JSX.Element {
  const i18n = useTranslator();
  const [name, setName] = useState(space?.name ?? '');
  const [production, setProduction] = useState(space?.weight === 'production');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const fail = (rejection: unknown): void => {
    const failure = asIpcError(rejection);
    setError(
      i18n.t(
        failure?.code === 'invalidSpace' && failure.field === 'name'
          ? 'spaces.editor.error.name'
          : failure?.code === 'invalidSpace' && failure.field === 'count'
            ? 'spaces.editor.error.count'
            : 'spaces.editor.error.generic',
      ),
    );
    setBusy(false);
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    onSave({
      ...(space === null ? {} : { id: space.id }),
      name: name.trim(),
      weight: production ? 'production' : 'normal',
    })
      .then(onClose)
      .catch(fail);
  };

  const remove = (): void => {
    if (space === null || busy) return;
    setBusy(true);
    onDelete(space.id).then(onClose).catch(fail);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-ink-muted text-[11px]">{i18n.t('spaces.editor.name')}</span>
        <input
          ref={nameRef}
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error !== null}
          className="bg-surface-input text-ink border-line-subtle rounded border px-2.5 py-1.5 text-[12.5px] outline-none"
        />
      </label>

      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={production}
          onChange={(event) => setProduction(event.target.checked)}
          className="mt-0.5"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-ink text-[12.5px]">{i18n.t('spaces.editor.production')}</span>
          <span className="text-ink-faint text-[11px] leading-relaxed">
            {i18n.t('spaces.editor.productionHint')}
          </span>
        </span>
      </label>

      {error !== null && (
        <p role="alert" className="text-danger-text text-[12px]">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 pt-1">
        {space !== null &&
          (confirming ? (
            <Button type="button" variant="danger" onClick={remove} disabled={busy}>
              {i18n.t('spaces.editor.deleteConfirm')}
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={() => setConfirming(true)} disabled={busy}>
              {i18n.t('spaces.editor.delete')}
            </Button>
          ))}
        <span className="flex-1" />
        <Button type="button" variant="ghost" onClick={onClose}>
          {i18n.t('spaces.editor.cancel')}
        </Button>
        <Button type="submit" disabled={busy || name.trim() === ''}>
          {i18n.t('spaces.editor.save')}
        </Button>
      </div>

      {confirming && (
        <p className="text-ink-faint text-[11px] leading-relaxed">{i18n.t('spaces.editor.deleteHint')}</p>
      )}
    </form>
  );
}
