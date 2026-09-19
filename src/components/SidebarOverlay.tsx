import { Fragment, type ReactNode, useEffect, useRef } from 'react';
import { Transition } from '@headlessui/react';

export interface SidebarOverlayProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The sidebar summoned as a floating card over a full-bleed workspace
 * (ADR-0071 Option B), rather than `Dialog`'s centered modal: anchored to
 * the content row's own box, not the viewport, so the rail stays visible
 * beside it and the workspace behind it keeps reading as the same screen,
 * dimmed rather than blocked.
 *
 * Built on `Transition`/`Transition.Child` rather than `Dialog.tsx`'s own
 * `HeadlessDialog`: `Dialog` always renders through a Portal to the end of
 * `document.body` (confirmed against `@headlessui/react`'s own source,
 * `portal.js`), which would place the panel outside the `relative` content
 * row it needs `top`/`bottom`/`left` to be measured against, and turn `top:
 * 12px` back into "12px from the very top of the window." `Transition`
 * carries none of that: it only drives the enter/leave classes, so the panel
 * stays exactly where this component is mounted, which is where the anchor
 * needs it. Focus-trap, initial focus and Escape/outside-click close are
 * what `Dialog` would otherwise have supplied for free; kept here by hand,
 * scoped to `open`, so they exist without pulling the portal in with them.
 */
export function SidebarOverlay({ open, onClose, children }: SidebarOverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);
  /* `onClose` is a fresh closure on most parent renders (App.tsx passes an
     inline arrow), and this app re-renders often behind an open overlay
     (live session state, broadcast fan-out). Reading it through a ref keeps
     the effect below keyed on `open` alone, so a parent render never repeats
     the steal-initial-focus setup and yanks focus out of, say, the filter
     input a person is mid-keystroke in. */
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    restoreFocusTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || panel === null) return;

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const last = focusable[focusable.length - 1]!;
      const firstItem = focusable[0]!;

      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      restoreFocusTo.current?.focus();
    };
  }, [open]);

  return (
    <Transition show={open} appear as={Fragment}>
      <Transition.Child
        as={Fragment}
        enter="transition-opacity duration-200 ease-out"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="transition-opacity duration-150 ease-in"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <div className="absolute inset-0 z-modal bg-black/35" aria-hidden="true" onClick={onClose} />
      </Transition.Child>

      <Transition.Child
        as={Fragment}
        enter="transition ease-out duration-200"
        enterFrom="opacity-0 -translate-x-2"
        enterTo="opacity-100 translate-x-0"
        leave="transition ease-in duration-150"
        leaveFrom="opacity-100 translate-x-0"
        leaveTo="opacity-0 -translate-x-2"
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          className="border-line-subtle bg-[var(--rs-glass-panel)] shadow-5 backdrop-blur-[var(--glass-blur)] absolute top-3 bottom-3 left-3 z-modal flex w-[280px] flex-col overflow-hidden rounded-lg border outline-none"
        >
          {children}
        </div>
      </Transition.Child>
    </Transition>
  );
}
