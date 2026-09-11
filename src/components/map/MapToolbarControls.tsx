import type { JSX } from 'react';

import { useTranslator } from '../../features/settings';

interface MapToolbarControlsProps {
  readonly query: string;
  readonly onQueryChange: (value: string) => void;
  readonly onQuerySubmit: () => void;
  readonly zoomPercent: number;
  readonly onRecenter: () => void;
}

/**
 * The map's own controls in the shared toolbar (ADR-0069): search, the
 * zoom reading and Recenter, at the trailing edge before the shell switch
 * and theme and language. Where the map's own second bar used to hold
 * these.
 */
export function MapToolbarControls({ query, onQueryChange, onQuerySubmit, zoomPercent, onRecenter }: MapToolbarControlsProps): JSX.Element {
  const i18n = useTranslator();
  return (
    <>
      <input
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onQuerySubmit();
        }}
        placeholder={i18n.t('map.toolbar.search')}
        aria-label={i18n.t('map.toolbar.search')}
        className="bg-surface-input border-line-subtle focus:border-accent text-ink h-6 w-[220px] shrink-0 rounded border px-2 text-[12px] outline-none"
      />
      <span className="text-ink-faint font-mono text-[10.5px] tabular-nums">{i18n.t('map.toolbar.zoom', { percent: String(zoomPercent) })}</span>
      <button
        type="button"
        className="border-line-subtle text-ink-muted hover:text-ink hover:border-line-strong h-6 shrink-0 rounded border px-2.5 text-[11px]"
        onClick={onRecenter}
      >
        {i18n.t('map.toolbar.recenter')}
      </button>
    </>
  );
}
