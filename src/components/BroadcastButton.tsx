import type { JSX } from 'react';

import { useTranslator } from '../features/settings';

import { BroadcastGlyph } from './BroadcastGlyph';

interface BroadcastButtonProps {
  /** Whether typing is currently reaching more than one group. */
  readonly armed: boolean;
  /** `false` when there is nowhere for a broadcast to reach: one group, or
   * none of them holding a session. Mirrors the guard `groupSyncState`
   * already applies per group (`layout === '1x1' || filled < 2`). */
  readonly available: boolean;
  readonly count: number;
  readonly onToggle: () => void;
}

/**
 * The toolbar's own arm/disarm-everyone shortcut, in the Sessions toolbar
 * before `ShapeControl`.
 *
 * ADR-0021's own history already tried a global sync switch in the top
 * strip once, and reversed it the next day, because "which of them receive
 * is a real question about each one... a control repeated four times that
 * means one thing four times is what this document refused." That reasoning
 * rules out a control that *only* arms everyone with no per-rectangle
 * opt-out; it does not rule out a shortcut that starts or stops everyone at
 * once *alongside* the per-rectangle switch `SyncToggle` already is.
 * Pressing this exposes exactly what `toggleSync` already does from the
 * command palette, and pressing one group's own switch afterward still
 * opts just that rectangle out (ADR-0046).
 *
 * Draws the same broadcast glyph `SyncToggle` uses, told apart by colour
 * alone, rather than a second shape that would also mean "is this
 * receiving."
 */
export function BroadcastButton({
  armed,
  available,
  count,
  onToggle,
}: BroadcastButtonProps): JSX.Element {
  const i18n = useTranslator();

  const label = !available
    ? i18n.t('status.sync.nowhere')
    : i18n.t(armed ? 'toolbar.broadcast.on' : 'toolbar.broadcast.off');

  return (
    <button
      type="button"
      role="switch"
      aria-checked={armed}
      disabled={!available}
      onClick={onToggle}
      aria-label={label}
      title={label}
      className={`relative flex h-6 w-7 shrink-0 items-center justify-center rounded ${
        !available
          ? 'text-ink-disabled cursor-not-allowed'
          : armed
            ? 'bg-warn-soft text-warn'
            : 'text-ink-muted hover:bg-surface-raised/50 hover:text-ink'
      }`}
    >
      <BroadcastGlyph className="h-3.5 w-3.5" />

      {armed && count > 0 && (
        <span
          aria-hidden="true"
          /* Solid warn, not a neutral pill: the same treatment
             `ActivityRail`'s own badge already gives an armed count. */
          className="bg-warn text-surface-base absolute -right-1 -bottom-1 flex h-[13px] min-w-[13px] items-center justify-center rounded-full px-[3px] font-mono text-[8.5px] font-bold"
        >
          {count}
        </span>
      )}
    </button>
  );
}
