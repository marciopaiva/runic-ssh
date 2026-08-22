/**
 * Guards what the user is told when a connection does not happen.
 *
 * This is here because the opposite shipped: the attempt carried a code, the
 * sidebar marker changed shape, the main area stayed empty, and the user was
 * left to guess between a wrong port, a host that is down, and a bug in the
 * client. A failure nobody renders is the same as no error handling at all.
 */

import { describe, expect, it } from 'vitest';

import { MAPPED_FAILURES, describeFailure } from '../src/features/sessions/failure';
import { CODES } from '../src/ipc/errors';
import { createTranslator } from '../src/lib/i18n';

describe('describing a failure', () => {
  it('names the commonest cause in words somebody can act on', () => {
    /* A wrong port is the single likeliest reason a first connection fails,
       and "hostUnreachable" on its own tells nobody that. */
    const failure = describeFailure('hostUnreachable');
    const message = createTranslator('en').t(failure.body);

    expect(message).toMatch(/port/i);
  });

  it('treats a dismissed prompt as a cancellation', () => {
    /* Somebody pressed Cancel. Reporting it in the same words as a refused
       password teaches people to ignore the words. */
    expect(createTranslator('en').t(describeFailure('credentialDismissed').title)).toBe(
      'Cancelled',
    );
  });

  it('offers to try again where trying again could work', () => {
    expect(describeFailure('hostUnreachable').retryable).toBe(true);
    expect(describeFailure('authenticationFailed').retryable).toBe(true);
  });

  it('offers no retry where the answer will never change', () => {
    /* A revoked key never becomes acceptable, and a retry button there is an
       invitation to keep pressing it. */
    expect(describeFailure('hostKeyRevoked').retryable).toBe(false);
    expect(describeFailure('hostKeyCertificateRequired').retryable).toBe(false);
    expect(describeFailure('rsaKeyRefused').retryable).toBe(false);
  });

  it('admits when it does not know rather than inventing a cause', () => {
    const failure = describeFailure('malformedInput');

    expect(failure.title).toBe('failure.unexpected.title');
  });

  it('has an answer for every code the core can send', () => {
    /* The fallback is what makes this safe, so this asserts the fallback is
       reachable for anything and never throws. */
    for (const code of CODES) {
      expect(() => describeFailure(code)).not.toThrow();
      expect(describeFailure(code).title).toBeTruthy();
    }
  });

  it('gives each failure copy of its own', () => {
    /* Two failures sharing a body is two different problems described the
       same way, which is how a message stops being read. */
    const bodies = MAPPED_FAILURES.map((failure) => failure.body);
    const shared = bodies.filter(
      (body, index) => bodies.indexOf(body) !== index && body !== 'failure.keychain.body',
    );

    expect(shared).toEqual([]);
  });

  it('says something in every language', () => {
    for (const locale of ['en', 'pt-BR', 'es']) {
      const i18n = createTranslator(locale);

      for (const failure of MAPPED_FAILURES) {
        expect(i18n.t(failure.title).length).toBeGreaterThan(3);
        expect(i18n.t(failure.body).length).toBeGreaterThan(20);
      }
    }
  });
});
