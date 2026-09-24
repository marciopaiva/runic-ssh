import type { JSX, PointerEvent as ReactPointerEvent, ReactNode } from 'react';

import type { Point } from '../../ipc';

interface MapNodeProps {
  readonly id: string;
  readonly label: string;
  readonly at: Point;
  readonly dimmed?: boolean;
  readonly dragging?: boolean;
  /** The marker a caller's own drop-target logic reads besides
      `data-component`: `data-vision` for a vision, `data-layer` for a
      layer, absent for a plain component or the hub. */
  readonly extraAttr?: string;
  readonly onPointerDown: (event: ReactPointerEvent) => void;
  readonly onContextMenu: (event: React.MouseEvent) => void;
  readonly onKeyOpen: () => void;
  readonly children?: ReactNode;
}

/**
 * The chrome every closed thing on the map shares: positioned by its
 * centre, focusable, opened by Enter or Space, dimmed and lifted above a
 * drag by the same two flags. `ComponentNode`, `VisionNode`, `MonolithNode`
 * and the hub each draw only what sits inside it.
 */
export function MapNode({ id, label, at, dimmed = false, dragging = false, extraAttr, onPointerDown, onContextMenu, onKeyOpen, children }: MapNodeProps): JSX.Element {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      data-component={id}
      {...(extraAttr === undefined ? {} : { [extraAttr]: '' })}
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
      {children}
    </div>
  );
}
