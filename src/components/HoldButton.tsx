import { useEffect, useRef, useState } from 'react';
import type { JSX, ReactNode } from 'react';

import { HOLD_MS } from '../features/spaces/guard';

interface HoldButtonProps {
  readonly children: ReactNode;
  /** Runs once, when the button has been held for the whole time. */
  readonly onComplete: () => void;
  readonly disabled?: boolean;
  readonly ms?: number;
}

/**
 * A button that has to be held (ADR-0081).
 *
 * Releasing early, leaving the button or pressing Escape cancels, and the fill
 * drains in 200ms. It works from the keyboard too: hold Space or Enter. The
 * fill is linear because it is the one place the interface is slow on purpose,
 * and a linear fill is honest about how long is left.
 */
export function HoldButton({ children, onComplete, disabled = false, ms = HOLD_MS }: HoldButtonProps): JSX.Element {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = useRef(onComplete);
  done.current = onComplete;

  const stop = (): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };

  const start = (): void => {
    if (disabled || timer.current !== null) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      done.current();
    }, ms);
  };

  /* Nothing outlives the button: an unmount mid-hold cancels the timer. */
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(event) => {
        if (event.repeat) return;
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          start();
        } else if (event.key === 'Escape') {
          stop();
        }
      }}
      onKeyUp={(event) => {
        if (event.key === ' ' || event.key === 'Enter') stop();
      }}
      onBlur={stop}
      className="bg-danger text-surface-base relative overflow-hidden rounded px-3.5 py-1.5 text-[12.5px] font-medium select-none disabled:opacity-50"
      style={{ transform: holding ? 'scale(0.97)' : 'scale(1)', transition: 'transform 120ms cubic-bezier(0.23, 1, 0.32, 1)' }}
    >
      <span
        aria-hidden
        className="bg-ink absolute inset-0 opacity-30"
        style={{
          clipPath: holding ? 'inset(0 0 0 0)' : 'inset(0 100% 0 0)',
          transition: holding ? `clip-path ${ms}ms linear` : 'clip-path 200ms cubic-bezier(0.23, 1, 0.32, 1)',
        }}
      />
      <span className="relative">{children}</span>
    </button>
  );
}
