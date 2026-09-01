import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';

import { MAX_DESTINATIONS } from '../features/sftp/use-fanout';
import { useTranslator } from '../features/settings';

interface SftpSplitControlProps {
  readonly value: number;
  readonly onChange: (rows: number) => void;
}

/** A rectangle divided into as many horizontal bars as `rows` names. */
function RowsGlyph({ rows, size }: { readonly rows: number; readonly size: string }): JSX.Element {
  return (
    <svg viewBox="0 0 16 12" className={size} fill="none" aria-hidden="true">
      <rect x="0.75" y="0.75" width="14.5" height="10.5" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
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
 * How many destination rows are pre-allocated, from 1 to
 * {@link MAX_DESTINATIONS}. Lowering this never hides an occupied slot:
 * the caller folds the chosen count with how many are already occupied,
 * the same "every occupied pane stays visible" rule the destination grid
 * itself keeps (ADR-0045).
 *
 * One button that opens the choices, not four shown at once: confirmed
 * directly against `ShapeControl`, its own equivalent in the same
 * toolbar, once a bare row of four buttons here and a single folded
 * button there read as two rules rather than one for "how many things
 * can this area be divided into." Folding four costs less than
 * `ShapeControl`'s own fold of eight cost when ADR-0022 did it, and the
 * canvas draws both flat purely for the mockup's own clarity, the same
 * way it draws `ShapeControl`'s glyph unfolded too; neither drawing was
 * ever the shipped shape for either control.
 */
export function SftpSplitControl({ value, onChange }: SftpSplitControlProps): JSX.Element {
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

  const currentLabel = i18n.t('sftp.split.into', { count: String(value) });

  return (
    <div ref={box} className="relative flex shrink-0 items-center self-center">
      <button
        type="button"
        onClick={() => setOpen((showing) => !showing)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={i18n.t('sftp.split.choose')}
        title={currentLabel}
        className={`flex h-6 w-7 items-center justify-center rounded ${
          open ? 'bg-surface-raised text-ink' : 'text-ink-muted hover:bg-surface-raised/50 hover:text-ink'
        }`}
      >
        <RowsGlyph rows={value} size="h-3 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={i18n.t('sftp.split.choose')}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            setOpen(false);
          }}
          /* Below the bar and against its trailing edge, which is where
             the button is. Absolute rather than fixed, the same reason
             `ShapeControl`'s own menu is: this bar does not scroll. */
          className="bg-surface-overlay border-line-strong absolute top-full right-0 z-50 mt-1 flex gap-1 rounded border p-1.5 shadow-2xl"
        >
          {Array.from({ length: MAX_DESTINATIONS }, (_, at) => at + 1).map((rows) => {
            const current = rows === value;
            const label = i18n.t('sftp.split.into', { count: String(rows) });

            return (
              <button
                key={rows}
                type="button"
                role="menuitemradio"
                aria-checked={current}
                onClick={() => {
                  onChange(rows);
                  setOpen(false);
                }}
                aria-label={label}
                title={label}
                className={`flex h-8 w-9 items-center justify-center rounded ${
                  current
                    ? 'bg-surface-raised text-accent'
                    : 'text-ink-faint hover:bg-surface-raised/60 hover:text-ink-muted'
                }`}
              >
                <RowsGlyph rows={rows} size="h-4 w-[21px]" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
