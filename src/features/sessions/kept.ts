/**
 * What became of a password somebody asked to save.
 *
 * Four endings, and the interface has to tell them apart, because three of
 * them mean the host will ask again next time and only one does not. The core
 * answers `Keeping`, which says a secret was kept and not where: ADR-0025 has
 * two ways of keeping one and `kept` covers both. Whether it reached the
 * keychain is read from the session afterwards, because a credential id in the
 * session file is the fact that outlives the run.
 *
 * Pure, so the four can be asserted without a keychain, a window, or a host.
 */

import type { Keeping, Session } from '../../ipc';
/* `ParameterlessKey` rather than `MessageKey`: the key is picked at runtime,
   and `t` cannot know which member of a union it was handed. Narrowing to the
   keys with no holes is what makes a dynamic key safe, and it is stronger than
   loosening `t` would have been. */
import type { ParameterlessKey } from '../../lib/i18n';

export interface KeptOutcome {
  readonly title: ParameterlessKey;
  readonly body: ParameterlessKey;
  /** Raised only for the refusal, which is the one nobody chose. */
  readonly tone: 'neutral' | 'danger';
}

export function describeKeeping(keeping: Keeping, stored: boolean): KeptOutcome {
  if (keeping === 'refused') {
    return { title: 'kept.refused.title', body: 'kept.refused.body', tone: 'danger' };
  }

  /* The user picked "never". Not a failure and not a defect: they authenticated
     and asked for nothing to be kept, and saying so is what stops the screen
     implying something was. */
  if (keeping === 'notAsked') {
    return { title: 'kept.none.title', body: 'kept.none.body', tone: 'neutral' };
  }

  /* Kept, and the session says where. Without the credential id this was the
     "for this run" answer, which is written nowhere and is gone when the
     application closes. Reporting both as "saved" would be the screen making a
     promise the next start does not keep. */
  return stored
    ? { title: 'kept.stored.title', body: 'kept.stored.body', tone: 'neutral' }
    : { title: 'kept.run.title', body: 'kept.run.body', tone: 'neutral' };
}

/**
 * Whether the keychain holds a password for this host.
 *
 * A function rather than a comparison at each call site, because the
 * comparison is wrong in a way that reads as right. The core skips the field
 * entirely for a host with nothing stored, so what arrives is `undefined` and
 * never `null`, whatever the declared type says: `credentialId !== null` is
 * true for every host in the tree. `jump.ts` carries the same warning about
 * `proxyJump`, which is where this was learned the first time. It cost a
 * screen that told somebody their password was in the system keychain when
 * they had asked for it to be kept only until the application closes.
 */
export function hasStoredCredential(session: Session): boolean {
  return (session.credentialId ?? null) !== null;
}
