import type { JSX } from 'react';

interface MacroGlyphProps {
  readonly className: string;
}

/**
 * The macro glyph: a window holding a code bracket, drawn wherever "this is
 * about a saved macro" is answered, currently just the toolbar's own
 * `MacrosButton`. Its own component rather than inlined there, the same
 * reasoning `BroadcastGlyph` follows for "does this receive a broadcast",
 * so a second place that needs it draws the same shape.
 */
export function MacroGlyph({ className }: MacroGlyphProps): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.5" y="2.5" width="13" height="11" rx="1.3" />
        <path d="M6.3 6.3L4.3 8l2 1.7" />
        <path d="M9.7 6.3l2 1.7-2 1.7" />
      </g>
    </svg>
  );
}
