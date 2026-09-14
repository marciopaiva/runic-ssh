import { useEffect, useRef, useState } from 'react';
import type { JSX, KeyboardEvent } from 'react';

import { useTranslator } from '../features/settings';
import type { Macro, MacroDraft } from '../ipc';

import { MacroEditorDialog } from './MacroEditorDialog';
import { SearchIcon, XIcon } from './ui/icons';

interface MacrosSidebarProps {
  readonly macros: readonly Macro[];
  /** Sends a macro to whatever a keystroke would currently reach. */
  readonly onRun: (macro: Macro) => void;
  readonly onSave: (draft: MacroDraft) => Promise<Macro>;
  readonly onDelete: (id: string) => Promise<void>;
  readonly onClose: () => void;
}

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
 * A docked panel: the list, create, edit (through `MacroEditorDialog`,
 * ADR-0070), delete and, first, since it is the reason this exists, run a
 * saved macro without leaving whatever else is on screen.
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
  const [query, setQuery] = useState('');
  const panel = useRef<HTMLDivElement>(null);

  /* Trimmed and lower-cased once here rather than per row: the same shape
     `filterGroups` already uses for the sessions list. */
  const needle = query.trim().toLowerCase();
  const shown = needle === '' ? macros : macros.filter((macro) => macro.name.toLowerCase().includes(needle));

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
  };

  const remove = (id: string): void => {
    if (confirmingDeleteId !== id) {
      setConfirmingDeleteId(id);
      return;
    }
    setConfirmingDeleteId(null);
    void onDelete(id).then(() => {
      if (mode.kind === 'form' && mode.editingId === id) setMode({ kind: 'list' });
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    /* The dialog owns Escape while it is open (`Dialog`'s own headlessui
       behavior calls its `onClose`); this only ever fires once focus is
       back in the docked panel, so closing the whole sidebar is always
       the right thing for it to do. */
    if (event.key !== 'Escape' || mode.kind !== 'list') return;
    event.preventDefault();
    onClose();
  };

  return (
    <div
      ref={panel}
      tabIndex={-1}
      className="bg-surface-panel border-line-subtle flex h-full w-[300px] shrink-0 flex-col border-l outline-none"
      onKeyDown={onKeyDown}
    >
      <div className="border-line-subtle flex items-center justify-between border-b px-3.5 py-3">
        <span className="text-ink-faint text-[10.5px] font-bold tracking-[0.1em]">
          {i18n.t('macros.sidebar.title')}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => openForm(null)}
            aria-label={i18n.t('macros.editor.new')}
            title={i18n.t('macros.editor.new')}
            className="text-ink-faint hover:text-ink flex h-6 w-6 items-center justify-center rounded"
          >
            {PLUS_ICON}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={i18n.t('macros.editor.close')}
            title={i18n.t('macros.editor.close')}
            className="text-ink-faint hover:text-ink flex h-6 w-6 items-center justify-center rounded"
          >
            <XIcon className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>

      {macros.length > 0 && (
        <div className="relative px-3.5 pt-2.5 pb-1.5">
          <SearchIcon className="text-ink-faint pointer-events-none absolute top-1/2 left-6 h-3.5 w-3.5 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={i18n.t('macros.sidebar.filter')}
            aria-label={i18n.t('macros.sidebar.filter')}
            autoComplete="off"
            spellCheck={false}
            className="bg-surface-input border-line-subtle text-ink placeholder:text-ink-faint focus:border-line-strong w-full rounded border py-1 pr-2 pl-7 text-[12px] outline-none"
          />
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {macros.length === 0 ? (
          <p className="text-ink-faint p-2 text-[12px]">{i18n.t('macros.editor.empty')}</p>
        ) : shown.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-4 py-8 text-center">
            <p className="text-ink-secondary text-[12.5px] font-semibold">
              {i18n.t('macros.sidebar.filter.empty.title')}
            </p>
            <p className="text-ink-faint text-[11.5px] leading-snug text-pretty">
              {i18n.t('macros.sidebar.filter.empty.body')}
            </p>
          </div>
        ) : (
          shown.map((macro) => (
            <div key={macro.id} className="hover:bg-surface-raised flex items-center gap-1 rounded">
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

      <MacroEditorDialog
        open={mode.kind === 'form'}
        macro={editing}
        onSave={onSave}
        onClose={() => setMode({ kind: 'list' })}
      />
    </div>
  );
}
