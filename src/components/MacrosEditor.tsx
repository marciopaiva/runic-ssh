import { useEffect, useRef, useState } from 'react';
import type { FormEvent, JSX, KeyboardEvent } from 'react';

import { useTranslator } from '../features/settings';
import { asIpcError } from '../ipc';
import type { Macro, MacroDraft } from '../ipc';

interface MacrosEditorProps {
  readonly macros: readonly Macro[];
  readonly onSave: (draft: MacroDraft) => Promise<Macro>;
  readonly onDelete: (id: string) => Promise<void>;
  readonly onClose: () => void;
}

const CLOSE_ICON = (
  <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" aria-hidden="true">
    <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

/**
 * Create, edit and delete macros.
 *
 * Reached only from the palette's own "Manage macros" entry
 * (`macros:manage`): the one way in, since the palette already reserves the
 * whole "Snippets" section for what a macro actually does once saved.
 *
 * An app-wide overlay rather than `SessionSurface`: a macro belongs to no
 * session, the same reason the command palette itself is drawn this way
 * rather than floating inside a panel.
 */
export function MacrosEditor({ macros, onSave, onDelete, onClose }: MacrosEditorProps): JSX.Element {
  const i18n = useTranslator();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);

  /* Nothing inside starts focused, and a keydown fired on `document.body`
     never bubbles down into this dialog: without moving focus here on
     mount, Escape below has nothing to catch it on. The command palette
     focuses its own input for the same reason. */
  useEffect(() => {
    dialog.current?.focus();
  }, []);

  const editing = editingId === null ? null : (macros.find((macro) => macro.id === editingId) ?? null);

  const reportFailure = (rejection: unknown): void => {
    const failure = asIpcError(rejection);
    if (failure?.code === 'invalidMacro') {
      setError(
        i18n.t(failure.field === 'name' ? 'macros.editor.error.name' : 'macros.editor.error.text'),
      );
      return;
    }
    setError(i18n.t('macros.editor.error.generic'));
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const name = String(fields.get('name') ?? '');
    const text = String(fields.get('text') ?? '');

    setError(null);
    setBusy(true);
    void onSave({ ...(editingId === null ? {} : { id: editingId }), name, text })
      .then((saved) => setEditingId(saved.id))
      .catch(reportFailure)
      .finally(() => setBusy(false));
  };

  const remove = (id: string): void => {
    if (confirmingDeleteId !== id) {
      setConfirmingDeleteId(id);
      return;
    }
    setConfirmingDeleteId(null);
    setError(null);
    void onDelete(id)
      .then(() => {
        if (editingId === id) setEditingId(null);
      })
      .catch(reportFailure);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div
      ref={dialog}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 outline-none"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="macros-editor-title"
        className="bg-surface-overlay border-line-strong flex h-[520px] w-[680px] max-w-[92vw] flex-col overflow-hidden rounded-lg border shadow-2xl"
      >
        <div className="border-line-subtle flex items-center justify-between border-b px-4 py-3">
          <h2 id="macros-editor-title" className="text-ink text-[13.5px] font-semibold">
            {i18n.t('macros.editor.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={i18n.t('macros.editor.close')}
            className="text-ink-faint hover:text-ink flex h-6 w-6 items-center justify-center rounded"
          >
            {CLOSE_ICON}
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="border-line-subtle flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto p-2">
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setConfirmingDeleteId(null);
                setError(null);
              }}
              className={`mb-1 rounded px-2 py-1.5 text-left text-[12.5px] font-medium ${
                editingId === null
                  ? 'bg-accent-soft text-ink'
                  : 'text-ink-secondary hover:bg-surface-raised'
              }`}
            >
              {i18n.t('macros.editor.new')}
            </button>

            {macros.length === 0 ? (
              <p className="text-ink-faint p-2 text-[12px]">{i18n.t('macros.editor.empty')}</p>
            ) : (
              macros.map((macro) => (
                <div key={macro.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(macro.id);
                      setConfirmingDeleteId(null);
                      setError(null);
                    }}
                    className={`min-w-0 flex-1 truncate rounded px-2 py-1.5 text-left text-[12.5px] ${
                      editingId === macro.id
                        ? 'bg-accent-soft text-ink'
                        : 'text-ink-secondary hover:bg-surface-raised'
                    }`}
                  >
                    {macro.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(macro.id)}
                    aria-label={i18n.t('macros.editor.delete', { name: macro.name })}
                    className={`shrink-0 rounded px-1.5 py-1 text-[10.5px] font-semibold ${
                      confirmingDeleteId === macro.id
                        ? 'text-danger'
                        : 'text-ink-faint hover:text-danger'
                    }`}
                  >
                    {confirmingDeleteId === macro.id ? i18n.t('macros.editor.deleteConfirm') : '×'}
                  </button>
                </div>
              ))
            )}
          </div>

          <form
            key={editingId ?? 'new'}
            onSubmit={submit}
            className="border-line-subtle flex min-w-0 flex-1 flex-col gap-3 border-l p-4"
          >
            <label className="flex flex-col gap-1">
              <span className="text-ink-faint text-[11px]">{i18n.t('macros.editor.name')}</span>
              <input
                name="name"
                type="text"
                defaultValue={editing?.name ?? ''}
                required
                className="bg-surface-base border-line-subtle text-ink h-8 rounded border px-2 text-[12.5px]"
              />
            </label>

            <label className="flex min-h-0 flex-1 flex-col gap-1">
              <span className="text-ink-faint text-[11px]">{i18n.t('macros.editor.text')}</span>
              <textarea
                name="text"
                defaultValue={editing?.text ?? ''}
                required
                className="bg-surface-base border-line-subtle text-ink min-h-0 flex-1 resize-none rounded border p-2 font-mono text-[12px]"
              />
            </label>

            <p className="text-ink-faint text-[11px]">{i18n.t('macros.editor.variablesHint')}</p>

            {error !== null && <p className="text-danger text-[11.5px]">{error}</p>}

            <div className="flex justify-end gap-2">
              <button
                type="submit"
                disabled={busy}
                className="bg-accent text-surface-base h-8 rounded px-4 text-[12.5px] font-semibold disabled:opacity-40"
              >
                {i18n.t('macros.editor.save')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
