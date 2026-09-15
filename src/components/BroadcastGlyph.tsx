import type { JSX, SVGProps } from 'react';

interface BroadcastGlyphProps extends SVGProps<SVGSVGElement> {
  readonly className: string;
  /** A bar across it: this window spared itself (ADR-0065). Struck rather
      than faded, because a decision a person has to find again should not
      be the dimmest thing in the strip. */
  readonly struck?: boolean;
}

/**
 * The broadcast glyph, drawn wherever "does this receive a broadcast" is
 * answered: the Sessions toolbar's `BroadcastButton`, a destination pane's
 * own receive toggle (ADR-0047), the group strip's own `SyncToggle`, and a
 * session row's own marker for "this one is in the group currently armed."
 * One shape for the question everywhere it is asked, told apart only by
 * colour, rather than a second shape that would also mean "is this
 * receiving."
 *
 * Presentational by default (`aria-hidden`); `...rest` lets a caller with no
 * labelled parent to lean on, like the session row marker, override that
 * with `role="img"` and its own `aria-label`.
 */
export function BroadcastGlyph({ className, struck = false, ...rest }: BroadcastGlyphProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true" {...rest}>
      <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
      <path d="M12 21v-6.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9 9a4 4 0 0 0 0 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M6 6a8 8 0 0 0 0 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M15 9a4 4 0 0 1 0 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M18 6a8 8 0 0 1 0 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      {struck && <path d="M5 5 L19 19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  );
}
