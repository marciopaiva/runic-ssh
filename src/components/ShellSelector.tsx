import type { JSX } from 'react';

import { useTranslator } from '../features/settings';
import type { Shell } from '../ipc';

interface ShellSelectorProps {
  readonly shell: Shell;
  readonly onChoose: (shell: Shell) => void;
}

function ClassicGlyph({ className }: { readonly className: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="7" height="7" rx="1" />
      <rect x="14" y="4" width="7" height="7" rx="1" />
      <rect x="3" y="15" width="7" height="5" rx="1" />
      <rect x="14" y="15" width="7" height="5" rx="1" />
    </svg>
  );
}

function MapGlyph({ className }: { readonly className: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="6" r="2.4" />
      <circle cx="5.5" cy="17" r="2.4" />
      <circle cx="18.5" cy="17" r="2.4" />
      <path d="M10.6 8.2l-3.7 6.4M13.4 8.2l3.7 6.4M8 17h8" />
    </svg>
  );
}

/**
 * The toolbar's shell switch, classic or the map (ADR-0069): a fresh
 * install never renders this at all, since it lives behind the preview
 * setting the same way the rail slot it replaces did (ADR-0066).
 *
 * One button, not two, and not `ThemeFold`'s pattern of folding several
 * choices behind a popup: `shell` is a plain two-state choice like
 * `BroadcastButton`'s own arm/disarm, so it gets that shape instead,
 * found comparing the two directly the way `ThemeLanguageControls`'
 * own history records doing once already. A fold that opened to show
 * one alternative would cost a click to see the only other option;
 * what this shows at rest is the shell that is in front, and the click
 * it offers is the switch, the same as the broadcast switch reads
 * "on" or "off" without a menu to open first.
 */
export function ShellSelector({ shell, onChoose }: ShellSelectorProps): JSX.Element {
  const i18n = useTranslator();
  const onMap = shell === 'map';
  const label = i18n.t(onMap ? 'shell.switch.toClassic' : 'shell.switch.toMap');
  const Glyph = onMap ? MapGlyph : ClassicGlyph;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={onMap}
      onClick={() => onChoose(onMap ? 'classic' : 'map')}
      aria-label={label}
      title={label}
      className="text-ink-muted hover:text-ink hover:bg-surface-raised/60 flex h-6 shrink-0 items-center gap-1.5 rounded px-2 text-[11px] font-semibold"
    >
      <Glyph className="h-3.5 w-3.5" />
      {i18n.t(onMap ? 'shell.current.map' : 'shell.current.classic')}
    </button>
  );
}
