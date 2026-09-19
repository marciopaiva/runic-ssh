import type { JSX } from 'react';

import { useTranslator } from '../features/settings';

import { LinkIcon, TerminalIcon } from './ui/icons';

/** Which of a session's own facets is showing. Stops at two: a third tab
    over nothing the backend has would break ADR-0020's rule 6. */
export type SessionFacet = 'terminal' | 'tunnels';

interface SessionFacetsProps {
  readonly active: SessionFacet;
  /** Saved and ad-hoc forwards together, shown as a count on the Tunnels
      tab so the facet says something before it is opened. */
  readonly tunnelCount: number;
  readonly onChange: (facet: SessionFacet) => void;
}

const FACETS: readonly SessionFacet[] = ['terminal', 'tunnels'];

/**
 * The tab strip inside a session's own body, switching it between its
 * terminal and its forwards.
 *
 * A group's strip (`GroupStrip`) still names which session this rectangle
 * is, per ADR-0020; this one answers a different question, which facet of
 * that one session is showing, and sits below it rather than replacing it.
 */
export function SessionFacets({ active, tunnelCount, onChange }: SessionFacetsProps): JSX.Element {
  const i18n = useTranslator();

  return (
    <div
      role="tablist"
      aria-label={i18n.t('facet.label')}
      className="border-line-subtle bg-surface-raised flex h-[30px] flex-none items-stretch border-b"
    >
      {FACETS.map((facet) => {
        const selected = facet === active;
        const label = facet === 'terminal' ? 'facet.terminal' : 'facet.tunnels';

        return (
          <button
            key={facet}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(facet)}
            className={`flex items-center gap-1.5 border-b-2 px-3 text-[11.5px] ${
              selected
                ? 'border-accent text-ink font-semibold'
                : 'text-ink-secondary hover:text-ink border-transparent font-medium'
            }`}
          >
            {facet === 'terminal' ? (
              <TerminalIcon className="h-[13px] w-[13px]" />
            ) : (
              <LinkIcon className="h-[13px] w-[13px]" />
            )}
            {i18n.t(label)}
            {facet === 'tunnels' && tunnelCount > 0 && (
              <span className="text-ink-faint font-mono text-[10.5px]">{tunnelCount}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
