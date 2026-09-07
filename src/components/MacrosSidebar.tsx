import { useEffect, useRef, useState } from 'react';
import type { FormEvent, JSX, KeyboardEvent } from 'react';

import { useTranslator } from '../features/settings';
import { asIpcError } from '../ipc';
import type { Macro, MacroDraft } from '../ipc';

interface MacrosSidebarProps {
  readonly macros: readonly Macro[];
  /** Sends a macro to whatever a keystroke would currently reach. */
  readonly onRun: (macro: Macro) => void;
  readonly onSave: (draft: MacroDraft) => Promise<Macro>;
  readonly onDelete: (id: string) => Promise<void>;
  readonly onClose: () => void;
}

const CLOSE_ICON = (
  <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" aria-hidden="true">
    <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

const PLUS_ICON = (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const PENCIL_ICON = (
  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" aria-hidden="true">
    <path
      d="M4 20l1-4.2L15.8 5l3.2 3.2L8.2 19H4z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M13.8 6.7l3.2 3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

/** Nothing selected: the list. A macro's own id: editing it. `undefined`
 * (rather than absent) reads oddly, so a fresh draft is `null` explicitly. */
type Mode = { readonly kind: 'list' } | { readonly kind: 'form'; readonly editingId: string | null };

/**
 * A docked panel, not a modal: create, edit, delete and — first, since it
 * is the reason this exists — run a saved macro without leaving whatever
 * else is on screen.
 *
 * Reached from `MacrosButton` in the Sessions toolbar and, still, from the
 * palette's own "Manage macros" entry; running a macro also still works
 * straight from the palette's "Snippets" section. This is a second way in
 * and a better one for a quick run, not a replacement for either.
 */
export function MacrosSidebar({
  macros,
  onRun,
  onSave,
  onDelete,
  onClose,
}: MacrosSidebarProps): JSX.Element {
  const i18n = useTranslator();
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  /* Nothing inside starts focused, and a keydown fired on `document.body`
     never bubbles down into this panel: without moving focus here on
     mount, Escape below has nothing to catch it on. */
  useEffect(() => {
    panel.current?.focus();
  }, []);

  const editing =
    mode.kind === 'form' && mode.editingId !== null
      ? (macros.find((macro) => macro.id === mode.editingId) ?? null)
      : null;

  const openForm = (editingId: string | null): void => {
    setMode({ kind: 'form', editingId });
    setConfirmingDeleteId(null);
    setError(null);
  };

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
    if (mode.kind !== 'form') return;
    const fields = new FormData(event.currentTarget);
    const name = String(fields.get('name') ?? '');
    const text = String(fields.get('text') ?? '');

    setError(null);
    setBusy(true);
    void onSave({ ...(mode.editingId === null ? {} : { id: mode.editingId }), name, text })
      .then(() => setMode({ kind: 'list' }))
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
        if (mode.kind === 'form' && mode.editingId === id) setMode({ kind: 'list' });
      })
      .catch(reportFailure);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    /* Escape backs out of the form first, closing only takes a second
       press: the same "one thing at a time" this panel does for delete. */
    if (mode.kind === 'form') setMode({ kind: 'list' });
    else onClose();
  };

  return (
    <div
      ref={panel}
      tabIndex={-1}
      className="border-line-strong bg-surface-panel fixed inset-y-0 right-0 z-40 flex w-[300px] flex-col border-l shadow-2xl outline-none"
      onKeyDown={onKeyDown}
    >
      <div className="border-line-subtle flex items-center justify-between border-b px-3.5 py-3">
        <span className="text-ink-faint text-[10.5px] font-bold tracking-[0.1em]">
          {i18n.t('macros.sidebar.title')}
        </span>
        <div className="flex items-center gap-1">
          {mode.kind === 'list' && (
            <button
              type="button"
              onClick={() => openForm(null)}
              aria-label={i18n.t('macros.editor.new')}
              title={i18n.t('macros.editor.new')}
              className="text-ink-faint hover:text-ink flex h-6 w-6 items-center justify-center rounded"
            >
              {PLUS_ICON}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={i18n.t('macros.editor.close')}
            title={i18n.t('macros.editor.close')}
            className="text-ink-faint hover:text-ink flex h-6 w-6 items-center justify-center rounded"
          >
            {CLOSE_ICON}
          </button>
        </div>
      </div>

      {mode.kind === 'list' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {macros.length === 0 ? (
            <p className="text-ink-faint p-2 text-[12px]">{i18n.t('macros.editor.empty')}</p>
          ) : (
            macros.map((macro) => (
              <div
                key={macro.id}
                className="hover:bg-surface-raised flex items-center gap-1 rounded"
              >
                <button
                  type="button"
                  onClick={() => onRun(macro)}
                  className="text-ink-secondary hover:text-ink min-w-0 flex-1 truncate rounded px-2 py-1.5 text-left text-[12.5px]"
                >
                  {macro.name}
                </button>
                <button
                  type="button"
                  onClick={() => openForm(macro.id)}
                  aria-label={i18n.t('macros.sidebar.edit', { name: macro.name })}
                  title={i18n.t('macros.sidebar.edit', { name: macro.name })}
                  className="text-ink-faint hover:text-ink shrink-0 rounded p-1.5"
                >
                  {PENCIL_ICON}
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
      ) : (
        <form
          key={mode.editingId ?? 'new'}
          onSubmit={submit}
          className="flex min-h-0 flex-1 flex-col gap-3 p-3"
        >
          <button
            type="button"
            onClick={() => setMode({ kind: 'list' })}
            className="text-ink-faint hover:text-ink self-start text-[11.5px]"
          >
            {i18n.t('macros.sidebar.back')}
          </button>

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
      )}
    </div>
  );
}
