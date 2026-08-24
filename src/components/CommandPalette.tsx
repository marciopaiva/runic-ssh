import { useEffect, useRef } from 'react';
import type { JSX, KeyboardEvent } from 'react';

import { bySection } from '../features/commands';
import type { Match } from '../features/commands';
import { useTranslator } from '../features/settings';

interface CommandPaletteProps {
  readonly open: boolean;
  readonly query: string;
  readonly matches: readonly Match[];
  readonly selected: number;
  readonly onQuery: (query: string) => void;
  readonly onMove: (step: number) => void;
  readonly onSelect: (index: number) => void;
  readonly onRun: (index?: number) => void;
  readonly onDismiss: () => void;
}

const optionId = (id: string): string => `command-${id}`;

const SECTION_LABEL = {
  sessions: 'palette.section.sessions',
  actions: 'palette.section.actions',
  snippets: 'palette.section.snippets',
} as const;

/** Draws a title with the matched characters picked out. */
function Highlighted({
  text,
  at,
}: {
  readonly text: string;
  readonly at: readonly number[];
}): JSX.Element {
  const marked = new Set(at);

  return (
    <>
      {[...text].map((character, index) =>
        marked.has(index) ? (
          <mark key={index} className="text-accent-bright bg-transparent font-semibold">
            {character}
          </mark>
        ) : (
          <span key={index}>{character}</span>
        ),
      )}
    </>
  );
}

/**
 * The command palette.
 *
 * A combobox over a listbox. Visual weight matches the mockup: deeper overlay,
 * tighter radius, accent soft on the active row.
 */
export function CommandPalette({
  open,
  query,
  matches,
  selected,
  onQuery,
  onMove,
  onSelect,
  onRun,
  onDismiss,
}: CommandPaletteProps): JSX.Element | null {
  const i18n = useTranslator();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) {
      const previous = opener.current;
      opener.current = null;
      if (previous instanceof HTMLElement) previous.focus();
      return;
    }

    opener.current = document.activeElement;
    input.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const active = list.current?.querySelector('[aria-selected="true"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [open, selected]);

  if (!open) return null;

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        onMove(1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        onMove(-1);
        return;
      case 'Enter':
        event.preventDefault();
        onRun();
        return;
      case 'Escape':
        event.preventDefault();
        onDismiss();
        return;
      default:
    }
  };

  const active = matches[selected];
  const groups = bySection(matches);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-black/55 pt-[11vh] backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={i18n.t('palette.title')}
        className="bg-surface-overlay border-line-strong flex max-h-[60vh] w-[580px] max-w-[92vw] flex-col overflow-hidden rounded-xl border shadow-[0_24px_64px_rgba(0,0,0,0.55)]"
      >
        <input
          ref={input}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="command-results"
          aria-activedescendant={active === undefined ? undefined : optionId(active.command.id)}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          value={query}
          placeholder={i18n.t('palette.placeholder')}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={onKeyDown}
          className="text-ink placeholder:text-ink-faint border-line-subtle h-12 shrink-0 border-b bg-transparent px-5 text-[14px] outline-none"
        />

        <div ref={list} id="command-results" role="listbox" className="min-h-0 flex-1 overflow-y-auto py-2">
          {matches.length === 0 ? (
            <p className="text-ink-faint px-5 py-8 text-center text-[13px]">
              {i18n.t('palette.empty', { query })}
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.section} role="group" aria-label={i18n.t(SECTION_LABEL[group.section])}>
                <h2 className="text-ink-faint px-5 pt-2.5 pb-1 text-[10.5px] font-bold tracking-[0.1em]">
                  {i18n.t(SECTION_LABEL[group.section])}
                </h2>

                {group.entries.map((match) => {
                  const index = matches.indexOf(match);
                  const isActive = index === selected;

                  return (
                    <div
                      key={match.command.id}
                      id={optionId(match.command.id)}
                      role="option"
                      aria-selected={isActive}
                      onMouseMove={() => onSelect(index)}
                      onClick={() => onRun(index)}
                      className={`mx-2 flex h-9 cursor-default items-center gap-3 rounded-md px-3 text-[13px] ${
                        isActive
                          ? 'bg-accent-soft text-ink shadow-[inset_2px_0_0_var(--color-accent)]'
                          : 'text-ink-secondary'
                      }`}
                    >
                      <span className="min-w-0 truncate">
                        <Highlighted text={match.command.title} at={match.highlights} />
                      </span>
                      {match.command.detail !== undefined && (
                        <span className="text-ink-faint ml-auto shrink-0 font-mono text-[11px]">
                          {match.command.detail}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
