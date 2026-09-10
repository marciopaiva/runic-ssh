import type { ReactNode } from 'react';
import { Popover } from '@headlessui/react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/classnames';

export interface TooltipProps {
  readonly content: ReactNode;
  readonly children: ReactNode;
  readonly side?: 'top' | 'bottom' | 'left' | 'right';
  readonly className?: string;
}

const SIDE_CLASSES: Record<NonNullable<TooltipProps['side']>, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

export function Tooltip({
  content,
  children,
  side = 'top',
  className,
}: TooltipProps) {
  return (
    /* No `Popover.Group`: it exists to tie several popovers together and
       Headless UI hands it a ref, which a Fragment cannot take; rendering
       one this way threw "Passing props on Fragment" and took the whole
       tree down with it. The popover's own element is the positioning
       context the panel needs. */
    <Popover className="relative inline-flex">
        <Popover.Button as="span">
          {children}
        </Popover.Button>

        <Popover.Panel
          className={cn(
            'absolute z-tooltip px-2.5 py-1.5 text-[11px] font-medium text-ink',
            'bg-surface-raised border border-line-subtle rounded-md shadow-3',
            'whitespace-nowrap pointer-events-none',
            SIDE_CLASSES[side],
            className,
          )}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: side === 'top' ? 4 : side === 'bottom' ? -4 : 0, x: side === 'left' ? 4 : side === 'right' ? -4 : 0 }}
            animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.1, ease: [0.4, 0, 0.2, 1] }}
          >
            {content}
            <motion.div
              className={cn(
                'absolute w-0 h-0 border-4 border-transparent',
                side === 'top' && 'bottom-[-8px] left-1/2 -translate-x-1/2 border-t-surface-raised',
                side === 'bottom' && 'top-[-8px] left-1/2 -translate-x-1/2 border-b-surface-raised',
                side === 'left' && 'right-[-8px] top-1/2 -translate-y-1/2 border-l-surface-raised',
                side === 'right' && 'left-[-8px] top-1/2 -translate-y-1/2 border-r-surface-raised',
              )}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
          </motion.div>
        </Popover.Panel>
    </Popover>
  );
}
