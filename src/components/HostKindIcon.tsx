import type { JSX } from 'react';

import { useTranslator } from '../features/settings';
import type { ParameterlessKey } from '../lib/i18n';
import type { HostKind } from '../ipc';

/**
 * The glyph for a host kind. ADR-0031.
 *
 * Four hand-drawn shapes, the same style every other icon in the tree is
 * drawn in. No icon library, so the whole set is these four paths and
 * nothing an upgrade can change out from under them.
 */
export function HostKindIcon({
  kind,
  className,
}: {
  readonly kind: HostKind;
  readonly className?: string;
}): JSX.Element {
  const i18n = useTranslator();
  const label = i18n.t(LABEL[kind]);

  return (
    <span role="img" aria-label={label} title={label} className="inline-flex shrink-0">
      <svg
        viewBox="0 0 16 16"
        className={className ?? 'h-3.5 w-3.5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {PATH[kind]}
      </svg>
    </span>
  );
}

const LABEL: Readonly<Record<HostKind, ParameterlessKey>> = {
  jumpServer: 'hostKind.jumpServer',
  database: 'hostKind.database',
  web: 'hostKind.web',
  other: 'hostKind.other',
};

/* One glyph per kind, kept together so a reader comparing them does not have
   to scroll. */
const PATH: Readonly<Record<HostKind, JSX.Element>> = {
  jumpServer: (
    <>
      <rect x="3" y="3" width="10" height="4" rx="1" />
      <rect x="3" y="9" width="10" height="4" rx="1" />
      <circle cx="5.2" cy="5" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="5.2" cy="11" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  database: (
    <>
      <ellipse cx="8" cy="4" rx="5" ry="2" />
      <path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4" />
      <path d="M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" />
    </>
  ),
  web: (
    <>
      <circle cx="8" cy="8" r="5.6" />
      <path d="M2.4 8h11.2M8 2.4c1.6 1.6 2.4 3.6 2.4 5.6s-.8 4-2.4 5.6c-1.6-1.6-2.4-3.6-2.4-5.6S6.4 4 8 2.4z" />
    </>
  ),
  other: (
    <>
      <path d="M8.5 2.5H4A1.5 1.5 0 0 0 2.5 4v4.5c0 .4.16.78.44 1.06l5.5 5.5a1.5 1.5 0 0 0 2.12 0l4-4a1.5 1.5 0 0 0 0-2.12l-5.5-5.5A1.5 1.5 0 0 0 8.5 2.5z" />
      <circle cx="5.5" cy="5.5" r="0.75" fill="currentColor" stroke="none" />
    </>
  ),
};

export const HOST_KINDS: readonly HostKind[] = ['jumpServer', 'database', 'web', 'other'];
export { LABEL as HOST_KIND_LABEL };
