import type { JSX } from 'react';

import { useTranslator } from '../features/settings';

interface SyncControlProps {
  /** How many hosts a keystroke reaches, or `null` when it reaches one. */
  readonly syncing: number | null;
  /**
   * Whether the switch is worth offering, and whether it can act.
   *
   * `null` on an undivided window, where there is nothing to synchronise.
   * `false` when the area is divided and fewer than two rectangles hold a
   * session, which is a switch that would arm and reach nowhere.
   */
  readonly canSync: boolean | null;
  readonly onStart: () => void;
  readonly onStop: () => void;
}

/**
 * Typing into every rectangle at once.
 *
 * Here rather than in the status bar, for the reason ADR-0021 gave the shape
 * control: the top strip is the only surface in the window that belongs to the
 * window rather than to something inside it, and this switch is about the
 * window. The bar below is measurement, and a control among the readings reads
 * as one more reading.
 *
 * The bar keeps what it is good at. Its whole top edge still turns warn while
 * this is armed, and it still says how many hosts are receiving. What moved is
 * the thing you press, which was there for turning off and had no counterpart
 * for turning on until it did.
 *
 * One glyph in both states, filled when armed. A warning triangle on a quiet
 * window would be alarming about nothing, and a different glyph in each state
 * would be two controls that happen to share a spot.
 */
export function SyncControl({ syncing, canSync, onStart, onStop }: SyncControlProps): JSX.Element | null {
  const i18n = useTranslator();

  if (syncing === null && canSync === null) return null;

  const armed = syncing !== null;

  return (
    <button
      type="button"
      onClick={armed ? onStop : onStart}
      disabled={!armed && canSync !== true}
      aria-pressed={armed}
      aria-label={i18n.t(
        armed
          ? 'command.split.sync.off'
          : canSync === true
            ? 'command.split.sync.on'
            : 'status.sync.nowhere',
      )}
      title={i18n.t(
        armed
          ? 'command.split.sync.off'
          : canSync === true
            ? 'command.split.sync.on'
            : 'status.sync.nowhere',
      )}
      className={`mr-1 flex h-6 shrink-0 items-center gap-1.5 self-center rounded px-1.5 ${
        armed
          ? 'bg-warn text-surface-base font-mono text-[10.5px] font-bold'
          : canSync === true
            ? 'text-ink-muted hover:bg-surface-raised/50 hover:text-ink'
            : 'text-ink-disabled cursor-not-allowed'
      }`}
    >
      {/* One keystroke reaching three places. */}
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="4.5" cy="12" r="1.8" />
        <path d="M6.5 12h4M10.5 12l7-6M10.5 12h7M10.5 12l7 6" />
        <circle cx="19.5" cy="6" r="1.4" />
        <circle cx="19.5" cy="12" r="1.4" />
        <circle cx="19.5" cy="18" r="1.4" />
      </svg>

      {armed && String(syncing)}
    </button>
  );
}
