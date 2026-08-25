import type { JSX } from 'react';

import type { Grid } from '../features/terminal';
import { useTranslator } from '../features/settings';

interface ShapeControlProps {
  readonly layout: Grid;
  readonly onChoose: (kind: Grid) => void;
}

/** The four shapes, in the order they divide the area further. */
const SHAPES: readonly (readonly [
  Grid,
  'command.split.none' | 'command.split.columns' | 'command.split.rows' | 'command.split.grid',
])[] = [
  ['single', 'command.split.none'],
  ['columns', 'command.split.columns'],
  ['rows', 'command.split.rows'],
  ['grid', 'command.split.grid'],
];

/** A 16×12 rectangle, divided the way the shape it stands for divides the area. */
function Glyph({ kind }: { readonly kind: Grid }): JSX.Element {
  return (
    <svg viewBox="0 0 16 12" className="h-3 w-4" fill="none" aria-hidden="true">
      <rect
        x="0.75"
        y="0.75"
        width="14.5"
        height="10.5"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      {(kind === 'columns' || kind === 'grid') && (
        <path d="M8 0.75v10.5" stroke="currentColor" strokeWidth="1.2" />
      )}
      {(kind === 'rows' || kind === 'grid') && (
        <path d="M0.75 6h14.5" stroke="currentColor" strokeWidth="1.2" />
      )}
    </svg>
  );
}

/**
 * How the main area is divided.
 *
 * ADR-0021 put this in the top strip, which is the only surface in the window
 * that belongs to the window rather than to something inside it. A shape
 * changes the whole main area, so anywhere else meant attaching it to one of
 * the area's inhabitants, and a control repeated on four group strips either
 * means four things or means one thing four times with nothing on the strip
 * able to say which.
 *
 * Four buttons rather than a menu, because there are four shapes and which one
 * is in use is worth reading without opening anything.
 */
export function ShapeControl({ layout, onChoose }: ShapeControlProps): JSX.Element {
  const i18n = useTranslator();

  return (
    <div
      role="group"
      aria-label={i18n.t('shape.label')}
      className="flex shrink-0 items-center self-center gap-0.5 pr-2"
    >
      {SHAPES.map(([kind, label]) => {
        const current = kind === layout;

        return (
          <button
            key={kind}
            type="button"
            onClick={() => onChoose(kind)}
            aria-pressed={current}
            aria-label={i18n.t(label)}
            title={i18n.t(label)}
            className={`flex h-6 w-7 items-center justify-center rounded ${
              current
                ? 'bg-surface-raised text-accent'
                : 'text-ink-faint hover:bg-surface-raised/50 hover:text-ink-muted'
            }`}
          >
            <Glyph kind={kind} />
          </button>
        );
      })}
    </div>
  );
}
