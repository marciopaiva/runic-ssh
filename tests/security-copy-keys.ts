/**
 * Which catalogue keys describe a security decision to the user, per section
 * 1 of `CLAUDE.md`: "a mistranslated host key warning is a vulnerability, not
 * a typo." These are the keys a locale's review has to cover before its
 * translation is presented as reviewed (#192).
 *
 * This list is a draft, built by reading `en.json` against the review scope
 * `src/lib/i18n/locales.ts` already describes in prose, not by whoever did
 * the actual reading. Correct it against them, not against this file's own
 * reasoning. `tests/security-copy.test.ts` uses it two ways: a marker-word
 * scan over every catalogue key fails when a new key reads as security copy
 * and is not listed here, and a content hash fails when a listed key's
 * reviewed translation changes without the record in `REVIEWS` moving. Both
 * checks are a floor, not a ceiling: a string that describes a security
 * decision without using any of the marker words below passes the first
 * check silently, the way `hostKey.changed.confirmPrompt`'s all-caps
 * instruction or `failure.rsaRefused.body`'s cryptographic policy would if
 * they were not already listed by hand.
 */

import { createHash } from 'node:crypto';

import type { MessageKey } from '../src/lib/i18n/messages';

/**
 * Substrings that make a key's name or English text worth a second look.
 * Deliberately without a bare "key": `empty.hint`'s "press {keys} for
 * commands" is a keyboard shortcut, not key material, and a marker that
 * loose would flag it on every run.
 */
export const MARKER_WORDS: readonly string[] = [
  'password',
  'passphrase',
  'credential',
  'secret',
  'keychain',
  'trust',
  'revoked',
  'fingerprint',
  'override',
  'certificate',
  'authenticat',
  'host key',
];

/** Every key whose English text or dotted name matches a marker above. */
export function matchesMarker(key: string, message: string): boolean {
  const hay = `${key} ${message}`.toLowerCase();
  return MARKER_WORDS.some((marker) => hay.includes(marker));
}

/**
 * A hash over one locale's translated values for a set of keys, in key
 * order so the result does not depend on where a key sits in the JSON file.
 * Recompute this by hand whenever `REVIEWS` needs a new entry; there is no
 * other way to get it right, which is the point.
 */
export function hashOf(catalog: Readonly<Record<string, string>>, keys: readonly MessageKey[]): string {
  const hash = createHash('sha256');
  for (const key of [...keys].sort()) {
    hash.update(key);
    hash.update(':');
    hash.update(catalog[key] ?? '');
    hash.update('\n');
  }
  return hash.digest('hex');
}

/**
 * Every key a review has to cover. Grouped the way the review notes in
 * `locales.ts` describe their own scope, so a block here maps to a sentence
 * there.
 */
