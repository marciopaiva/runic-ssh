import type { JSX, PointerEvent as ReactPointerEvent } from 'react';

import type { ComponentKind, Point, Vision } from '../../ipc';
import { useTranslator } from '../../features/settings';

import { ApertureGlyph, kindColor } from './glyphs';
import { MapNode } from './MapNode';

interface VisionNodeProps {
  readonly vision: Vision;
  /** Where its centre is, in map pixels. */
  readonly at: Point;
  /** The kind of each member, for the marks under the name. */
  readonly kinds: readonly ComponentKind[];
  readonly dimmed: boolean;
  readonly dragging: boolean;
  /** A component is being dragged over it and would join if dropped. */
  readonly receiving: boolean;
  readonly onPointerDown: (event: ReactPointerEvent) => void;
  readonly onContextMenu: (event: React.MouseEvent) => void;
  readonly onKeyOpen: () => void;
}

/**
 * A closed vision: the aperture with the member count at its centre, the
 * name, and one mark per kind its members hold (ADR-0067). It lives in the
 * map's world, so it pans and scales with it, and a line from outside ends
 * at its edge.
 *
 * Presentational, like `ComponentNode`: the stage decides what the press was.
 */
export function VisionNode({ vision, at, kinds, dimmed, dragging, receiving, onPointerDown, onContextMenu, onKeyOpen }: VisionNodeProps): JSX.Element {
  const i18n = useTranslator();
  const count = vision.components.length;
  return (
    <MapNode id={vision.id} label={vision.name} at={at} dimmed={dimmed} dragging={dragging} extraAttr="data-vision" onPointerDown={onPointerDown} onContextMenu={onContextMenu} onKeyOpen={onKeyOpen}>
      <div className={`relative transition-transform duration-normal group-hover:-translate-y-0.5 ${receiving ? 'scale-110' : ''}`}>
        <ApertureGlyph highlighted={receiving} />
        <span className="text-ink pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-[15px] font-bold">
          {String(count)}
        </span>
      </div>
      {/* Hidden while dragging: at the same point as a drop target's own
          label, the two would overlap and both go illegible (#387). The name
          the user is holding is not new information; the target's is. */}
      {!dragging && (
        <>
          <span className="text-ink-secondary group-hover:text-ink max-w-[140px] truncate text-[11.5px] font-semibold">{vision.name}</span>
          <span className="flex gap-1" title={i18n.t(count === 1 ? 'map.vision.count.one' : 'map.vision.count.other', { count: String(count) })}>
            {kinds.map((kind, i) => (
              <span key={`${kind}-${String(i)}`} className="h-[7px] w-[7px] rounded-full" style={{ background: kindColor(kind) }} />
            ))}
          </span>
        </>
      )}
    </MapNode>
  );
}
