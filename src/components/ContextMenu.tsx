import { useEffect, useRef } from 'react';
import type { JSX } from 'react';

import type { Point } from '../ipc';

export interface ContextMenuItem {
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
  readonly color?: string;
  readonly danger?: boolean;
  /** Offered and not takeable: the entry says what the gesture is for. */
  readonly disabled?: boolean;
}

interface ContextMenuProps {
  readonly at: Point;
  readonly title: string;
  readonly items: readonly ContextMenuItem[];
  readonly onPick: (id: string) => void;
  readonly onClose: () => void;
}

/**
 * A list of actions at the pointer, for the right button and the keyboard.
 * It started as the map's menu and moved out of the map (ADR-0080) so the pane
 * menu could use it. Arrow keys, Home and End move among the enabled items.
 */
export function ContextMenu({ at, title, items, onPick, onClose }: ContextMenuProps): JSX.Element {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  /* Escape is the caller's to route: the menu does not close itself on a
     listener that knows nothing about whatever else Escape could undo. */
  useEffect(() => {
    const openable = items.findIndex((item) => item.disabled !== true);
    refs.current[openable === -1 ? 0 : openable]?.focus();
    const onDown = (event: PointerEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-context-menu]') === null) onClose();
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
    /* The item list is fixed for the life of one open menu: re-running this
       on every render of a fresh `items` array would steal focus back from
       whatever arrow navigation already moved it to. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  /* Arrow, Home and End move focus among the enabled items, wrapping at the
     ends; a disabled entry is skipped, never landed on. */
  const onMenuKeyDown = (event: React.KeyboardEvent): void => {
    const openable: number[] = [];
    items.forEach((item, i) => {
      if (item.disabled !== true) openable.push(i);
    });
    if (openable.length === 0) return;
    const current = refs.current.findIndex((el) => el === document.activeElement);
    const position = openable.indexOf(current);
    const focusAt = (next: number): void => {
      const idx = openable[next];
      if (idx === undefined) return;
      event.preventDefault();
      refs.current[idx]?.focus();
    };
    switch (event.key) {
      case 'ArrowDown':
        focusAt(position === -1 ? 0 : (position + 1) % openable.length);
        break;
      case 'ArrowUp':
        focusAt(position === -1 ? openable.length - 1 : (position - 1 + openable.length) % openable.length);
        break;
      case 'Home':
        focusAt(0);
        break;
      case 'End':
        focusAt(openable.length - 1);
        break;
    }
  };

  return (
    <div
      role="menu"
      aria-label={title}
      data-context-menu=""
      /* The stage starts a pan on any pointer down it sees, and unmounts this
         menu doing so; a press on an item must not reach it. */
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={onMenuKeyDown}
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
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="menuitem"
          disabled={item.disabled === true}
          aria-disabled={item.disabled === true}
          className={`flex h-7 w-full items-center gap-2 rounded px-2.5 text-left text-[12px] ${
            item.danger ? 'text-danger-text' : 'text-ink-secondary'
          } hover:bg-surface-raised hover:text-ink focus-visible:bg-surface-raised focus-visible:outline-none disabled:opacity-40 disabled:hover:bg-transparent`}
          onClick={() => {
            if (item.disabled !== true) onPick(item.id);
          }}
        >
          <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: item.color ?? 'transparent' }} aria-hidden="true" />
          {item.label}
          {item.detail !== undefined && <span className="text-ink-faint text-[10.5px]">{item.detail}</span>}
        </button>
      ))}
    </div>
  );
}
