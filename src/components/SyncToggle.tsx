import type { JSX } from 'react';

import { useTranslator } from '../features/settings';

/**
 * What this rectangle does with what you type.
 *
 * `off` and `on` are the two states of the switch. `unavailable` is a window
 * where arming would reach nowhere: one rectangle with something in it, so a
 * broadcast would send exactly where an ordinary keystroke goes.
 */
export type SyncState = 'off' | 'on' | 'unavailable';

interface SyncToggleProps {
  readonly state: SyncState;
  readonly onToggle: () => void;
}

/**
 * The switch for typing into every rectangle at once, on a group's own strip.
 *
 * It moved here from the top strip, and the reason it belongs here and the
 * shape control does not is that **this one means something per group**. Which
 * rectangles receive is a real question about each rectangle; which shape the
 * area is divided into is not. A control repeated on four strips that means
 * one thing four times is what ADR-0021 refused; this one means a different
 * thing on each strip and reads as four switches because it is four switches.
 *
 * Pressing it while nothing is armed arms the broadcast, and arming has always
 * started with every rectangle receiving (ADR-0019: inheriting a set somebody
 * narrowed for a different pair of hosts is what this switch must never do).
 * So the first press lights every strip, which is loud on purpose. Pressing it
 * while armed takes this rectangle out, or puts it back.
 *
 * A pill with a knob rather than one glyph that fills. Somebody looking for
 * whether this is on wants a shape that says on or off without a second one to
 * compare against, and a switch is the shape everybody already reads that way.
 */
export function SyncToggle({ state, onToggle }: SyncToggleProps): JSX.Element {
  const i18n = useTranslator();
  const on = state === 'on';

  const label = i18n.t(
    state === 'unavailable'
      ? 'status.sync.nowhere'
      : on
        ? 'terminal.pane.sync.on'
        : 'terminal.pane.sync.off',
  );

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={state === 'unavailable'}
      onClick={onToggle}
      aria-label={label}
      title={label}
      className={`flex h-4 w-4 shrink-0 items-center justify-center ${
        state === 'unavailable'
          ? 'text-ink-disabled cursor-not-allowed'
          : on
            ? 'text-warn'
            : 'text-ink-faint hover:text-ink-muted'
      }`}
    >
      <svg viewBox="0 0 24 16" className="h-3.5 w-[21px]" fill="none" aria-hidden="true">
        <rect
          x="1"
          y="1"
          width="22"
          height="14"
          rx="7"
          stroke="currentColor"
          strokeWidth="1.8"
          fill={on ? 'currentColor' : 'none'}
        />
        <circle
          cx={on ? 16 : 8}
          cy="8"
          r="3.4"
          fill={on ? 'var(--color-surface-base)' : 'currentColor'}
        />
      </svg>
    </button>
  );
}
