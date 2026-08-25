import type { JSX } from 'react';

import { useTranslator } from '../features/settings';
import type { Hop } from '../ipc';

interface JumpHostNoticeProps {
  readonly hop: Hop;
}

/**
 * Says that a host key screen is asking about the jump host.
 *
 * Rule 3 works by being read. A session behind a bastion can produce two
 * fingerprint screens in a row, for two different hosts, and to anybody not
 * told which is which they are the same screen shown twice: the second is
 * answered on the strength of having thought about the first. This is the
 * sentence that stops that.
 *
 * Renders nothing for the target, which is every ordinary connection as well
 * as the far end of a chain. The surprising screen is the one about a host the
 * user did not click on, and marking the unsurprising one too would make the
 * marking itself unremarkable.
 */
export function JumpHostNotice({ hop }: JumpHostNoticeProps): JSX.Element | null {
  const i18n = useTranslator();

  if (hop !== 'bastion') return null;

  return (
    <p className="border-accent bg-accent-soft text-ink rounded border-l-2 px-3 py-2 text-[12.5px] leading-relaxed">
      {i18n.t('hostKey.hop.bastion')}
    </p>
  );
}
