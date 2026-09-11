import type { JSX, PointerEvent as ReactPointerEvent } from 'react';

import type { Vision } from '../../ipc';
import { useTranslator } from '../../features/settings';

import { ApertureMark } from './glyphs';

interface VisionRegionProps {
  readonly vision: Vision;
  /** In stage pixels: the region scales with the map, and its members'
      windows sit over it 1:1 the way every window does. */
  readonly rect: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
  /** The bar's height at the current zoom, in stage pixels. */
  readonly bar: number;
  readonly focused: boolean;
  /** A component is being dragged over it and would join if dropped. */
  readonly receiving: boolean;
  /** The name of the member maximized inside, or `null`. */
  readonly maximized: string | null;
  readonly onStripPointerDown: (event: ReactPointerEvent) => void;
  readonly onFocus: () => void;
  readonly onFit: () => void;
  readonly onFill: () => void;
  readonly onClose: () => void;
  readonly onRestore: () => void;
  readonly onContextMenu: (event: React.MouseEvent) => void;
}

/**
 * An open vision: the glass region whose size follows its members, with
 * the bar that drags the whole block, fits the view to it, fills the screen
 * with it and closes it back to the aperture with the sessions alive
 * (ADR-0067). No handle resizes it; its size is a consequence.
 *
 * Drawn under the windows and over the world, in stage pixels, so a member
 * window and its region agree on where the corner is at any zoom.
 */
export function VisionRegion({
  vision,
  rect,
  bar,
  focused,
  receiving,
  maximized,
  onStripPointerDown,
  onFocus,
  onFit,
  onFill,
  onClose,
  onRestore,
  onContextMenu,
}: VisionRegionProps): JSX.Element {
  const i18n = useTranslator();
  const count = vision.components.length;
  const button = (label: string, glyph: string, onClick: () => void): JSX.Element => (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="text-ink-muted hover:text-ink hover:bg-surface-raised flex h-6 w-[26px] items-center justify-center rounded text-[11px]"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onClick}
    >
      {glyph}
    </button>
  );
  return (
    <div
      data-window={vision.id}
      data-vision=""
      className={`absolute flex flex-col overflow-hidden rounded-[10px] border transition-colors duration-normal ${
        receiving ? 'border-accent-bright' : focused ? 'border-line-strong' : 'border-line-subtle'
      }`}
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        background: receiving ? 'var(--rs-map-snap)' : 'var(--rs-glass-region)',
        boxShadow: focused ? 'var(--rs-shadow-3)' : 'none',
      }}
      onPointerDown={onFocus}
      onContextMenu={onContextMenu}
    >
      <div
        className="border-line-subtle flex shrink-0 cursor-grab items-center gap-2 border-b px-2.5 active:cursor-grabbing"
        style={{ height: bar, background: 'var(--rs-glass-strip)' }}
        onPointerDown={onStripPointerDown}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onFill();
        }}
        title={i18n.t('map.vision.bar')}
      >
        <ApertureMark />
        <span className="text-ink truncate text-[12px] font-semibold">{vision.name}</span>
        {maximized === null ? (
          <span className="text-ink-faint font-mono text-[10.5px]">
            {i18n.t(count === 1 ? 'map.vision.count.one' : 'map.vision.count.other', { count: String(count) })}
          </span>
        ) : (
          <span className="text-warn text-[10.5px]">
            {i18n.t('map.vision.maximized', { name: maximized, count: String(Math.max(0, count - 1)) })}
          </span>
        )}
        <span className="ml-auto flex items-center gap-0.5">
          {maximized === null ? (
            <>
              {button(i18n.t('map.vision.fit'), '⌖', onFit)}
              {button(i18n.t('map.vision.fill'), '⬚', onFill)}
              {button(i18n.t('map.vision.close'), '–', onClose)}
            </>
          ) : (
            button(i18n.t('map.vision.restore'), '❐', onRestore)
          )}
        </span>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none flex-1"
        style={{
          backgroundImage: 'linear-gradient(var(--rs-map-region-grid) 1px, transparent 1px), linear-gradient(90deg, var(--rs-map-region-grid) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />
    </div>
  );
}