export const SECURITY_COPY_KEYS: readonly MessageKey[] = [
  // The credential prompt window itself (ADR-0008). Every string is either
  // asking for a secret or saying where it is about to go.
  'credential.cancel',
  'credential.failed',
  'credential.hop.bastion',
  'credential.keep',
  'credential.keep.forThisRun',
  'credential.keep.never',
  'credential.keep.stored',
  /* ADR-0035's sibling to the line above: the same claim, for whichever
     store `can_remember` actually dispatched to. Not marker-matched itself
     (no "keychain" in its own text), listed by hand for the same reason
     `failure.rsaRefused.body` is. Added 2026-08-29, not yet in any locale's
     reviewed scope below. */
  'credential.keep.stored.vault',
  'credential.loading',
  'credential.method',
  'credential.method.key',
  'credential.method.password',
  'credential.passphrase',
  'credential.password',
  'credential.privateKey',
  'credential.subject',
  'credential.submit',
  'credential.title',
  'credential.title.jump',

  // The connection screen's explicit security claims: a secret never enters
  // the document that renders terminal output, and the host key is checked
  // before anything is sent. `connecting.cancel`, `.host` and `.title` are
  // plain chrome around those two sentences and stay out.
  'connecting.auth.body',
  'connecting.auth.title',
  'connecting.body',

  // Both host key screens, their fingerprint and their override copy.
  'hostKey.action.cancel',
  'hostKey.action.trust',
  'hostKey.certificate.body',
  'hostKey.certificate.title',
  'hostKey.changed.body',
  'hostKey.changed.cancel',
  'hostKey.changed.confirmPrompt',
  'hostKey.changed.offered',
  'hostKey.changed.replace',
  'hostKey.changed.title',
  'hostKey.changed.trusted',
  'hostKey.field.fingerprint',
  'hostKey.field.host',
  'hostKey.field.keyType',
  'hostKey.field.randomart',
  'hostKey.hop.bastion',
  'hostKey.refused.note',
  'hostKey.revoked.body',
  'hostKey.revoked.title',
  'hostKey.savedTo',
  'hostKey.unknown.body',
  'hostKey.unknown.title',
  'hostKey.verify.hint',
  'hostKey.verify.label',

  // The vault failures, including the no-secret-service fallback ADR-0004
  // requires an explanation for.
  'editor.failed.body.keychain',
  'editor.failed.forget',
  'failure.jumpCredential.body',
  'failure.jumpCredential.title',
  'failure.keychain.body',
  'failure.keychain.title',

  // The authentication and key errors that say what to do next.
  'failure.authentication.body',
  'failure.authentication.title',
  'failure.cancelled.body',
  'failure.certificate.body',
  'failure.keyUnreadable.body',
  'failure.keyUnreadable.title',
  'failure.prompt.body',
  'failure.prompt.title',
  'failure.proxyJump.body',
  'failure.proxyJump.title',
  'failure.revoked.body',
  'failure.rsaRefused.body',
  'failure.rsaRefused.title',

  // The editor's password block, added in the v0.2.1 sweep.
  'session.editor.credential.forget',
  'session.editor.credential.stored',
  'session.editor.jumpHostHint',
  'settings.sessions.lead',

  // The four endings a kept credential can have, added in the v0.2.1 sweep.
  'kept.done',
  'kept.none.body',
  'kept.none.title',
  'kept.refused.body',
  /* ADR-0035's sibling to the line above, for the same claim when the
     internal vault is the backend that refused. Added 2026-08-29, not yet
     in any locale's reviewed scope below. */
  'kept.refused.body.vault',
  'kept.refused.title',
  'kept.run.body',
  'kept.run.title',
  'kept.stored.body',
  /* Same pairing as `kept.refused.body.vault` above. */
  'kept.stored.body.vault',
  'kept.stored.title',

  // The jump host's refused keep, added in the v0.2.1 sweep.
  'status.credentialUnsaved',
  'status.credentialUnsaved.detail',
  'status.credentialUnsaved.detail.via',
  /* ADR-0035's siblings to the two lines above, for the same claim when the
     internal vault is the backend that refused. Added 2026-08-29, not yet
     in any locale's reviewed scope below. */
  'status.credentialUnsaved.detail.vault',
  'status.credentialUnsaved.detail.via.vault',
  'status.credentialUnsaved.via',

  // A host carrying somebody else's session, and a host key mismatch state.
  'session.state.carrying',
  'session.state.keyMismatch',
  'sessions.jump.carries',
  'sessions.jump.rides',

  // Which sessions receive what you type, added in the v0.2.1 sweep.
  'command.split.sync.detail',
  'command.split.sync.off',
  'command.split.sync.on',
  'status.sync',
  'status.sync.announce.off',
  'status.sync.announce.one',
  'status.sync.announce.other',
  'status.sync.nowhere',
  'status.sync.off',
  'status.sync.on',
  'terminal.group.sync.off',
  'terminal.group.sync.on',
  'terminal.paste.body',
  'terminal.paste.body.one',
  'terminal.paste.cancel',
  'terminal.paste.confirm',
  'terminal.paste.hosts',
  'terminal.paste.line',
  'terminal.paste.more',
  'terminal.paste.title',

  // The sentence that states the review guarantee itself.
  'settings.language.hint',

  // The internal vault's own copy (ADR-0035): what it is, the master
  // password it asks for, and what a reset costs. Added 2026-08-29, not yet
  // in any locale's reviewed scope below.
  'vault.description',
  'vault.disable',
  'vault.disable.hint',
  'vault.enable.hint',
  'vault.password',
  'vault.password.confirm',
  'vault.password.mismatch',
  'vault.reset.hint',
  'vault.unlock.body',
  'vault.error.wrongPassword',

  // The internal vault surfacing mid-connection (ADR-0035), reusing the
  // keychain's own failure copy for the same claim about a different store.
  // Added 2026-08-29, not yet in any locale's reviewed scope below.
  'failure.vault.title',
  'failure.vault.body',
];

/**
 * What each offered locale's review actually covered, per the prose in
 * `src/lib/i18n/locales.ts`. A locale earns a review by covering some or all
 * of `SECURITY_COPY_KEYS`; it does not have to cover all of it at once, the
 * way `es`'s scope is narrower than `pt-BR`'s by design (#4).
 */
export const REVIEWS: Readonly<
  Record<string, { readonly date: string; readonly hash: string; readonly keys: readonly MessageKey[] }>
