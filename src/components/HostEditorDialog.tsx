import type { JSX, ReactNode } from 'react';

import { Dialog } from './ui/Dialog';

interface HostEditorDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/**
 * The host editor (ADR-0072), promoted out of the Home screen it used to
 * live inside so it can open over whatever workspace asked for it: the
 * host book palette, or `SessionBody.onEditHost` from inside a session
 * that no longer has to leave to get there.
 */
export function HostEditorDialog({ open, onClose, children }: HostEditorDialogProps): JSX.Element {
  return (
    /* No `title` here: the wrapped `SessionWizard` already draws its own,
       and `Dialog` drawing a second one is the exact duplication its
       `AlertDialog` sibling already had to back out of once (ADR-0065). */
    <Dialog open={open} onClose={onClose} size="full">
      <div className="max-h-[min(85vh,760px)] overflow-y-auto">{children}</div>
    </Dialog>
  );
}
