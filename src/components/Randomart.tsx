import type { JSX } from 'react';

import { randomart } from '../lib/randomart';

interface RandomartProps {
  readonly fingerprint: string;
  readonly keyType?: string;
  /** Accessible name for the pre block. */
  readonly label: string;
}

/**
 * SSH randomart for a host-key fingerprint.
 *
 * Renders nothing when the fingerprint cannot be decoded, so a malformed
 * string never becomes a misleading picture. The art is recognition aid only;
 * the Trust button stays gated on the out-of-band checkbox.
 */
export function Randomart({ fingerprint, keyType, label }: RandomartProps): JSX.Element | null {
  const lines = randomart(fingerprint, keyType);
  if (lines === null) return null;

  return (
    <figure className="bg-surface-base border-line-subtle flex flex-col gap-1.5 rounded-lg border p-3">
      <figcaption className="text-ink-faint text-[9.5px] font-bold tracking-[0.09em]">
        {label}
      </figcaption>
      <pre
        aria-label={label}
        className="text-accent-bright overflow-x-auto font-mono text-[11px] leading-[1.15] select-text"
      >
        {lines.join('\n')}
      </pre>
    </figure>
  );
}
