import type { JSX } from 'react';

import { useTranslator } from '../features/settings';

import { HoldButton } from './HoldButton';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';

interface CastGuardDialogProps {
  /** `null` while closed. Otherwise the names of every host the command reaches. */
  readonly hosts: readonly string[] | null;
  /** How many of them are in a production Space. */
  readonly production: number;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * Asks before one command reaches several hosts and some are in production.
 *
 * Every host is listed above the button, and the count is on the button. A
 * guard that can be held through without reading is only worth anything while
 * the list it guards is in front of you.
 */
export function CastGuardDialog({ hosts, production, onConfirm, onCancel }: CastGuardDialogProps): JSX.Element {
  const i18n = useTranslator();

  return (
    <Dialog open={hosts !== null} onClose={onCancel} title={i18n.t('spaces.guard.title')}>
      {hosts !== null && (
        <div className="flex flex-col gap-3">
          <p className="text-ink-secondary text-[12.5px] leading-relaxed">
            {i18n.t('spaces.guard.body', { count: String(hosts.length), production: String(production) })}
          </p>
          <ul className="border-line-subtle max-h-40 overflow-y-auto rounded border px-3 py-2 font-mono text-[12px]">
            {hosts.map((name, index) => (
              <li key={`${name}-${index}`} className="text-ink truncate">
                {name}
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onCancel}>
              {i18n.t('spaces.guard.cancel')}
            </Button>
            <HoldButton onComplete={onConfirm}>
              {i18n.t('spaces.guard.hold', { count: String(hosts.length) })}
            </HoldButton>
          </div>
          <p className="text-ink-faint text-[11px]">{i18n.t('spaces.guard.hint')}</p>
        </div>
      )}
    </Dialog>
  );
}
