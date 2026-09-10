import { forwardRef, type ChangeEvent, type ReactNode, useId, useRef, useState } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '../../lib/classnames';

export interface InputProps extends Omit<HTMLMotionProps<'input'>, 'children' | 'size' | 'onChange'> {
  readonly label?: string;
  readonly error?: string;
  readonly helperText?: string;
  readonly leftIcon?: ReactNode;
  readonly rightIcon?: ReactNode;
  readonly characterCount?: number;
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onChange?: (value: string) => void;
  readonly fullWidth?: boolean;
  readonly size?: 'sm' | 'md' | 'lg';
}

const SIZES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'px-2.5 py-1.5 text-[11.5px]',
  md: 'px-3 py-2 text-[12.5px]',
  lg: 'px-4 py-2.5 text-[13.5px]',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      leftIcon,
      rightIcon,
      characterCount,
      fullWidth = false,
      size = 'md',
      className,
      id: providedId,
      value,
      defaultValue,
      onChange: onChangeProp,
      disabled,
      required,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const id = providedId || generatedId;
    const errorId = `${id}-error`;
    const helperId = `${id}-helper`;
    const [isFocused, setIsFocused] = useState(false);
    const [hasValue, setHasValue] = useState(!!(value ?? defaultValue));
    const inputRef = useRef<HTMLInputElement>(null);

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
      const newValue = event.target.value;
      setHasValue(!!newValue);
      onChangeProp?.(newValue);
    };

    const handleFocus = () => setIsFocused(true);
    const handleBlur = () => setIsFocused(false);

    const combinedRef = (el: HTMLInputElement | null) => {
      inputRef.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) ref.current = el;
    };

    const describedBy = [error && errorId, helperText && helperId].filter(Boolean).join(' ') || undefined;

    return (
      <div className={cn('relative flex flex-col gap-1.5', fullWidth && 'w-full')}>
        {label && (
          <motion.label
            htmlFor={id}
            className={cn(
              'text-[11px] font-medium text-ink-secondary transition-all duration-fast easing-standard',
              'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 origin-left',
              'peer-placeholder-shown:scale-100 peer-focus:scale-75 peer-focus:-translate-y-3 peer-focus:text-accent',
              'peer-[:not(:placeholder-shown)]:scale-75 peer-[:not(:placeholder-shown)]:-translate-y-3',
              'peer-disabled:opacity-50',
              hasValue && 'scale-75 -translate-y-3',
              isFocused && !hasValue && 'scale-75 -translate-y-3 text-accent',
            )}
          >
            {label}
            {required && <span className="text-danger ml-0.5" aria-hidden="true">*</span>}
          </motion.label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none">
              {leftIcon}
            </div>
          )}
          <motion.input
            ref={combinedRef}
            id={id}
            className={cn(
              'bg-surface-input border rounded-md font-mono placeholder:text-ink-faint',
              'transition-all duration-fast easing-standard',
              'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface-base',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              leftIcon ? 'pl-9' : undefined,
              rightIcon ? 'pr-9' : undefined,
              label ? 'pt-3 pb-1' : undefined,
              SIZES[size],
              error
                ? 'border-danger focus:ring-danger'
                : 'border-line-subtle focus:border-line-strong focus:ring-accent',
              className,
            )}
            disabled={disabled}
            required={required}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            placeholder={label ? ' ' : undefined}
            value={value}
            defaultValue={defaultValue}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            whileFocus={{ scale: 1.002 }}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none">
              {rightIcon}
            </div>
          )}
          {characterCount !== undefined && value !== undefined && (
            <span className="absolute right-2 bottom-1.5 text-[10px] text-ink-faint font-mono">
              {value.length}/{characterCount}
            </span>
          )}
        </div>
        {error && (
          <motion.p
            id={errorId}
            role="alert"
            className="text-[11px] text-danger flex items-center gap-1"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.1 }}
          >
            <svg className="h-3 w-3 flex-shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M8 1.8 1.5 13.2h13L8 1.8ZM8 6.2v3.4M8 11.4h.01"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {error}
          </motion.p>
        )}
        {helperText && !error && (
          <p id={helperId} className="text-[11px] text-ink-faint">
            {helperText}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';