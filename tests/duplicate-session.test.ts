/**
 * A second saved session at a connection target one already reaches.
 *
 * Mirrors `config::sessions::duplicate_of`'s own test module, scenario for
 * scenario: the two must agree, since this is the form saying no before a
 * round trip has to.
 */

import { describe, expect, it } from 'vitest';

import { duplicateOf } from '../src/features/sessions/duplicate';
import type { Session } from '../src/ipc';

function session(id: string, overrides: Partial<Session> = {}): Session {
  return {
    id,
    name: id,
    host: `${id}.internal`,
    port: 22,
    user: 'deploy',
    group: null,
    credentialId: null,
    proxyJump: null,
    kind: 'direct',
    ...overrides,
  };
}

describe('a second session at the same connection target', () => {
  it('is refused when host, port and user all match', () => {
    const saved = [session('web-01', { host: 'web-01.example.com' })];

    expect(duplicateOf(saved, null, 'web-01.example.com', 22, 'deploy', '')).toBe(saved[0]);
  });

  it('ignores case and surrounding space on the host', () => {
    const saved = [session('web-01', { host: 'web-01.example.com' })];

    expect(duplicateOf(saved, null, '  Web-01.Example.com  ', 22, 'deploy', '')).toBe(saved[0]);
  });

  it('is not a duplicate with a different user', () => {
    const saved = [session('web-01', { host: 'web-01.example.com', user: 'deploy' })];

    expect(duplicateOf(saved, null, 'web-01.example.com', 22, 'admin', '')).toBeNull();
  });

  it('is not a duplicate with a different port', () => {
    const saved = [session('web-01', { host: 'web-01.example.com', port: 22 })];

    expect(duplicateOf(saved, null, 'web-01.example.com', 2222, 'deploy', '')).toBeNull();
  });

  it('skips the check while the port has not been typed as a number yet', () => {
    const saved = [session('web-01', { host: 'web-01.example.com' })];

    expect(duplicateOf(saved, null, 'web-01.example.com', null, 'deploy', '')).toBeNull();
  });

  it('does not match the session being edited against itself', () => {
    const saved = [session('web-01', { host: 'web-01.example.com' })];

    expect(duplicateOf(saved, 'web-01', 'web-01.example.com', 22, 'deploy', '')).toBeNull();
  });
});

describe('the jump host as part of the connection target', () => {
  /* A redundant pair of jump hosts to one saved target is a real pattern,
     not the copy-paste mistake this check exists to catch. */

  it('is not a duplicate through two different bastions', () => {
    const saved = [
      session('prod-db-east', { host: 'prod-db.example.com', proxyJump: 'east' }),
    ];

    expect(
      duplicateOf(saved, null, 'prod-db.example.com', 22, 'deploy', 'west'),
    ).toBeNull();
  });

  it('is not a duplicate direct and through a bastion', () => {
    const saved = [session('web-01', { host: 'web-01.example.com', proxyJump: null })];

    expect(
      duplicateOf(saved, null, 'web-01.example.com', 22, 'deploy', 'bastion'),
    ).toBeNull();
  });

  it('is still a duplicate through the same bastion twice', () => {
    const saved = [
      session('prod-db', { host: 'prod-db.example.com', proxyJump: 'bastion' }),
    ];

    expect(duplicateOf(saved, null, 'prod-db.example.com', 22, 'deploy', 'bastion')).toBe(
      saved[0],
    );
  });

  it('treats an absent proxyJump the same as an empty draft field', () => {
    /* The core skips the field entirely for a direct host, so what a saved
       session carries is `undefined`, never `null`, the same shape
       `hasStoredCredential` and `jumpRole` already normalise. */
    const wire = JSON.parse(
      '{"id":"web-01","name":"web-01","host":"web-01.example.com","port":22,"user":"deploy","group":null,"credentialId":null,"kind":"direct"}',
    ) as Session;

    expect(duplicateOf([wire], null, 'web-01.example.com', 22, 'deploy', '')).toBe(wire);
  });
});