> = {
  'pt-BR': {
    /* Frozen to an explicit snapshot on 2026-08-29, the same day the
       internal vault's copy (ADR-0035) joined SECURITY_COPY_KEYS. Until
       then this pointed at the list itself, which was safe only as long as
       nothing was ever added to it without a review to match; the vault's
       strings are the first addition that broke that assumption. Pointing
       at the live list would have backdated their review to a date before
       they existed. New keys go in SECURITY_COPY_KEYS when they read as
       security copy; they join this list only once someone has actually
       reviewed them, the same as `es`'s narrower scope already works. */
    /* Hash moved 2026-08-29 with no wording change: `sessions.jump.direct`
       left both SECURITY_COPY_KEYS and this list the same day, since the row
       it described no longer draws a mark at all (JumpMark.tsx). One fewer
       reviewed string, not an unreviewed one. */
    date: '2026-08-26',
    hash: '1d657ee53aa3e69be1922c518c40d286f1889277124e48e2c22fb05b5f841bbe',
    keys: [
      'credential.cancel',
      'credential.failed',
      'credential.hop.bastion',
      'credential.keep',
      'credential.keep.forThisRun',
      'credential.keep.never',
      'credential.keep.stored',
      'credential.loading',
      'credential.method',
      'credential.method.key',
      'credential.method.password',
      'credential.passphrase',
      'credential.password',
      'credential.privateKey',
      'credential.subject',
      'credential.submit',
      'credential.title',
      'credential.title.jump',
      'connecting.auth.body',
      'connecting.auth.title',
      'connecting.body',
      'hostKey.action.cancel',
      'hostKey.action.trust',
      'hostKey.certificate.body',
      'hostKey.certificate.title',
      'hostKey.changed.body',
      'hostKey.changed.cancel',
      'hostKey.changed.confirmPrompt',
      'hostKey.changed.offered',
      'hostKey.changed.replace',
      'hostKey.changed.title',
      'hostKey.changed.trusted',
      'hostKey.field.fingerprint',
      'hostKey.field.host',
      'hostKey.field.keyType',
      'hostKey.field.randomart',
      'hostKey.hop.bastion',
      'hostKey.refused.note',
      'hostKey.revoked.body',
      'hostKey.revoked.title',
      'hostKey.savedTo',
      'hostKey.unknown.body',
      'hostKey.unknown.title',
      'hostKey.verify.hint',
      'hostKey.verify.label',
      'editor.failed.body.keychain',
      'editor.failed.forget',
      'failure.jumpCredential.body',
      'failure.jumpCredential.title',
      'failure.keychain.body',
      'failure.keychain.title',
      'failure.authentication.body',
      'failure.authentication.title',
      'failure.cancelled.body',
      'failure.certificate.body',
      'failure.keyUnreadable.body',
      'failure.keyUnreadable.title',
      'failure.prompt.body',
      'failure.prompt.title',
      'failure.proxyJump.body',
      'failure.proxyJump.title',
      'failure.revoked.body',
      'failure.rsaRefused.body',
      'failure.rsaRefused.title',
      'session.editor.credential.forget',
      'session.editor.credential.stored',
      'session.editor.jumpHostHint',
      'settings.sessions.lead',
      'kept.done',
      'kept.none.body',
      'kept.none.title',
      'kept.refused.body',
      'kept.refused.title',
      'kept.run.body',
      'kept.run.title',
      'kept.stored.body',
      'kept.stored.title',
      'status.credentialUnsaved',
      'status.credentialUnsaved.detail',
      'status.credentialUnsaved.detail.via',
      'status.credentialUnsaved.via',
      'session.state.carrying',
      'session.state.keyMismatch',
      'sessions.jump.carries',
      'sessions.jump.rides',
      'command.split.sync.detail',
      'command.split.sync.off',
      'command.split.sync.on',
      'status.sync',
      'status.sync.announce.off',
      'status.sync.announce.one',
      'status.sync.announce.other',
      'status.sync.nowhere',
      'status.sync.off',
      'status.sync.on',
      'terminal.group.sync.off',
      'terminal.group.sync.on',
      'terminal.paste.body',
      'terminal.paste.body.one',
      'terminal.paste.cancel',
      'terminal.paste.confirm',
      'terminal.paste.hosts',
      'terminal.paste.line',
      'terminal.paste.more',
      'terminal.paste.title',
      'settings.language.hint',
    ],
  },
  es: {
    date: '2026-08-26',
    hash: '3575d9b9df47f1f326a5c2eebf3660cb117ef9164626858896fa0b3d1fd6e2a8',
    keys: [
      'editor.failed.body.keychain',
      'failure.authentication.body',
      'failure.authentication.title',
      'failure.cancelled.body',
      'failure.certificate.body',
      'failure.jumpCredential.body',
      'failure.jumpCredential.title',
      'failure.keyUnreadable.body',
      'failure.keyUnreadable.title',
      'failure.keychain.body',
      'failure.keychain.title',
      'failure.proxyJump.body',
      'failure.proxyJump.title',
      'failure.revoked.body',
      'failure.rsaRefused.body',
      'failure.rsaRefused.title',
      'hostKey.action.cancel',
      'hostKey.action.trust',
      'hostKey.certificate.body',
      'hostKey.certificate.title',
      'hostKey.changed.body',
      'hostKey.changed.cancel',
      'hostKey.changed.confirmPrompt',
      'hostKey.changed.offered',
      'hostKey.changed.replace',
      'hostKey.changed.title',
      'hostKey.changed.trusted',
      'hostKey.field.fingerprint',
      'hostKey.field.host',
      'hostKey.field.keyType',
      'hostKey.field.randomart',
      'hostKey.hop.bastion',
      'hostKey.refused.note',
      'hostKey.revoked.body',
      'hostKey.revoked.title',
      'hostKey.savedTo',
      'hostKey.unknown.body',
      'hostKey.unknown.title',
      'hostKey.verify.hint',
      'hostKey.verify.label',
    ],
  },
};
