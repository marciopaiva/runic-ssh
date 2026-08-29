import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';

import { GRIDS, SHAPE_LABEL, dimensions } from '../features/terminal';
import type { Grid } from '../features/terminal';
import { useTranslator } from '../features/settings';

interface ShapeControlProps {
  readonly layout: Grid;
  readonly onChoose: (kind: Grid) => void;
  /**
   * Whether a session is open anywhere in the window.
   *
   * The palette already refuses every shape but the one in use when nothing
   * is open, "since the entry would be a shape with two holes in it"
   * (`sources.ts`). This control offers the same seven things and did not
   * carry the same refusal, so dividing a window holding only settings drew a
   * rectangle with nothing to put in it and nothing to say about it either.
   */
  readonly canSplit: boolean;
}

/**
 * A rectangle divided the way the shape it stands for divides the area.
 *
 * Drawn from the shape's own name, so a shape added to `GRIDS` arrives here
 * with a picture rather than with a gap where one should be.
 */
function Glyph({ kind, size }: { readonly kind: Grid; readonly size: string }): JSX.Element {
  const { columns, rows } = dimensions(kind);

  return (
    <svg viewBox="0 0 16 12" className={size} fill="none" aria-hidden="true">
      <rect
        x="0.75"
        y="0.75"
        width="14.5"
        height="10.5"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      {Array.from({ length: columns - 1 }, (_, at) => (
        <path
          key={`v${String(at)}`}
          d={`M${String(0.75 + (14.5 * (at + 1)) / columns)} 0.75v10.5`}
          stroke="currentColor"
          strokeWidth="1.2"
        />
      ))}
      {Array.from({ length: rows - 1 }, (_, at) => (
        <path
          key={`h${String(at)}`}
          d={`M0.75 ${String(0.75 + (10.5 * (at + 1)) / rows)}h14.5`}
          stroke="currentColor"
          strokeWidth="1.2"
        />
      ))}
    </svg>
  );
}

/**
 * How the main area is divided.
 *
 * ADR-0021 put this in the top strip, which is the only surface in the window
 * that belongs to the window rather than to something inside it. A shape
 * changes the whole main area, so anywhere else meant attaching it to one of
 * the area's inhabitants.
 *
 * It was four buttons then, and that document's `Revisit this` said they fold
 * into one that opens the four if the width ever matters. ADR-0022 brought the
 * count to seven, which is 196px of a bar whose remaining job is being
 * dragged, so this is that fold. The button still shows the shape in use,
 * because which one it is stays worth reading without opening anything.
 */
export function ShapeControl({ layout, onChoose, canSplit }: ShapeControlProps): JSX.Element {
  const i18n = useTranslator();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event: MouseEvent): void => {
      if (!(event.target instanceof Node) || box.current?.contains(event.target) !== true) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  /* Nothing open and nothing to divide it into: there is nothing this control
     could do, so there is nothing to show. Mirrors the palette, which offers
     no split command in the same state. `sources.ts` needs `tabs.length > 0`
     for "divide into N" and `layout !== '1x1'` for "back to one", and here
     both are already false.

     Kept, rather than hidden, whenever the window is already divided with
     nothing open: collapsing back to one rectangle has to stay reachable from
     here, or closing every session in a split window strands whoever is
     driving it with the mouse in that split, since the button that got them
     back would have vanished along with the sessions. */
  if (layout === '1x1' && !canSplit) return <></>;

  return (
    <div ref={box} className="relative flex shrink-0 items-center self-center pr-2">
      <button
        type="button"
        onClick={() => setOpen((showing) => !showing)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={i18n.t('shape.choose')}
        title={i18n.t(SHAPE_LABEL[layout])}
        className={`flex h-6 w-7 items-center justify-center rounded ${
          open ? 'bg-surface-raised text-ink' : 'text-ink-muted hover:bg-surface-raised/50 hover:text-ink'
        }`}
      >
        <Glyph kind={layout} size="h-3 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={i18n.t('shape.choose')}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            setOpen(false);
          }}
          /* Below the bar and against its trailing edge, which is where the
             button is. Absolute rather than fixed: the strip does not scroll,
             and a fixed box would need the arithmetic a menu opened from a
             moving element needs. */
          className="bg-surface-overlay border-line-strong absolute top-full right-2 z-50 mt-1 flex gap-1 rounded border p-1.5 shadow-2xl"
        >
          {GRIDS.map((kind) => {
            const current = kind === layout;
            /* Collapsing back to one rectangle never leaves a hole, whatever
               is or is not open, so '1x1' stays exempt from the refusal. The
               shape already in use is exempt for a different reason: showing
               it disabled would say the window cannot have the shape it
               already has. */
            const locked = kind !== '1x1' && !current && !canSplit;
            const label = locked ? i18n.t('shape.needsSession') : i18n.t(SHAPE_LABEL[kind]);

            return (
              <button
                key={kind}
                type="button"
                role="menuitemradio"
                aria-checked={current}
                disabled={locked}
                onClick={() => {
                  onChoose(kind);
                  setOpen(false);
                }}
                aria-label={label}
                title={label}
                className={`flex h-8 w-9 items-center justify-center rounded ${
                  locked
                    ? 'text-ink-disabled cursor-not-allowed'
                    : current
                      ? 'bg-surface-raised text-accent'
                      : 'text-ink-faint hover:bg-surface-raised/60 hover:text-ink-muted'
                }`}
              >
                <Glyph kind={kind} size="h-4 w-[21px]" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
