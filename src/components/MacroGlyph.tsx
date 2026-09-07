import type { JSX } from 'react';

interface MacroGlyphProps {
  readonly className: string;
}

/**
 * The macro glyph: a small terminal window with a prompt arrow, drawn
 * wherever "this is about a saved macro" is answered — the toolbar's own
 * `MacrosButton` and `MacroConfirm`'s icon. One shape for the concept
 * everywhere it appears, the same reasoning `BroadcastGlyph` already
 * follows for "does this receive a broadcast."
 */
export function MacroGlyph({ className }: MacroGlyphProps): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path
        d="M2.5 3.5h11v9h-11z M5 6.5l2 1.8-2 1.8M8.5 10.2h2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
