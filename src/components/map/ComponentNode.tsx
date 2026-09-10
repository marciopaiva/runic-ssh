import type { JSX, PointerEvent as ReactPointerEvent } from 'react';

import type { Component, Point, Session } from '../../ipc';
import { useTranslator } from '../../features/settings';

import { KindGlyph } from './glyphs';

interface ComponentNodeProps {
  readonly component: Component;
  readonly host: Session;
  /** Where its centre is, in map pixels. */
  readonly at: Point;
  /** Whether the host has a live connection. Shown by shape: a filled dot
      for a live session, a hollow ring for a saved host. */
  readonly connected: boolean;
  readonly dimmed: boolean;
  readonly dragging: boolean;
  readonly onPointerDown: (event: ReactPointerEvent) => void;
  readonly onContextMenu: (event: React.MouseEvent) => void;
  readonly onKeyOpen: () => void;
}

/**
 * A closed component: the glyph, the state marker, the host's name and
 * `user@host`. It lives in the map's world, so it pans and scales with it.
 *
 * Presentational: the press it reports is decided by the stage, which is the
 * only place that knows whether it became a click, a hold or a drag.
 */
export function ComponentNode({
  component,
  host,
  at,
  connected,
  dimmed,
  dragging,
  onPointerDown,
  onContextMenu,
  onKeyOpen,
}: ComponentNodeProps): JSX.Element {
  const i18n = useTranslator();
  const port = host.port === 22 ? '' : `:${String(host.port)}`;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={host.name}
      data-component={component.id}
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
      <div className="relative transition-transform duration-normal group-hover:-translate-y-0.5">
        <KindGlyph kind={component.kind} />
        <span
          className={`absolute top-1.5 right-0.5 h-2 w-2 rounded-full border ${
            connected ? 'bg-ok border-surface-base' : 'bg-surface-panel border-ink-faint'
          }`}
          title={i18n.t(connected ? 'map.component.connected' : 'map.component.saved')}
        />
      </div>
      <span className="text-ink-secondary group-hover:text-ink max-w-[140px] truncate text-[11.5px] font-semibold">
        {host.name}
      </span>
      <span className="text-ink-faint font-mono text-[10.5px] whitespace-nowrap">
        {host.user}@{host.host}
        {port}
      </span>
    </div>
  );
}
