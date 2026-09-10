import { Fragment, type ReactNode, useRef } from 'react';
import { Dialog as HeadlessDialog, Transition } from '@headlessui/react';
import { cn } from '../../lib/classnames';
import { XIcon } from './icons';

export interface DialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title?: ReactNode;
  readonly description?: ReactNode;
  readonly children: ReactNode;
  readonly size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  readonly showCloseButton?: boolean;
  readonly closeOnOverlayClick?: boolean;
  readonly className?: string;
}

const SIZES: Record<NonNullable<DialogProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-4xl',
};

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
  showCloseButton = true,
  closeOnOverlayClick = true,
  className,
}: DialogProps) {
  const dialogRef = useRef<HTMLElement>(null);

  return (
    <HeadlessDialog open={open} onClose={onClose}>
      <Transition.Child
        as={Fragment}
        enter="transition-opacity duration-200 ease-out"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="transition-opacity duration-150 ease-in"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <div
          className="fixed inset-0 z-modal bg-black/50 backdrop-blur-sm"
          aria-hidden="true"
          onClick={closeOnOverlayClick ? onClose : undefined}
        />
      </Transition.Child>

      <Transition.Child
        as={Fragment}
        enter="transition ease-out duration-200"
        enterFrom="opacity-0 scale-95 translate-y-4"
        enterTo="opacity-100 scale-100 translate-y-0"
        leave="transition ease-in duration-150"
        leaveFrom="opacity-100 scale-100 translate-y-0"
        leaveTo="opacity-0 scale-95 translate-y-4"
      >
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
          <HeadlessDialog.Panel
            ref={dialogRef}
            className={cn(
              'relative w-full bg-surface-raised border border-line-subtle rounded-xl shadow-5',
              'overflow-hidden',
              SIZES[size],
              className,
            )}
          >
            {(title || showCloseButton) && (
              <div className="flex items-start justify-between gap-4 p-4 border-b border-line-subtle">
                <div className="flex-1 min-w-0">
                  {title && (
                    <HeadlessDialog.Title
                      as="h2"
                      className="text-ink font-semibold text-[14px]"
                    >
                      {title}
                    </HeadlessDialog.Title>
                  )}
                  {description && (
                    <HeadlessDialog.Description className="mt-1 text-ink-muted text-[12px]">
                      {description}
                    </HeadlessDialog.Description>
                  )}
                </div>
                {showCloseButton && (
                  <button
                    type="button"
                    onClick={onClose}
                    className={cn(
                      'flex-shrink-0 p-1.5 rounded-md text-ink-faint',
                      'hover:text-ink hover:bg-surface-overlay',
                      'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface-base',
                      'transition-colors duration-fast easing-standard',
                    )}
                    aria-label="Close"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
            <div className={cn('p-4', !title && 'pt-4')}>
              {children}
            </div>
          </HeadlessDialog.Panel>
        </div>
      </Transition.Child>
    </HeadlessDialog>
  );
}

export interface AlertDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly confirmText?: ReactNode;
  readonly cancelText?: ReactNode;
  readonly variant?: 'danger' | 'primary';
  readonly loading?: boolean;
}

export function AlertDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  loading = false,
}: AlertDialogProps) {
  return (
    /* The title and the description are drawn once, in the body beside the
       icon; handed to `Dialog` as well they were drawn twice, which the
       map's first use of this found (ADR-0065). */
    <Dialog open={open} onClose={onClose} size="sm" showCloseButton={false}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className={cn(
              'flex-shrink-0 p-2 rounded-full',
              variant === 'danger' ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-accent',
            )}>
              {variant === 'danger' ? (
                <WarningIcon className="h-5 w-5" />
              ) : (
                <InfoIcon className="h-5 w-5" />
              )}
            </div>
            <div className="text-ink font-medium text-[13px]">{title}</div>
          </div>
          {description && (
            <p className="text-ink-muted text-[12px] ml-10">{description}</p>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={loading}
          >
            {cancelText}
          </Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

import { Button } from './Button';
import { WarningIcon, InfoIcon } from './icons';