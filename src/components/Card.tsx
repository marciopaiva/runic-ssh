import type { JSX } from 'react';

export interface CardProps {
  readonly title: string;
  /** Makes the whole card a button to `onClick`, labelled `label`. Absent for
   * a card that is not a way to somewhere else, like Appearance. */
  readonly onClick?: () => void;
  readonly label?: string;
  readonly children: JSX.Element | readonly (JSX.Element | false)[];
}

/**
 * One tile of the Home portal. Same border, background and padding
 * regardless of what it holds, so a card reads as a kind of thing rather
 * than one screen's own layout (#222). Shared rather than local to
 * `HomeDashboard.tsx`, where it used to live as the only caller.
 */
export function Card({ title, onClick, label, children }: CardProps): JSX.Element {
  const heading = <h2 className="text-ink text-[13px] font-semibold">{title}</h2>;

  const content = (
    <div className="border-line-subtle bg-surface-panel flex h-full flex-col gap-5 rounded border p-5 text-left">
      {heading}
      {children}
    </div>
  );

  if (onClick === undefined) return content;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="hover:border-line-strong rounded text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {content}
    </button>
  );
}
