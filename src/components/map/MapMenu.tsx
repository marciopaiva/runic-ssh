import { useEffect, useRef } from 'react';
import type { JSX } from 'react';

import type { Point } from '../../ipc';

export interface MapMenuItem {
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
  readonly color?: string;
  readonly danger?: boolean;
}

interface MapMenuProps {
  readonly at: Point;
  readonly title: string;
  readonly items: readonly MapMenuItem[];
  readonly onPick: (id: string) => void;
  readonly onClose: () => void;
}

/**
 * The same actions the radial offers, as a list at the pointer, for the
 * right button and the keyboard. The radial alone is a gesture nobody
 * discovers and nothing a screen reader can drive; this is the path that
 * is always there.
 */
export function MapMenu({ at, title, items, onPick, onClose }: MapMenuProps): JSX.Element {
  const first = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    const onDown = (event: PointerEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-map-menu]') === null) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [onClose]);

  return (
    <div
      role="menu"
      aria-label={title}
      data-map-menu=""
      /* The stage starts a pan on any pointer down it sees, and unmounts this
         menu doing so; a press on an item must not reach it. */
      onPointerDown={(event) => event.stopPropagation()}
      className="border-line-strong absolute z-[320] min-w-[200px] rounded-md border p-1 shadow-5"
      style={{
        left: Math.max(0, at.x),
        top: Math.max(0, at.y),
        background: 'var(--rs-glass-panel)',
        backdropFilter: 'blur(var(--rs-glass-blur))',
        WebkitBackdropFilter: 'blur(var(--rs-glass-blur))',
      }}
    >
      <div className="text-ink-faint px-2.5 pt-1.5 pb-1 text-[10.5px] font-bold tracking-[0.1em] uppercase">{title}</div>
      {items.map((item, i) => (
        <button
          key={item.id}
          ref={i === 0 ? first : undefined}
          type="button"
          role="menuitem"
          className={`flex h-7 w-full items-center gap-2 rounded px-2.5 text-left text-[12px] ${
            item.danger ? 'text-danger-text' : 'text-ink-secondary'
          } hover:bg-surface-raised hover:text-ink focus-visible:bg-surface-raised focus-visible:outline-none`}
          onClick={() => onPick(item.id)}
        >
          <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: item.color ?? 'transparent' }} aria-hidden="true" />
          {item.label}
          {item.detail !== undefined && <span className="text-ink-faint text-[10.5px]">{item.detail}</span>}
        </button>
      ))}
    </div>
  );
}
