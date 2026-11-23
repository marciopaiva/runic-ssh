import { useRef, useState } from 'react';
import type { JSX, KeyboardEvent } from 'react';

import { describeState } from '../features/sessions';
import type { LiveSession } from '../features/sessions';
import { useTranslator } from '../features/settings';

import { SigilBadge } from './SigilMark';

interface HallProps {
  /** The hosts of the Space in front. */
  readonly hosts: readonly LiveSession[];
  readonly onOpen: (sessionId: string) => void;
  readonly onFiles: (sessionId: string) => void;
  /** Opens one host's Logbook. */
  readonly onLogbook: (sessionId: string) => void;
  readonly onNew: () => void;
  /** `null` when this platform offers no native shell. */
  readonly onLocalShell: (() => void) | null;
}

/**
 * The first screen of a Space: a plate per host (ADR-0081).
 *
 * Each plate has the sigil, the name, `user@host` and the state as a glyph and
 * a word. Arrow keys move, Enter opens the terminal and F the files. It shows
 * nothing a host sent: no last line, no output, so ADR-0032's premise holds
 * and the Hall needs no review of its own. The last line waits for that review.
 *
 * No entrance animation: it is the screen the application opens on.
 */
export function Hall({ hosts, onOpen, onFiles, onLogbook, onNew, onLocalShell }: HallProps): JSX.Element {
  const i18n = useTranslator();
  const [cursor, setCursor] = useState(0);
  const plates = useRef<(HTMLButtonElement | null)[]>([]);

  if (hosts.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-ink-secondary text-[13px] font-semibold">{i18n.t('hall.empty.title')}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onNew}
            className="bg-accent text-surface-base rounded px-3.5 py-1.5 text-[12.5px] font-medium"
          >
            {i18n.t('hall.empty.add')}
          </button>
          {onLocalShell !== null && (
            <button
              type="button"
              onClick={onLocalShell}
              className="border-line-strong text-ink-secondary hover:bg-surface-raised rounded border px-3.5 py-1.5 text-[12.5px]"
            >
              {i18n.t('hall.empty.local')}
            </button>
          )}
        </div>
      </div>
    );
  }

  const move = (to: number): void => {
    const next = Math.min(hosts.length - 1, Math.max(0, to));
    setCursor(next);
    plates.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent, index: number, sessionId: string): void => {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        move(index + 1);
        return;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        move(index - 1);
        return;
      case 'f':
      case 'F':
        event.preventDefault();
        onFiles(sessionId);
        return;
      case 'l':
      case 'L':
        event.preventDefault();
        onLogbook(sessionId);
        return;
      default:
    }
  };

  return (
    <ul
      aria-label={i18n.t('hall.label')}
      className="grid content-start gap-3 overflow-y-auto p-5"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
    >
      {hosts.map((live, index) => {
        const { session } = live;
        const state = describeState(live.kind);
        return (
          <li key={session.id} className="relative">
            <button
              ref={(element) => {
                plates.current[index] = element;
              }}
              type="button"
              tabIndex={index === cursor ? 0 : -1}
              onFocus={() => setCursor(index)}
              onClick={() => onOpen(session.id)}
              onKeyDown={(event) => onKeyDown(event, index, session.id)}
              className="bg-surface-raised border-line-subtle hover:border-line-strong focus-visible:border-accent flex w-full items-center gap-3 rounded-md border p-3 text-left"
            >
              <SigilBadge id={session.id} live={live.kind === 'connected'} className="h-9 w-9 shrink-0" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-ink truncate text-[13px] font-semibold">{session.name}</span>
                <span className="text-ink-faint truncate font-mono text-[11px]">
                  {session.user}@{session.host}
                </span>
                <span className={`${state.tone} text-[11px]`}>{i18n.t(state.label)}</span>
              </span>
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={() => onLogbook(session.id)}
              className="text-ink-faint hover:text-ink absolute top-2 right-2 text-[10.5px]"
            >
              {i18n.t('logbook.open')}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
