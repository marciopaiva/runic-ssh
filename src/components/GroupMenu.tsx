import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';

import { menuPosition } from '../features/sessions';
import { useTranslator } from '../features/settings';

export interface GroupMenuItem {
  readonly id: string;
  readonly label: string;
  /** A second line, for what an item is about to do to more than one thing. */
  readonly detail?: string;
  readonly destructive?: boolean;
  readonly run: () => void;
}

interface GroupMenuProps {
  readonly items: readonly GroupMenuItem[];
  readonly at: { readonly x: number; readonly y: number };
  readonly label: string;
  readonly onDismiss: () => void;
}

const WIDTH = 232;
const ROW = 30;
const ROW_WITH_DETAIL = 44;

/**
 * What can be done to a group, and to the tab that was right-clicked.
 *
 * Separate from `SessionMenu` rather than a generalisation of it. That one
 * knows what a session is and asks `sessionMenu` which of four things apply;
 * this one is handed a list. Merging them would mean a component that knows
 * both, which is how a menu ends up with a mode.
 *
 * The detail line is the safety part. Closing a group closes several tabs at
 * once and disconnects whatever is live among them, and the entry says how
 * many before it is clicked. That is the same shape the broadcast switch uses
 * in the palette: the count belongs on the control that does the thing, where
 * it is read a moment before the decision.
 */
export function GroupMenu({ items, at, label, onDismiss }: GroupMenuProps): JSX.Element {
  const i18n = useTranslator();
  const menu = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(0);

  const height =
    items.reduce((sum, item) => sum + (item.detail === undefined ? ROW : ROW_WITH_DETAIL), 0) + 8;
  const position = menuPosition(
    at,
    { width: WIDTH, height },
    { width: window.innerWidth, height: window.innerHeight },
  );

  useEffect(() => {
    menu.current?.focus();
  }, []);

  useEffect(() => {
    /* Any click elsewhere closes it, including one on another strip, or the
       menu outlives the group it was about. */
    const onPointerDown = (event: MouseEvent): void => {
      if (!(event.target instanceof Node) || menu.current?.contains(event.target) !== true) {
        onDismiss();
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [onDismiss]);

  return (
    <div
      ref={menu}
      role="menu"
      tabIndex={-1}
      aria-label={label}
      style={{ left: position.x, top: position.y, width: WIDTH }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onDismiss();
        } else if (items.length === 0) {
          /* The layout can change while this is open, which leaves it about a
             rectangle that no longer exists. A modulo by zero is NaN, and an
             index of NaN is a menu the arrow keys quietly break. */
          return;
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          setFocused((current) => (current + 1) % items.length);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          setFocused((current) => (current - 1 + items.length) % items.length);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          items[focused]?.run();
        }
      }}
      className="bg-surface-overlay border-line-strong fixed z-50 flex flex-col rounded border py-1 shadow-2xl outline-none"
    >
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          onMouseMove={() => setFocused(index)}
          onClick={item.run}
          className={`flex flex-col justify-center gap-0.5 px-3 py-1 text-left ${
            index === focused ? 'bg-surface-raised' : ''
          }`}
        >
          <span
            className={`text-[12.5px] ${item.destructive === true ? 'text-danger-text' : 'text-ink-secondary'}`}
          >
            {item.label}
          </span>
          {item.detail !== undefined && (
            <span className="text-ink-faint text-[11px] leading-snug">{item.detail}</span>
          )}
        </button>
      ))}

      {items.length === 0 && (
        <span className="text-ink-faint px-3 py-1 text-[11.5px]">{i18n.t('group.menu.empty')}</span>
      )}
    </div>
  );
}
