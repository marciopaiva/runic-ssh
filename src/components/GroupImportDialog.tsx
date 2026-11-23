import { useState } from 'react';
import type { JSX } from 'react';

import { useTranslator } from '../features/settings';
import type { GroupImportPlan } from '../features/spaces/import';

import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';

interface GroupImportDialogProps {
  /** `null` while closed. */
  readonly plan: GroupImportPlan | null;
  readonly onApply: () => Promise<void>;
  readonly onClose: () => void;
}

/**
 * The preview before groups become Spaces (ADR-0081).
 *
 * It lists every Space that would be made or reused and how many hosts move,
 * and says what it leaves alone. Nothing is written until Apply.
 */
export function GroupImportDialog({ plan, onApply, onClose }: GroupImportDialogProps): JSX.Element {
  const i18n = useTranslator();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const apply = (): void => {
    setBusy(true);
    setFailed(false);
    onApply()
      .then(onClose)
      .catch(() => setFailed(true))
      .finally(() => setBusy(false));
  };

  return (
    <Dialog open={plan !== null} onClose={onClose} title={i18n.t('spaces.import.title')}>
      {plan !== null && (
        <div className="flex flex-col gap-3">
          <p className="text-ink-secondary text-[12.5px] leading-relaxed">{i18n.t('spaces.import.body')}</p>
          <ul className="border-line-subtle max-h-52 overflow-y-auto rounded border px-3 py-2 text-[12.5px]">
            {plan.items.map((item) => (
              <li key={item.name} className="flex items-baseline gap-2 py-0.5">
                <span className="text-ink min-w-0 flex-1 truncate">{item.name}</span>
                <span className="text-ink-faint shrink-0 text-[11px]">
                  {i18n.t(item.existing === null ? 'spaces.import.new' : 'spaces.import.existing')}
                </span>
                <span className="text-ink-faint shrink-0 font-mono text-[11px]">{item.hostIds.length}</span>
              </li>
            ))}
          </ul>
          {plan.omitted.length > 0 && (
            <p className="text-warn text-[11.5px]">
              {i18n.t('spaces.import.omitted', { names: plan.omitted.join(', ') })}
            </p>
          )}
          <p className="text-ink-faint text-[11px] leading-relaxed">{i18n.t('spaces.import.keeps')}</p>
          {failed && (
            <p role="alert" className="text-danger-text text-[12px]">
              {i18n.t('spaces.import.failed')}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              {i18n.t('spaces.editor.cancel')}
            </Button>
            <Button type="button" onClick={apply} disabled={busy || plan.items.length === 0}>
              {i18n.t('spaces.import.apply')}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
