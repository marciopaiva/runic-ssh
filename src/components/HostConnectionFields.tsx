import type { JSX } from 'react';

import type { DraftValues } from '../features/sessions';
import { useTranslator } from '../features/settings';

interface HostConnectionFieldsProps {
  readonly values: DraftValues;
  readonly onChange: (field: keyof DraftValues, value: string) => void;
}

/**
 * How this host's shell and connection behave once it is open (ADR-0079).
 *
 * Neither choice is topology, so they do not sit behind the "Change" fold
 * ADR-0061 puts on kind and jump host: a person looking for them will not
 * look there (#491).
 */
export function HostConnectionFields({ values, onChange }: HostConnectionFieldsProps): JSX.Element {
  const i18n = useTranslator();

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-ink-muted text-[11px]">{i18n.t('session.editor.multiplexer')}</span>
        <select
          value={values.multiplexer}
          onChange={(event) => onChange('multiplexer', event.target.value)}
          className="bg-surface-input text-ink border-line-subtle w-full appearance-none rounded border px-2.5 py-1.5 text-[12.5px] outline-none"
        >
          <option value="">{i18n.t('session.editor.multiplexer.none')}</option>
          <option value="tmux">tmux</option>
          <option value="screen">screen</option>
        </select>
        <span className="text-ink-faint text-[11px] leading-snug">
          {i18n.t('session.editor.multiplexer.hint')}
        </span>
      </label>

      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={values.keepalive !== 'off'}
          onChange={(event) => onChange('keepalive', event.target.checked ? 'on' : 'off')}
          className="mt-0.5"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-ink-muted text-[11px]">{i18n.t('session.editor.keepalive')}</span>
          <span className="text-ink-faint text-[11px] leading-snug">
            {i18n.t('session.editor.keepalive.hint')}
          </span>
        </span>
      </label>
    </div>
  );
}
