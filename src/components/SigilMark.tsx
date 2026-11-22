import type { JSX } from 'react';

import { sigilOf } from '../features/sigil/sigil';
import type { Stroke } from '../features/sigil/sigil';

interface SigilMarkProps {
  /** The saved host's id. Never the host key. */
  readonly id: string;
  /**
   * How much has been cut: 0 is the stem alone, 1 adds the two lower levels,
   * 2 the two upper ones.
   */
  readonly lit: 0 | 1 | 2;
  /** The first level not yet cut is where it stopped, drawn as a failure. */
  readonly failed?: boolean;
  readonly className?: string;
}

const TONE: Record<Stroke['side'], string> = {
  stem: 'stroke-brand-rune',
  left: 'stroke-brand-start',
  right: 'stroke-brand-end',
};

/** The sigil, cut one group of strokes per real step of connecting. */
export function SigilMark({ id, lit, failed = false, className = 'h-[72px] w-[72px]' }: SigilMarkProps): JSX.Element {
  const sigil = sigilOf(id);
  const groups = [[sigil.levels[0], sigil.levels[1]], [sigil.levels[2], sigil.levels[3]]] as const;

  const stroke = (shape: Stroke, tone: string, key: string, on: boolean): JSX.Element => (
    <path
      key={key}
      d={shape.d}
      pathLength={1}
      className={`${tone} motion-safe:transition-[stroke-dashoffset] motion-safe:duration-[420ms] motion-safe:ease-out`}
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeDasharray={1}
      strokeDashoffset={on ? 0 : 1}
      opacity={on ? 1 : 0}
    />
  );

  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      {/* The uncut stone: every stroke, faint. */}
      <g className="stroke-ink-disabled" strokeWidth={1} strokeLinecap="round" opacity={0.35}>
        <path d={sigil.stem.d} />
        {groups.flat().flatMap((level, i) => level.strokes.map((s, j) => <path key={`g${i}-${j}`} d={s.d} />))}
      </g>

      {stroke(sigil.stem, TONE.stem, 'stem', true)}
      {groups.map((group, groupIndex) => {
        const on = lit > groupIndex;
        const stopped = failed && lit === groupIndex;
        return group.flatMap((level, levelIndex) =>
          level.strokes.map((s, strokeIndex) => {
            const key = `s${groupIndex}-${levelIndex}-${strokeIndex}`;
            if (stopped) {
              return (
                <path
                  key={key}
                  d={s.d}
                  className="stroke-danger"
                  strokeWidth={1.4}
                  strokeLinecap="round"
                  opacity={0.7}
                />
              );
            }
            return stroke(s, TONE[s.side], key, on);
          }),
        );
      })}
    </svg>
  );
}
