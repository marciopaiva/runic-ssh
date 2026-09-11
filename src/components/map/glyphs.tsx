import type { JSX } from 'react';

import type { ComponentKind } from '../../ipc';

/**
 * The closed icons: each one is the object you get when it opens. A tilted
 * screen with a prompt for a terminal, a crate with an arrow for files, a
 * gauge for vitals. Drawn in the same glass the windows are made of, so an
 * icon and its window read as one thing at two sizes. The shapes were
 * settled with the maintainer in the prototype and are the ones
 * `design/canvas/gen.py` draws.
 *
 * Colours are the kind's token, read through the CSS variables so a theme
 * change repaints them; the glass gradient is the surface tokens.
 */

const EDGE = 'var(--rs-glass-edge-strong)';

function Defs(): JSX.Element {
  return (
    <defs>
      <linearGradient id="map-glass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--rs-surface-raised)" stopOpacity=".95" />
        <stop offset="1" stopColor="var(--rs-surface-panel)" stopOpacity=".95" />
      </linearGradient>
    </defs>
  );
}

export function kindColor(kind: ComponentKind): string {
  switch (kind) {
    case 'ssh':
      return 'var(--rs-accent)';
    case 'sftp':
      return 'var(--rs-state-warn)';
    case 'monitor':
      return 'var(--rs-brand-end)';
    case 'local':
      return 'var(--rs-state-warn)';
  }
}

interface GlyphProps {
  readonly kind: ComponentKind;
  readonly size?: number;
}

