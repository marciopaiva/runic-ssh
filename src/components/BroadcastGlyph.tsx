import type { JSX } from 'react';

interface BroadcastGlyphProps {
  readonly className: string;
}

/**
 * The broadcast glyph, drawn wherever "does this receive a broadcast" is
 * answered: the Sessions toolbar's `BroadcastButton`, and a destination
 * pane's own receive toggle (ADR-0047). One shape for the question
 * everywhere it is asked, told apart only by colour, rather than a second
 * shape that would also mean "is this receiving." `SyncToggle.tsx` still
 * draws its own pill-and-knob switch; ADR-0046's follow-up tracks moving it
 * to this glyph too.
 */
export function BroadcastGlyph({ className }: BroadcastGlyphProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none" />
      <path d="M8 15.5a5.5 5.5 0 0 1 8 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M4.5 12a10 10 0 0 1 15 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
