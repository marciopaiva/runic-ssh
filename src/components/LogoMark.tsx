import type { JSX, SVGProps } from 'react';

interface LogoMarkProps extends SVGProps<SVGSVGElement> {
  readonly className: string;
  /** The rune's own stroke, kept apart from the ring width because the two
      circles carry the mark's shape and can stay thin at any size, while the
      rune needs to thicken as the mark shrinks or it disappears first. */
  readonly strokeWidth?: number;
}

/**
 * The two overlapping rings and the rune between them, drawn wherever the
 * mark appears beside its own name rather than as `assets/logo.png`: the
 * titlebar and the empty-panel placeholder. Inline rather than the image so
 * it tints through `--rs-brand-*` in both themes instead of shipping a
 * second asset per theme.
 *
 * Presentational by default (`aria-hidden`), since every caller so far sits
 * beside the app's own name in text; `...rest` lets the titlebar override
 * that with `role="img"` where the mark is the only thing naming the window.
 */
export function LogoMark({ className, strokeWidth = 1.2, ...rest }: LogoMarkProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true" {...rest}>
      <circle cx="9.5" cy="12" r="7" className="stroke-brand-start" strokeWidth={strokeWidth} />
      <circle cx="14.5" cy="12" r="7" className="stroke-brand-end" strokeWidth={strokeWidth} />
      <path
        d="M12 6.5v11M12 10l3-2.5M12 14l3 2.5M12 12l-2.6-2.2"
        className="stroke-brand-rune"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}