export function KindGlyph({ kind, size = 72 }: GlyphProps): JSX.Element {
  const color = kindColor(kind);
  const dim = 'var(--rs-border-strong)';
  const panel = 'var(--rs-surface-panel)';
  const raised = 'var(--rs-surface-raised)';
  return (
    <svg
      viewBox="0 0 72 72"
      width={size}
      height={size}
      style={{ overflow: 'visible', filter: 'drop-shadow(0 8px 14px var(--rs-map-shadow))' }}
      aria-hidden="true"
    >
      <Defs />
      {kind === 'ssh' && (
        <>
          <path className="map-glyph-edge" d="M15 19 L57 12 L57 47 L15 54 Z" fill="url(#map-glass)" stroke={EDGE} strokeWidth="1.2" />
          <path d="M15 19 L57 12" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M25 29 l6 5 -6 5" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="35" y="36" width="9" height="3.2" fill={color} />
          <path d="M31 54 L42 52 L44 60 L29 62 Z" fill={panel} stroke={dim} />
          <path d="M22 65 h28" stroke={dim} strokeWidth="1.4" strokeLinecap="round" />
        </>
      )}
      {kind === 'sftp' && (
        <>
          <path className="map-glyph-edge" d="M16 30 h40 v24 a4 4 0 0 1 -4 4 h-32 a4 4 0 0 1 -4 -4 z" fill="url(#map-glass)" stroke={EDGE} strokeWidth="1.2" />
          <path d="M12 22 h48 l-4 8 h-40 z" fill={raised} stroke={color} strokeOpacity=".7" strokeWidth="1.2" />
          <path d="M30 42 h12" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M36 8 v10 M31 13 l5 -5 5 5" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M22 62 h28" stroke={dim} strokeWidth="1.4" strokeLinecap="round" />
        </>
      )}
      {kind === 'local' && (
        /* The machine Runic runs on, a file browser like `sftp` (ADR-0065):
           a laptop, the one object on the map that is not somewhere else. */
        <>
          <path className="map-glyph-edge" d="M17 14 h38 a3 3 0 0 1 3 3 v27 h-44 v-27 a3 3 0 0 1 3 -3 z" fill="url(#map-glass)" stroke={EDGE} strokeWidth="1.2" />
          <path d="M14 17 h44" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M27 26 h7 l2 2 h9 v9 h-18 z" fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M9 50 h54 l4 8 h-62 z" fill={raised} stroke={color} strokeOpacity=".7" strokeWidth="1.2" />
          <path d="M30 54 h12" stroke={dim} strokeWidth="1.4" strokeLinecap="round" />
        </>
      )}
      {kind === 'monitor' && (
        <>
          <circle className="map-glyph-edge" cx="36" cy="38" r="24" fill="url(#map-glass)" stroke={EDGE} strokeWidth="1.2" />
          <path d="M19 48 A19 19 0 1 1 53 48" fill="none" stroke={dim} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M19 48 A19 19 0 0 1 36 19" fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M36 38 L46 27" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="36" cy="38" r="2.6" fill={color} />
          <path d="M24 66 h24" stroke={dim} strokeWidth="1.4" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

/** The map's centre: the mark on a glass disc with a still orbit. */
export function RuneGlyph({ size = 88 }: { readonly size?: number }): JSX.Element {
  return (
    <svg
      viewBox="0 0 88 88"
      width={size}
      height={size}
      style={{ overflow: 'visible', filter: 'drop-shadow(0 8px 14px var(--rs-map-shadow))' }}
      aria-hidden="true"
    >
      <Defs />
      <circle className="map-glyph-edge" cx="44" cy="44" r="40" fill="url(#map-glass)" stroke={EDGE} strokeWidth="1.2" />
      <circle cx="44" cy="44" r="33" fill="none" stroke="var(--rs-border-strong)" strokeWidth="1" strokeDasharray="2 4" />
      <circle cx="44" cy="11" r="2.2" fill="var(--rs-accent-bright)" />
      <g transform="translate(20 20) scale(2)">
        <circle cx="9.5" cy="12" r="7" stroke="var(--rs-brand-start)" strokeWidth="1.1" fill="none" />
        <circle cx="14.5" cy="12" r="7" stroke="var(--rs-brand-end)" strokeWidth="1.1" fill="none" />
        <path d="M12 6.5v11M12 10l3-2.5M12 14l3 2.5M12 12l-2.6-2.2" stroke="var(--rs-brand-rune)" strokeWidth="1.1" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
}

/**
 * A closed vision (ADR-0067): an aperture on the same glass as the rune,
 * six blades still, a disc at the centre for the count. `highlighted` is
 * the moment a dragged component would join it if dropped.
 */
export function ApertureGlyph({ size = 96, highlighted = false }: { readonly size?: number; readonly highlighted?: boolean }): JSX.Element {
  const blades = Array.from({ length: 6 }, (_, i) => {
    const a = (i * 60 * Math.PI) / 180;
    const b = ((i * 60 + 38) * Math.PI) / 180;
    return {
      x1: (48 + 34 * Math.cos(a)).toFixed(1),
      y1: (48 + 34 * Math.sin(a)).toFixed(1),
      x2: (48 + 20 * Math.cos(b)).toFixed(1),
      y2: (48 + 20 * Math.sin(b)).toFixed(1),
    };
  });
  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      style={{ overflow: 'visible', filter: 'drop-shadow(0 8px 14px var(--rs-map-shadow))' }}
      aria-hidden="true"
    >
      <Defs />
      <circle className="map-glyph-edge" cx="48" cy="48" r="44" fill="url(#map-glass)" stroke={highlighted ? 'var(--rs-glass-edge-hot)' : EDGE} strokeWidth="1.2" />
      <circle cx="48" cy="48" r="36" fill="none" stroke="var(--rs-border-strong)" strokeWidth="1" strokeDasharray="3 4" />
      {blades.map((blade, i) => (
        <line key={i} {...blade} stroke="var(--rs-accent)" strokeOpacity=".55" strokeWidth="1.6" strokeLinecap="round" />
      ))}
      <circle cx="48" cy="48" r="17" fill="var(--rs-surface-panel)" stroke={EDGE} strokeWidth="1" />
    </svg>
  );
}

/** The aperture at strip size, for a region's bar and the bar over a vision filling the screen. */
export function ApertureMark({ size = 14 }: { readonly size?: number }): JSX.Element {
  return (
    <svg viewBox="0 0 96 96" width={size} height={size} className="shrink-0" aria-hidden="true">
      <circle cx="48" cy="48" r="42" fill="none" stroke="var(--rs-accent)" strokeWidth="7" strokeDasharray="22 14" />
      <circle cx="48" cy="48" r="16" fill="var(--rs-accent)" />
    </svg>
  );
}

/**
 * The monolith (ADR-0068): a layer's own glass slab, a doorway icon and
 * the count of what it holds. `hub` draws it at the size it stands at when
 * the layer is entered, where the rune stands outside one; otherwise it is
 * the size the closed ring draws it at, a door among the components and
 * visions it shares the ring with.
 */
export function MonolithGlyph({ count, hub = false, highlighted = false }: { readonly count: number; readonly hub?: boolean; readonly highlighted?: boolean }): JSX.Element {
  const w = hub ? 100 : 78;
  const h = hub ? 132 : 108;
  const icon = hub ? 26 : 20;
  return (
    <div
      style={{
        position: 'relative',
        width: w,
        height: h,
        borderRadius: 6,
        background: 'linear-gradient(170deg, var(--rs-surface-raised), var(--rs-surface-panel))',
        border: `1px solid ${highlighted ? 'var(--rs-glass-edge-hot)' : 'var(--rs-glass-edge-strong)'}`,
        boxShadow: 'inset 0 1px 0 var(--rs-glass-top), var(--rs-shadow-3)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 10,
          right: 10,
          top: 0,
          height: 2,
          borderRadius: '0 0 2px 2px',
          background: 'linear-gradient(90deg, transparent, var(--rs-accent-bright), transparent)',
          opacity: 0.7,
        }}
      />
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--rs-accent)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: icon, height: icon }} aria-hidden="true">
        <path d="M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16" />
        <path d="M9 21v-6h6v6" />
        <path d="M2 21h20" />
      </svg>
      <span className="mono" style={{ fontSize: 10.5, color: 'var(--rs-text-faint)' }}>
        {count}
      </span>
    </div>
  );
}
