import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';

import { DEFAULT_SPACE } from '../features/spaces';
import { useTranslator } from '../features/settings';
import type { Space } from '../ipc';

interface SpaceSwitcherProps {
  readonly spaces: readonly Space[];
  readonly active: string;
  readonly onChoose: (id: string) => void;
  readonly onNew: () => void;
  /** Opens the editor on the Space in front. Not offered for the default one,
   * which has no record to edit. */
  readonly onEdit: () => void;
}

/**
 * The Space in front, and the way to change it (ADR-0081).
 *
 * The keyboard path is Ctrl+1 to 9 and animates nothing. This is the mouse
 * path, a list from its own button, and it does not animate either: it is
 * opened dozens of times a day, and the list is short enough to read at once.
 */
export function SpaceSwitcher({ spaces, active, onChoose, onNew, onEdit }: SpaceSwitcherProps): JSX.Element {
  const i18n = useTranslator();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const current = spaces.find((space) => space.id === active);
  const production = current?.weight === 'production';
  const label = current?.name ?? i18n.t('spaces.default');

  useEffect(() => {
    if (!open) return undefined;
    const outside = (event: MouseEvent): void => {
      if (!(event.target instanceof Node) || box.current?.contains(event.target) !== true) setOpen(false);
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const choices = [
    { id: DEFAULT_SPACE, name: i18n.t('spaces.default'), weight: 'normal' as const },
    ...spaces,
  ];

  const row = 'flex h-7 w-full items-center gap-2 px-3 text-left text-[12px] hover:bg-surface-raised';

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={i18n.t('spaces.title')}
        onClick={() => setOpen((now) => !now)}
        className={`border-line-subtle hover:bg-surface-raised flex h-6 items-center gap-1.5 rounded border px-2 text-[11.5px] ${
          production ? 'border-danger text-danger-text' : 'text-ink-secondary'
        }`}
      >
        <span className="max-w-[140px] truncate">{label}</span>
        {production && <span className="text-[10px] tracking-wide uppercase">{i18n.t('spaces.production')}</span>}
        <span aria-hidden className="text-ink-faint text-[9px]">
          ▾
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={i18n.t('spaces.title')}
          className="bg-surface-overlay border-line-strong absolute top-full left-0 z-30 mt-1 min-w-[200px] rounded border py-1 shadow-2xl"
        >
          {choices.map((choice, index) => (
            <button
              key={choice.id || 'default'}
              type="button"
              role="option"
              aria-selected={choice.id === active}
              onClick={() => {
                setOpen(false);
                onChoose(choice.id);
              }}
              className={`${row} ${choice.id === active ? 'text-ink bg-accent-soft' : 'text-ink-secondary'}`}
            >
              <span className="min-w-0 flex-1 truncate">{choice.name}</span>
              {choice.weight === 'production' && (
                <span className="text-danger-text text-[10px] tracking-wide uppercase">
                  {i18n.t('spaces.production')}
                </span>
              )}
              {index < 9 && <span className="text-ink-faint font-mono text-[10.5px]">Ctrl+{index + 1}</span>}
            </button>
          ))}
          <div role="separator" className="border-line-subtle my-1 border-t" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onNew();
            }}
            className={`${row} text-ink-secondary`}
          >
            {i18n.t('spaces.new')}
          </button>
          {current !== undefined && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
              className={`${row} text-ink-secondary`}
            >
              {i18n.t('spaces.edit')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
