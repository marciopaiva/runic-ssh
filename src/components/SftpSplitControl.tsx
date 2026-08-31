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
 */
export function SftpSplitControl({ value, onChange }: SftpSplitControlProps): JSX.Element {
  const i18n = useTranslator();

  return (
    <div
      role="radiogroup"
      aria-label={i18n.t('sftp.split.choose')}
      className="border-line-strong flex shrink-0 gap-1 rounded border p-1"
    >
      {Array.from({ length: MAX_DESTINATIONS }, (_, at) => at + 1).map((rows) => {
        const current = rows === value;
        const label = i18n.t('sftp.split.into', { count: String(rows) });

        return (
          <button
            key={rows}
            type="button"
            role="radio"
            aria-checked={current}
            onClick={() => onChange(rows)}
            aria-label={label}
            title={label}
            className={`flex h-6 w-7 items-center justify-center rounded ${
              current
                ? 'bg-surface-raised text-accent'
                : 'text-ink-faint hover:bg-surface-raised/60 hover:text-ink-muted'
            }`}
          >
            <RowsGlyph rows={rows} size="h-3 w-4" />
          </button>
        );
      })}
    </div>
  );
}
