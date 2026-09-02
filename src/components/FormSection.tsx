import type { JSX, ReactNode } from 'react';

interface FormSectionProps {
  readonly title: string;
  readonly children: ReactNode;
}

/**
 * A bordered, titled group of fields.
 *
 * ADR-0056: once the host editor stopped being two navigable steps and
 * became General, Topology and Access all on screen at once, four topics
 * with nothing but a heading between them read as one loose,
 * undifferentiated form. A thin border and a little padding gives each its
 * own quiet boundary, `HomeBookProposal.dc.html`'s own `section()` drawn in
 * code rather than reinvented, without bringing back the heavier
 * `dashboard_card` rounding #237 already moved this screen away from.
 */
export function FormSection({ title, children }: FormSectionProps): JSX.Element {
  return (
    <div className="border-line-subtle flex flex-col gap-3 rounded-md border p-4">
      <span className="text-ink-faint text-[10px] font-bold tracking-[0.09em] uppercase">
        {title}
      </span>
      {children}
    </div>
  );
}
