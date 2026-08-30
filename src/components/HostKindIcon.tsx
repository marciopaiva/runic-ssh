import type { JSX } from 'react';

import { useTranslator } from '../features/settings';
import type { ParameterlessKey } from '../lib/i18n';
import type { HostKind } from '../ipc';

/**
 * The glyph for a host kind. ADR-0031.
 *
 * Three hand-drawn shapes, the same style every other icon in the tree is
 * drawn in. No icon library, so the whole set is these three paths and
 * nothing an upgrade can change out from under them.
 *
 * `jumpServer` and `target` are the two ends of the relationship `jump.ts`'s
 * `jumpRole` already computes: a fork for a host others are carried through,
 * a turn for one arrived at from somewhere else. `direct`, neither end of
 * one and also the default, draws the quietest mark the palette has, a
 * plain line: most hosts are direct, and this is the row's one identity
 * icon, drawn for every host rather than left blank for an "unset" case
 * this field no longer has.
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
  target: 'hostKind.target',
  direct: 'hostKind.direct',
};

/* One glyph per kind, kept together so a reader comparing them does not have
   to scroll. */
const PATH: Readonly<Record<HostKind, JSX.Element>> = {
  /* One way in, two ways on: what a bastion does. Same path `JumpMark` drew
     before this icon absorbed its job. */
  jumpServer: (
    <>
      <path d="M1.5 8h5M6.5 8l5-4.5M6.5 8l5 4.5" />
      <circle cx="13" cy="3.5" r="1.4" />
      <circle cx="13" cy="12.5" r="1.4" />
    </>
  ),
  /* A turn: this host is arrived at from somewhere else. */
  target: <path d="M3.5 2.5v7a2.5 2.5 0 0 0 2.5 2.5h6.5M10 9l3 3-3 3" />,
  /* Neither end of a chain: the plain line a direct host earns for being
     both the common case and the default. */
  direct: <path d="M2.5 8h11" />,
};

export const HOST_KINDS: readonly HostKind[] = ['jumpServer', 'target', 'direct'];
export { LABEL as HOST_KIND_LABEL };
