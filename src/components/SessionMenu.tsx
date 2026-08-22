import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';

import { menuPosition, sessionMenu } from '../features/sessions';
import type { LiveSession, SessionAction } from '../features/sessions';
import { useTranslator } from '../features/settings';

interface SessionMenuProps {
  readonly live: LiveSession;
  readonly at: { readonly x: number; readonly y: number };
  readonly onChoose: (action: SessionAction) => void;
  readonly onDismiss: () => void;
}

const WIDTH = 168;

/**
 * What can be done to a session.
 *
 * Opened by the row's own button and by right-clicking the row. Both, because
 * a context menu is the convention and a visible button is the thing somebody
 * finds without being told the convention.
 */
export function SessionMenu({ live, at, onChoose, onDismiss }: SessionMenuProps): JSX.Element {
  const i18n = useTranslator();
  const items = sessionMenu(live);
  const menu = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(0);

  const height = items.length * 28 + 8;
  const position = menuPosition(
    at,
    { width: WIDTH, height },
    { width: window.innerWidth, height: window.innerHeight },
  );

  useEffect(() => {
    menu.current?.focus();
  }, []);

  useEffect(() => {
    /* Any click elsewhere closes it, including one on another row — otherwise
       the menu outlives the thing it was about. */
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
      aria-label={live.session.name}
      style={{ left: position.x, top: position.y, width: WIDTH }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onDismiss();
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          setFocused((current) => (current + 1) % items.length);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          setFocused((current) => (current - 1 + items.length) % items.length);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          const item = items[focused];
          if (item !== undefined) onChoose(item.action);
        }
      }}
      className="bg-surface-overlay border-line-strong fixed z-50 flex flex-col rounded border py-1 shadow-2xl outline-none"
    >
      {items.map((item, index) => (
        <button
          key={item.action}
          type="button"
          role="menuitem"
          onMouseMove={() => setFocused(index)}
          onClick={() => onChoose(item.action)}
          className={`flex h-7 items-center px-3 text-left text-[12.5px] ${
            item.destructive ? 'text-danger-text' : 'text-ink-secondary'
          } ${index === focused ? 'bg-surface-raised' : ''}`}
        >
          {i18n.t(item.label)}
        </button>
      ))}
    </div>
  );
}
