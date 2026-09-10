import type { JSX } from 'react';

import type { Point } from '../../ipc';

export interface RadialOption {
  readonly label: string;
  readonly detail?: string | undefined;
  readonly color?: string | undefined;
  readonly danger?: boolean | undefined;
}

interface RadialProps {
  /** Where the hold began, in stage pixels. */
  readonly at: Point;
  readonly options: readonly RadialOption[];
  /** The segment under the pointer, or `-1` in the dead centre. */
  readonly segment: number;
  readonly title: string;
}

const SIZE = 360;
const CENTRE = SIZE / 2;
const INNER = 56;
const OUTER = 160;

function arc(r1: number, r2: number, a0: number, a1: number): string {
  const p = (r: number, a: number): [number, number] => [CENTRE + r * Math.cos(a), CENTRE + r * Math.sin(a)];
  const [x0, y0] = p(r2, a0);
  const [x1, y1] = p(r2, a1);
  const [x2, y2] = p(r1, a1);
  const [x3, y3] = p(r1, a0);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${String(x0)} ${String(y0)} A${String(r2)} ${String(r2)} 0 ${String(large)} 1 ${String(x1)} ${String(y1)} L${String(x2)} ${String(y2)} A${String(r1)} ${String(r1)} 0 ${String(large)} 0 ${String(x3)} ${String(y3)} Z`;
}

/**
 * The menu a hold opens: segments around the point held, starting at
 * twelve o'clock and running clockwise in the order the options came,
 * which is also the order `radialSegment` counts them in. Releasing over
 * a segment picks it; releasing in the dead centre cancels.
 *
 * Pointer events pass through it: the stage is tracking the pointer already.
 */
export function Radial({ at, options, segment, title }: RadialProps): JSX.Element {
  return (
    <svg
      className="map-bloom pointer-events-none absolute z-[310]"
      style={{ left: at.x - CENTRE, top: at.y - CENTRE, width: SIZE, height: SIZE }}
      viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`}
      role="menu"
      aria-label={title}
    >
      {options.map((option, i) => {
        const a0 = (i / options.length) * Math.PI * 2 - Math.PI / 2 + 0.05;
        const a1 = ((i + 1) / options.length) * Math.PI * 2 - Math.PI / 2 - 0.05;
        const mid = (a0 + a1) / 2;
        const rm = (INNER + OUTER) / 2;
        const x = CENTRE + Math.cos(mid) * rm;
        const y = CENTRE + Math.sin(mid) * rm;
        const hot = i === segment;
        return (
          <g key={option.label} role="menuitem" aria-selected={hot}>
            <path
              d={arc(INNER, OUTER, a0, a1)}
              fill={hot ? 'var(--rs-surface-raised)' : 'var(--rs-map-radial)'}
              stroke={hot ? (option.danger ? 'var(--rs-state-danger)' : 'var(--rs-accent)') : 'var(--rs-glass-edge)'}
              strokeWidth="1"
            />
            <text
              x={x}
              y={y - 3}
              textAnchor="middle"
              fontSize="11"
              fontWeight="700"
              fill={option.color ?? 'var(--rs-text-primary)'}
              style={{ fontFamily: 'inherit' }}
            >
              {option.label}
            </text>
            {option.detail !== undefined && (
              <text x={x} y={y + 11} textAnchor="middle" fontSize="10.5" fill="var(--rs-text-faint)" className="font-mono">
                {option.detail}
              </text>
            )}
          </g>
        );
      })}
      <text x={CENTRE} y={CENTRE + 4} textAnchor="middle" fontSize="10.5" fill="var(--rs-text-faint)" className="font-mono">
        {title}
      </text>
    </svg>
  );
}
