import type { JSX } from 'react';

import { useTranslator } from '../features/settings';
import type { SuggestedMethod } from '../ipc';

/**
 * Which kind of credential a host takes. Not a secret, ADR-0030, so it
 * lives on the wizard's own Access step rather than inside the window
 * ADR-0008 keeps for the value itself.
 *
 * Same chip shape as `HostKindPicker`: a hand-drawn glyph next to the label,
 * no enclosing box. The two pickers used to look like different controls,
 * this one a segmented toggle, that one a row of tags, for no reason
 * either was drawn that way.
 */
export function MethodPicker({
  value,
  onChange,
}: {
  readonly value: SuggestedMethod;
  readonly onChange: (method: SuggestedMethod) => void;
}): JSX.Element {
  const i18n = useTranslator();

  return (
    <div role="radiogroup" aria-label={i18n.t('credential.method')} className="flex gap-1.5">
      {(['password', 'privateKey'] as const).map((option) => {
        const checked = value === option;

        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(option)}
            className={`flex items-center gap-1.5 rounded border px-2 py-1 text-[11.5px] ${
              checked
                ? 'border-accent bg-accent-soft text-ink'
                : 'border-line-subtle text-ink-secondary hover:bg-surface-raised/60'
            }`}
          >
            <MethodIcon option={option} />
            {i18n.t(option === 'password' ? 'credential.method.password' : 'credential.method.key')}
          </button>
        );
      })}
    </div>
  );
}

/* Two glyphs, the same hand-drawn style `HostKindIcon` uses (16x16, a
   1.3-weight stroke, no fill except the odd solid dot). Kept local rather
   than pulled out into a file of its own, since nothing else in the tree
   draws a credential method yet. If that changes, it moves out the way
   `HostKindIcon` already did. */
function MethodIcon({ option }: { readonly option: SuggestedMethod }): JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {option === 'password' ? (
        <>
          <rect x="3.5" y="7" width="9" height="6" rx="1.2" />
          <path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" />
          <circle cx="8" cy="9.8" r="0.6" fill="currentColor" stroke="none" />
        </>
      ) : (
        <>
          <circle cx="5" cy="8" r="2.6" />
          <path d="M7.4 8H13M10.4 8v1.6M12.4 8v1.2" />
        </>
      )}
    </svg>
  );
}
