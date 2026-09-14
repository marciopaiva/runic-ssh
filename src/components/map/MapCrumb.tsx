import type { JSX } from 'react';

import { useTranslator } from '../../features/settings';
import { Kbd } from '../ui/Kbd';
import { MapIcon } from '../ui/icons';

interface MapCrumbProps {
  /** `segments[0]` is always the root; drawn as the rail's own Map glyph
      rather than its name, since the crumb's root is the map itself and
      the rail already names it that way. The book that used to sit here
      was `ActivityRail`'s Home glyph, which reads as Hosts in this
      toolbar rather than as the map's own front door. */
  readonly segments: readonly string[];
  /** Present a level in: a layer entered, or a vision filling the screen
      (ADR-0067, ADR-0068). Does what Escape already does. */
  readonly onBack?: () => void;
}

/** The glyph `ActivityRail`'s own Map slot draws, at crumb size. */
function RootGlyph(): JSX.Element {
  return <MapIcon className="h-3.5 w-3.5" />;
}

/**
 * The map's own place in the shared toolbar (ADR-0069): where the crumb
 * used to sit in a second bar under it. One level today; a layer entered
 * grows it the same way a vision filling the screen does (ADR-0067,
 * ADR-0068).
 */
export function MapCrumb({ segments, onBack }: MapCrumbProps): JSX.Element {
  const i18n = useTranslator();
  const root = segments[0] ?? i18n.t('map.crumb.root');
  const rest = segments.slice(1);

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span title={root} aria-label={root} className={rest.length === 0 ? 'text-ink flex items-center' : 'text-ink-muted flex items-center'}>
        <RootGlyph />
      </span>
      {rest.map((name, i) => (
        <span key={`${name}-${String(i)}`} className="flex items-center gap-1.5">
          <span className="text-ink-faint text-[12px]" aria-hidden="true">
            &rsaquo;
          </span>
          <span className={i === rest.length - 1 ? 'text-ink text-[12px] font-semibold' : 'text-ink-muted text-[12px]'}>{name}</span>
        </span>
      ))}
      {onBack !== undefined && (
        <Kbd
          onClick={onBack}
          title={i18n.t('map.crumb.back')}
          aria-label={i18n.t('map.crumb.back')}
          className="text-ink-faint hover:text-ink ml-1"
        >
          Esc
        </Kbd>
      )}
    </span>
  );
}
