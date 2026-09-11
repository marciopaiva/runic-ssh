import type { JSX, PointerEvent as ReactPointerEvent } from 'react';

import type { Layer, Point } from '../../ipc';

import { MonolithGlyph } from './glyphs';

interface MonolithNodeProps {
  readonly layer: Layer;
  /** Where its centre is, in map pixels. */
  readonly at: Point;
  readonly count: number;
  readonly dimmed: boolean;
  readonly dragging: boolean;
  readonly onPointerDown: (event: ReactPointerEvent) => void;
  readonly onContextMenu: (event: React.MouseEvent) => void;
  readonly onKeyOpen: () => void;
}

/**
 * A layer, closed: the monolith, a door among the components and visions
 * it shares the ring with (ADR-0068). Click enters it; the count is what
 * it holds, components and visions together, the same count the crumb's
 * hub shows once inside.
 *
 * Presentational, like `ComponentNode` and `VisionNode`: the stage decides
 * what the press was.
 */
export function MonolithNode({ layer, at, count, dimmed, dragging, onPointerDown, onContextMenu, onKeyOpen }: MonolithNodeProps): JSX.Element {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={layer.name}
      data-component={layer.id}
      data-layer=""
      className={`group absolute flex -translate-x-1/2 -translate-y-1/2 cursor-pointer flex-col items-center gap-1.5 select-none transition-opacity duration-normal ${
        dimmed ? 'opacity-20' : ''
      } ${dragging ? 'z-50 opacity-90' : ''}`}
      style={{ left: at.x, top: at.y }}
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onKeyOpen();
        }
      }}
    >
      <div className="transition-transform duration-normal group-hover:-translate-y-0.5">
        <MonolithGlyph count={count} />
      </div>
      <span className="text-ink-secondary group-hover:text-ink max-w-[140px] truncate text-[11.5px] font-semibold">{layer.name}</span>
    </div>
  );
}
