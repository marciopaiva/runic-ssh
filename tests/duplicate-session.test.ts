/**
 * Whether a draft's connection target already exists under another name.
 *
 * Mirrors `config::sessions::duplicate_of`, which is what actually refuses.
 * The core's own tests cover the rule; these cover the form saying so before
 * a round trip has to.
 */

import { describe, expect, it } from 'vitest';

import { duplicateOf } from '../src/features/sessions/duplicate';
import type { Session } from '../src/ipc';

function session(id: string, overrides: Partial<Session> = {}): Session {
  return {
    id,
    name: id,
    host: `${id}.example`,
    port: 22,
    user: 'deploy',
    group: null,
    credentialId: null,
    proxyJump: null,
    kind: 'other',
    ...overrides,
  };
}

describe('the saved session already reaching a target', () => {
  it('finds a session at the same host, port and user', () => {
    const saved = [session('web-01', { host: 'web-01.example.com' })];

    const found = duplicateOf(saved, null, 'web-01.example.com', 22, 'deploy');
    expect(found?.id).toBe('web-01');
  });

  it('does not confuse different users on the same host and port', () => {
    const saved = [session('deploy-account', { host: 'web-01.example.com', user: 'deploy' })];

    expect(duplicateOf(saved, null, 'web-01.example.com', 22, 'admin')).toBeNull();
  });

  it('does not confuse different ports on the same host', () => {
    const saved = [session('web-01', { host: 'web-01.example.com', port: 22 })];

    expect(duplicateOf(saved, null, 'web-01.example.com', 2222, 'deploy')).toBeNull();
  });

  it('ignores case and surrounding space on the host', () => {
    const saved = [session('web-01', { host: 'Web-01.Example.com' })];

    const found = duplicateOf(saved, null, '  web-01.example.com  ', 22, 'deploy');
    expect(found?.id).toBe('web-01');
  });

  it('excludes the session being edited from matching itself', () => {
    const saved = [session('web-01', { host: 'web-01.example.com' })];

    expect(duplicateOf(saved, 'web-01', 'web-01.example.com', 22, 'deploy')).toBeNull();
  });

  it('skips the check while the port has not parsed to a number yet', () => {
    /* A draft mid-typing, or one whose port is still invalid: `invalidFields`
       already refuses that on its own, and matching everything against a
       `null` port here would report a duplicate that is not one yet. */
    const saved = [session('web-01', { host: 'web-01.example.com' })];

    expect(duplicateOf(saved, null, 'web-01.example.com', null, 'deploy')).toBeNull();
  });

  it('finds nothing among unrelated hosts', () => {
    const saved = [session('a', { host: 'a.example.com' }), session('b', { host: 'b.example.com' })];

    expect(duplicateOf(saved, null, 'c.example.com', 22, 'deploy')).toBeNull();
  });
});
