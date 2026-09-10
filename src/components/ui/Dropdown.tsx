import { Fragment, type ReactNode } from 'react';
import { Menu, Transition } from '@headlessui/react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/classnames';
import { ChevronDownIcon } from './icons';

export interface DropdownOption {
  readonly value: string;
  readonly label: ReactNode;
  readonly icon?: ReactNode;
  readonly disabled?: boolean;
  readonly danger?: boolean;
  readonly dividerAfter?: boolean;
}

export interface DropdownProps {
  readonly options: readonly DropdownOption[];
  readonly value?: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: ReactNode;
  readonly leftIcon?: ReactNode;
  readonly rightIcon?: ReactNode;
  readonly disabled?: boolean;
  readonly fullWidth?: boolean;
  readonly className?: string;
  readonly buttonClassName?: string;
  readonly panelClassName?: string;
}

function DropdownButton({
  placeholder,
  leftIcon,
  rightIcon,
  disabled,
  fullWidth,
  className,
  buttonClassName,
  value: _value,
}: {
  readonly placeholder?: ReactNode;
  readonly leftIcon?: ReactNode;
  readonly rightIcon?: ReactNode;
  readonly disabled?: boolean;
  readonly fullWidth?: boolean;
  readonly className?: string;
  readonly buttonClassName?: string;
  readonly value?: string;
}) {
  return (
    <motion.button
      type="button"
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-between gap-2 px-3 py-2 text-[12.5px] font-medium rounded-md',
        'bg-surface-input border border-line-subtle',
        'text-ink-secondary placeholder:text-ink-faint',
        'hover:bg-surface-raised hover:border-line-strong',
        'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface-base',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'transition-all duration-fast easing-standard',
        fullWidth && 'w-full',
        className,
        buttonClassName,
      )}
      whileTap={{ scale: 0.98 }}
      whileHover={{ scale: 1.01 }}
    >
      {leftIcon && <span className="flex-shrink-0 text-ink-faint">{leftIcon}</span>}
      <span className="truncate flex-1 text-left">{placeholder}</span>
      {rightIcon ? (
        <span className="flex-shrink-0 text-ink-faint">{rightIcon}</span>
      ) : (
        <ChevronDownIcon className="flex-shrink-0 h-4 w-4 text-ink-faint" />
      )}
    </motion.button>
  );
}

function DropdownOptionItem({
  option,
  isSelected,
  onSelect,
}: {
  readonly option: DropdownOption;
  readonly isSelected: boolean;
  readonly onSelect: () => void;
}) {
  const { value: _value, label, icon, disabled, danger, dividerAfter } = option;

  return (
    <>
      <Menu.Item as={Fragment}>
        {({ active }) => (
          <motion.button
            type="button"
            disabled={disabled}
            onClick={onSelect}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 text-[12.5px] text-left',
              'transition-colors duration-fast easing-standard',
              'focus:outline-none',
              disabled
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:bg-surface-raised',
              isSelected && 'bg-accent/10 text-accent',
              danger && 'text-danger hover:bg-danger-soft',
              active && !disabled && 'bg-surface-raised',
            )}
            whileTap={{ scale: 0.99 }}
            style={{ outline: 'none' }}
          >
            {icon && <span className="flex-shrink-0 h-4 w-4">{icon}</span>}
            <span className="truncate flex-1">{label}</span>
            {isSelected && (
              <svg className="flex-shrink-0 h-4 w-4 text-accent" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M13.5 3.5 5 12 2.5 9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </motion.button>
        )}
      </Menu.Item>
      {dividerAfter && (
        <div className="border-t border-line-subtle my-1" role="separator" />
      )}
    </>
  );
}

export function Dropdown(props: DropdownProps) {
  return (
    <Menu as="div" className={cn('relative inline-flex', props.fullWidth && 'w-full', props.className)}>
      <Menu.Button as={DropdownButton}>
        {props.options.find((o) => o.value === props.value)?.label ?? props.placeholder}
      </Menu.Button>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="opacity-0 scale-95 transform"
        enterTo="opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="opacity-100 scale-100"
        leaveTo="opacity-0 scale-95"
      >
        <Menu.Items
          className={cn(
            'absolute z-dropdown mt-1.5 min-w-[200px] max-h-60 overflow-y-auto',
            'bg-surface-raised border border-line-subtle rounded-md shadow-4',
            'py-1 ring-1 ring-line-subtle/50',
            'focus:outline-none',
            props.panelClassName,
          )}
        >
          {props.options.map((option, index) => (
            <DropdownOptionItem
              key={option.value || index}
              option={option}
              isSelected={option.value === props.value}
              onSelect={() => !option.disabled && props.onChange(option.value)}
            />
          ))}
        </Menu.Items>
      </Transition>
    </Menu>
  );
}