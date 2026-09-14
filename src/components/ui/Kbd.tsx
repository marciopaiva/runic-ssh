import type { JSX, ReactNode } from 'react';

import { cn } from '../../lib/classnames';

interface KbdProps {
  readonly children: ReactNode;
  readonly className?: string;
  /** Present only where the key is also a shortcut this renders as a button
      for: the map's own "press Escape" banner doubles as a cancel control,
      so it is a `<button>` there and a plain `<kbd>` everywhere else that
      only reports what the key is. */
  readonly onClick?: () => void;
  readonly 'aria-label'?: string;
  readonly title?: string;
}

/**
 * A single keyboard key, drawn the way every status bar and hint in the app
 * shows one: a thin border, tight padding, monospace. One recipe rather than
 * three copies of it, so a change to how a key looks is a change to one file.
 */
export function Kbd({ children, className, onClick, ...rest }: KbdProps): JSX.Element {
  const classes = cn('border-line-strong rounded-[3px] border px-1 py-[1px] font-mono text-[10px]', className);

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes} {...rest}>
        {children}
      </button>
    );
  }

  return (
    <kbd className={classes} {...rest}>
      {children}
    </kbd>
  );
}
