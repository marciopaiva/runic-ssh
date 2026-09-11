import type { JSX } from 'react';

import type { WindowAction, WindowControl } from '../features/chrome';
import { useTranslator } from '../features/settings';
import { Button } from './ui/Button';
import { cn } from '../lib/classnames';

/** The glyph for each control, drawn on a 10×10 grid so the strokes align. */
function Glyph({ action }: { readonly action: WindowAction }): JSX.Element {
  return (
    <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" aria-hidden="true">
      {action === 'minimize' && <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />}

      {action === 'maximize' && (
        <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" />
      )}

      {action === 'restore' && (
        <>
          <path d="M2.5 2.5V0.5h7v7h-2" stroke="currentColor" strokeWidth="1" />
          <rect x="0.5" y="2.5" width="7" height="7" stroke="currentColor" strokeWidth="1" />
        </>
      )}

      {action === 'close' && (
        <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" strokeWidth="1" />
      )}
    </svg>
  );
}

/**
 * The minimise, maximise and close buttons.
 *
 * Renders nothing on a platform whose system draws its own — the list arrives
 * empty and the strip disappears with it, rather than this component knowing
 * which platform that is.
 *
 * The buttons run flush to the top and trailing edges deliberately. A maximised
 * window puts the close button in the screen corner, where it can be hit by
 * throwing the pointer at it; a margin of even one pixel takes that away.
 */
export function WindowControls({ controls, onAct }: { readonly controls: readonly WindowControl[]; readonly onAct: (action: WindowAction) => void }): JSX.Element | null {
  const i18n = useTranslator();

  if (controls.length === 0) return null;

  return (
    <div className="flex shrink-0 self-stretch">
      {controls.map((control) => (
        <Button
          key={control.action}
          /* Ghost at rest for all three, the close one turning red under
             the pointer: the Windows convention, and what the canvas draws.
             ADR-0063's adoption put close on the danger variant, which is
             red at rest, and the hover below had nothing left to do. */
          variant="ghost"
          size="sm"
          onClick={() => onAct(control.action)}
          aria-label={i18n.t(control.label)}
          title={i18n.t(control.label)}
          className={cn(
            'w-[46px]',
            control.destructive && 'hover:bg-danger hover:text-surface-base',
          )}
        >
          <Glyph action={control.action} />
        </Button>
      ))}
    </div>
  );
}