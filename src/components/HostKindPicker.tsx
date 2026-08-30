import type { JSX } from 'react';

import { useTranslator } from '../features/settings';
import type { HostKind } from '../ipc';

import { HOST_KIND_LABEL, HOST_KINDS, HostKindIcon } from './HostKindIcon';

/**
 * Choosing what a host is. ADR-0031.
 *
 * Purely categorisation: nothing here is a secret and nothing here changes
 * how a connection is made, which is why it sits on the plain form rather
 * than behind a rule from section 7.
 */
export function HostKindPicker({
  value,
  onChange,
}: {
  readonly value: HostKind;
  readonly onChange: (kind: HostKind) => void;
}): JSX.Element {
  const i18n = useTranslator();

  return (
    <div
      role="radiogroup"
      aria-label={i18n.t('hostKind.label')}
      className="flex flex-wrap gap-1.5"
    >
      {HOST_KINDS.map((kind) => {
        const checked = value === kind;

        return (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(kind)}
            className={`flex items-center gap-1.5 rounded border px-2 py-1 text-[11.5px] ${
              checked
                ? 'border-accent bg-accent-soft text-ink'
                : 'border-line-subtle text-ink-secondary hover:bg-surface-raised/60'
            }`}
          >
            <HostKindIcon kind={kind} />
            {i18n.t(HOST_KIND_LABEL[kind])}
          </button>
        );
      })}
    </div>
  );
}
