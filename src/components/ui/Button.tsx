import { forwardRef, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/classnames';

export interface ButtonProps {
  readonly variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'link';
  readonly size?: 'sm' | 'md' | 'lg' | 'icon';
  readonly loading?: boolean;
  readonly leftIcon?: ReactNode;
  readonly rightIcon?: ReactNode;
  readonly fullWidth?: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
  readonly onClick?: () => void;
  readonly type?: 'button' | 'submit' | 'reset';
  readonly title?: string;
  readonly 'aria-label'?: string;
  readonly 'aria-pressed'?: boolean;
}

const VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-accent text-surface-base hover:bg-accent-bright active:bg-accent/80 focus:ring-accent',
  secondary: 'bg-surface-raised text-ink hover:bg-surface-overlay active:bg-surface-input focus:ring-line-strong',
  ghost: 'bg-transparent text-ink-secondary hover:bg-surface-raised active:bg-surface-overlay focus:ring-line-strong',
  danger: 'bg-danger text-surface-base hover:bg-danger-text active:bg-danger/80 focus:ring-danger',
  outline: 'bg-transparent border border-line-strong text-ink-secondary hover:bg-surface-raised active:bg-surface-overlay focus:ring-line-strong',
  link: 'bg-transparent text-accent hover:underline focus:ring-accent',
};

const SIZES: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-2.5 py-1 text-[11px] gap-1.5',
  md: 'px-3.5 py-1.5 text-[12.5px] gap-2',
  lg: 'px-5 py-2 text-[13.5px] gap-2.5',
  /* No padding: a caller pins the box to an exact `h-* w-*` for a bare icon,
     and `sm`'s padding alone (20px) exceeded that box, shrinking the icon's
     overflow-hidden span to zero width and rendering it as fully invisible.
     Also the right base for a `variant="link"` text button, which wants its
     own inline spacing rather than a button's padding. */
  icon: 'p-0',
};

const HOVER_VARIANTS: Record<'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'link', { scale: number }> = {
  primary: { scale: 1.01 },
  secondary: { scale: 1.01 },
  ghost: { scale: 1.0 },
  danger: { scale: 1.01 },
  outline: { scale: 1.01 },
  link: { scale: 1.0 },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      className,
      children,
      onClick,
      type = 'button',
      title,
      'aria-label': ariaLabel,
      'aria-pressed': ariaPressed,
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    return (
      <motion.button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading}
        aria-disabled={isDisabled}
        aria-label={ariaLabel}
        aria-pressed={ariaPressed}
        className={cn(
          'inline-flex items-center justify-center font-semibold rounded-md',
          'transition-colors duration-fast easing-standard',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          VARIANTS[variant],
          SIZES[size],
          fullWidth && 'w-full',
          className,
        )}
        whileTap={{ scale: 0.97 }}
        whileHover={HOVER_VARIANTS[variant]}
        onClick={onClick}
        title={title}
      >
        {loading ? (
          <svg
            className="h-4 w-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="31.4 31.4"
            />
          </svg>
        ) : (
          <>
            {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
            <span className="truncate">{children}</span>
            {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
          </>
        )}
      </motion.button>
    );
  },
);

Button.displayName = 'Button';