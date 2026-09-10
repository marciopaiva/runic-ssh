import type { JSX, MouseEvent as ReactMouseEvent } from 'react';

import type { Point } from '../../ipc';

import { BroadcastGlyph } from '../BroadcastGlyph';

interface LineHandleProps {
  /** The line's midpoint between the two ends' borders, in stage pixels. */
  readonly at: Point;
  /** Whether the set this line is on is armed. */
  readonly on: boolean;
  readonly label: string;
  readonly title: string;
  readonly onToggle: () => void;
  readonly onContextMenu: (event: ReactMouseEvent) => void;
}

interface SendHandleProps {
  readonly at: Point;
  /** How many entries the origin has selected; `0` disables the button. */
  readonly count: number;
  readonly label: string;
  readonly title: string;
  readonly onSend: () => void;
  readonly onContextMenu: (event: ReactMouseEvent) => void;
}

/**
 * The button on a file-browser line (ADR-0065): sends the origin's
 * selection to every destination the origin has a line to, asking first
 * when there is more than one. The badge is the selection's size, so the
 * button says what it is about to send before it is pressed.
 */
export function SendHandle({ at, count, label, title, onSend, onContextMenu }: SendHandleProps): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      disabled={count === 0}
      data-line-handle=""
      className={`absolute z-[100] flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border shadow-3 transition-colors duration-fast ${
        count === 0
          ? 'bg-surface-raised border-line-strong text-ink-faint'
          : 'bg-warn border-warn text-surface-base hover:bg-warn-soft hover:text-warn'
      }`}
      style={{ left: at.x, top: at.y }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onSend}
      onContextMenu={onContextMenu}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
      {count > 0 && (
        <span className="bg-surface-base text-warn border-warn absolute -top-2 -right-2.5 rounded-full border px-1.5 font-mono text-[9.5px] font-bold">
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * The switch on a terminal line (ADR-0065): one per connected set, drawn on
 * every line of the set, off by default. It sits in stage space like a
 * window, so it stays this size at any zoom, and a press on it captures on
 * itself rather than on the stage (#363), which is what `stopPropagation`
 * below is for: the stage would otherwise start a pan under the click.
 *
 * On or off is told by colour and by the knob's side, the same two ways
 * `SyncToggle` tells it in Sessions, so a person who learnt one has learnt
 * the other.
 */
export function LineHandle({ at, on, label, title, onToggle, onContextMenu }: LineHandleProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={title}
      data-line-handle=""
      className={`absolute z-[100] flex h-5 w-9 -translate-x-1/2 -translate-y-1/2 items-center rounded-full border shadow-3 transition-colors duration-fast ${
        on ? 'bg-warn border-warn justify-end' : 'bg-surface-raised border-line-strong justify-start'
      }`}
      style={{ left: at.x, top: at.y }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onToggle}
      onContextMenu={onContextMenu}
    >
      <span
        className={`mx-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full ${
          on ? 'bg-surface-base text-warn' : 'bg-ink-muted text-surface-base'
        }`}
      >
        <BroadcastGlyph className="h-2.5 w-2.5" />
      </span>
    </button>
  );
}
