import type { JSX, MouseEvent as ReactMouseEvent } from 'react';

import type { Point } from '../../ipc';
import type { SwitchState } from '../../features/map';

import { BroadcastGlyph } from '../BroadcastGlyph';

interface LineHandleProps {
  /** The line's midpoint between the two ends' borders, in stage pixels. */
  readonly at: Point;
  /** Off, on, or armed with nobody to reach (`idle`). */
  readonly state: SwitchState;
  readonly label: string;
  readonly title: string;
  readonly onToggle: () => void;
  readonly onContextMenu: (event: ReactMouseEvent) => void;
}

interface LineKnotProps {
  readonly at: Point;
  readonly label: string;
  readonly onOpen: () => void;
  readonly onContextMenu: (event: ReactMouseEvent) => void;
}

/**
 * The knot on a file-browser line (ADR-0065): the line's hit target, for
 * the menu that removes it. The send button used to sit here and now sits
 * in the origin's strip, since every line from one origin sent the same
 * selection to the same destinations, and a button on the line's midpoint
 * floated over a window whenever the windows covered the line.
 */
export function LineKnot({ at, label, onOpen, onContextMenu }: LineKnotProps): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      data-line-handle=""
      className="border-warn bg-surface-base hover:bg-warn absolute z-[100] h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] shadow-3 transition-colors duration-fast"
      style={{ left: at.x, top: at.y }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onOpen}
      onContextMenu={onContextMenu}
    />
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
 * the other. Armed with nobody to reach keeps the knob on its "on" side
 * and hollows the fill: the set is armed, nothing is being broadcast, and
 * the status bar, which says nothing, is not contradicted.
 */
export function LineHandle({ at, state, label, title, onToggle, onContextMenu }: LineHandleProps): JSX.Element {
  const look =
    state === 'on'
      ? 'bg-warn border-warn justify-end'
      : state === 'idle'
        ? 'bg-surface-raised border-warn justify-end'
        : 'bg-surface-raised border-line-strong justify-start';
  const knob = state === 'on' ? 'bg-surface-base text-warn' : state === 'idle' ? 'bg-warn text-surface-base' : 'bg-ink-muted text-surface-base';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={state !== 'off'}
      aria-label={label}
      title={title}
      data-line-handle=""
      className={`absolute z-[100] flex h-5 w-9 -translate-x-1/2 -translate-y-1/2 items-center rounded-full border shadow-3 transition-colors duration-fast ${look}`}
      style={{ left: at.x, top: at.y }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onToggle}
      onContextMenu={onContextMenu}
    >
      <span className={`mx-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full ${knob}`}>
        <BroadcastGlyph className="h-2.5 w-2.5" />
      </span>
    </button>
  );
}
