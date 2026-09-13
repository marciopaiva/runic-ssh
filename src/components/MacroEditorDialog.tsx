import { useRef, useState } from 'react';
import type { FormEvent, JSX, MutableRefObject } from 'react';

import { useTranslator } from '../features/settings';
import { asIpcError } from '../ipc';
import type { Macro, MacroDraft, MacroKind } from '../ipc';

import { Button } from './ui/Button';
import { CodeEditor } from './ui/CodeEditor';
import type { CodeEditorHandle } from './ui/CodeEditor';
import { Dialog } from './ui/Dialog';

interface MacroEditorDialogProps {
  readonly open: boolean;
  /** `null` while creating a fresh macro; the macro being edited otherwise. */
  readonly macro: Macro | null;
  readonly onSave: (draft: MacroDraft) => Promise<Macro>;
  readonly onClose: () => void;
}

const VARIABLES = ['$host', '$port', '$username'] as const;
const KINDS: readonly MacroKind[] = ['sequential', 'script'];

/**
 * Create or edit a macro, as a popup (ADR-0070) rather than the inline
 * form that used to grow out of the docked sidebar's own 300px panel: a
 * script's text needs a real editor, and a segmented pick for which kind
 * of macro this is, neither of which fit there.
 */
export function MacroEditorDialog({ open, macro, onSave, onClose }: MacroEditorDialogProps): JSX.Element {
  const i18n = useTranslator();
  /* Headless UI otherwise focuses the first focusable descendant once the
     dialog opens, which is the kind pick, not this: a name typed right
     away, before touching anything with the mouse, went nowhere. Declared
     here rather than inside `MacroEditorForm` because `Dialog` needs it
     too, and stays stable across the form's own remounts below (the ref
     object, not what it points at, is what `initialFocus` holds onto). */
  const name = useRef<HTMLInputElement>(null);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="full"
      initialFocus={name}
      title={macro === null ? i18n.t('macros.editor.new') : i18n.t('macros.editor.editTitle', { name: macro.name })}
    >
      {/* Keyed so a different macro, or a fresh draft, always starts from
          a clean slate: the kind pick and the editor's own text are held
          outside React state (a ref, or state seeded once), the same
          reason the inline form this replaces used to key its own <form>
          by `mode.editingId`. */}
      <MacroEditorForm key={macro?.id ?? 'new'} macro={macro} onSave={onSave} onClose={onClose} nameRef={name} />
    </Dialog>
  );
}

interface MacroEditorFormProps {
  readonly macro: Macro | null;
  readonly onSave: (draft: MacroDraft) => Promise<Macro>;
  readonly onClose: () => void;
  readonly nameRef: MutableRefObject<HTMLInputElement | null>;
}

function MacroEditorForm({ macro, onSave, onClose, nameRef }: MacroEditorFormProps): JSX.Element {
  const i18n = useTranslator();
  const [kind, setKind] = useState<MacroKind>(macro?.kind ?? 'sequential');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = useRef(macro?.text ?? '');
  const editor = useRef<CodeEditorHandle>(null);

  const reportFailure = (rejection: unknown): void => {
    const failure = asIpcError(rejection);
    if (failure?.code === 'invalidMacro') {
      setError(i18n.t(failure.field === 'name' ? 'macros.editor.error.name' : 'macros.editor.error.text'));
      return;
    }
    setError(i18n.t('macros.editor.error.generic'));
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    void onSave({
      ...(macro === null ? {} : { id: macro.id }),
      name: nameRef.current?.value ?? '',
      kind,
      text: text.current,
    })
      .then(() => onClose())
      .catch(reportFailure)
      .finally(() => setBusy(false));
  };

  return (
    <form onSubmit={submit} className="flex h-[min(70vh,640px)] min-h-0 flex-col gap-3.5">
      <div role="radiogroup" aria-label={i18n.t('macros.editor.title')} className="flex gap-1.5">
        {KINDS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={kind === option}
            onClick={() => setKind(option)}
            className={`rounded-md border px-3.5 py-1.5 text-[12px] font-semibold transition-colors duration-fast ${
              kind === option
                ? 'border-accent bg-accent-soft text-ink'
                : 'border-line-subtle text-ink-secondary hover:text-ink'
            }`}
          >
            {i18n.t(`macros.editor.kind.${option}`)}
          </button>
        ))}
      </div>
      <p className="text-ink-faint text-[11px]">{i18n.t(`macros.editor.kind.${kind}.hint`)}</p>

      <label className="flex flex-col gap-1">
        <span className="text-ink-faint text-[11px]">{i18n.t('macros.editor.name')}</span>
        <input
          ref={nameRef}
          name="name"
          type="text"
          defaultValue={macro?.name ?? ''}
          required
          className="bg-surface-base border-line-subtle text-ink h-8 rounded border px-2 text-[12.5px]"
        />
      </label>

      <label className="flex min-h-0 flex-1 flex-col gap-1">
        <span className="flex items-center justify-between gap-2">
          <span className="text-ink-faint text-[11px]">{i18n.t('macros.editor.text')}</span>
          <span className="flex gap-1">
            {VARIABLES.map((token) => (
              <button
                key={token}
                type="button"
                onClick={() => editor.current?.insertAtCursor(token)}
                aria-label={i18n.t('macros.editor.insertVariable', { name: token })}
                title={i18n.t('macros.editor.insertVariable', { name: token })}
                className="text-accent bg-accent/10 hover:bg-accent/20 rounded px-1.5 py-0.5 font-mono text-[9.5px] font-bold"
              >
                {token}
              </button>
            ))}
          </span>
        </span>
        <CodeEditor
          ref={editor}
          value={text.current}
          onChange={(next) => {
            text.current = next;
          }}
          ariaLabel={i18n.t('macros.editor.text')}
          className="min-h-0 flex-1"
        />
      </label>

      <p className="text-ink-faint text-[11px]">
        {i18n.t(kind === 'script' ? 'macros.editor.variablesHintScript' : 'macros.editor.variablesHint')}
      </p>

      {error !== null && <p className="text-danger text-[11.5px]">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" type="button" onClick={onClose} disabled={busy}>
          {i18n.t('macros.editor.cancel')}
        </Button>
        <Button variant="primary" type="submit" loading={busy}>
          {i18n.t('macros.editor.save')}
        </Button>
      </div>
    </form>
  );
}
