/**
 * The ADR-0051 banner: which fields it names, which layout it picks, and
 * that a real remote MOTD could never see it (that guarantee comes from
 * where `use-terminal.ts` calls this relative to `watchTerminal`, not from
 * anything testable here, since it's a pure function of already-typed
 * values, not of the terminal's own event order).
 */

import { describe, expect, it } from 'vitest';

import { motdBanner } from '../src/features/terminal/motd';
import { createTranslator } from '../src/lib/i18n';
import type { Session } from '../src/ipc';

const i18n = createTranslator('en');

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
    kind: 'direct',
    forwards: [],
    ...overrides,
  };
}

/** Plain text a person would actually see, once the SGR codes are gone. */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('the fields a MOTD names', () => {
  it('names host, address and user, and leaves out the port when it is 22', () => {
    const plain = stripAnsi(motdBanner(session('web', { name: 'web-01', host: '10.4.1.20' }), [], 200, i18n));

    expect(plain).toContain('Runic SSH');
    expect(plain).toContain('web-01');
    expect(plain).toContain('10.4.1.20');
    expect(plain).not.toContain('10.4.1.20:22');
    expect(plain).toContain('deploy');
  });

  it('carries the port when it is not 22', () => {
    const plain = stripAnsi(motdBanner(session('web', { host: '10.4.1.20', port: 2222 }), [], 200, i18n));
    expect(plain).toContain('10.4.1.20:2222');
  });

  it('names no bastion for a direct connection', () => {
    const plain = stripAnsi(motdBanner(session('web'), [], 200, i18n));
    expect(plain).not.toContain('Via');
  });

  it('names the bastion a host rides, by its saved name', () => {
    const bastion = session('bastion', { name: 'bastion-01', kind: 'jumpServer' });
    const target = session('web', { name: 'web-01', proxyJump: 'bastion', kind: 'target' });

    const plain = stripAnsi(motdBanner(target, [bastion, target], 200, i18n));
    expect(plain).toContain('Via');
    expect(plain).toContain('bastion-01');
  });
});

describe('side by side versus stacked (ADR-0051, Option B)', () => {
  it('puts the title on the same row as the first art row once the terminal is wide enough', () => {
    const banner = motdBanner(session('web', { name: 'web-01' }), [], 200, i18n);
    const lines = banner.split('\r\n');

    expect(stripAnsi(lines[0] ?? '')).toContain('≈');
    expect(stripAnsi(lines[0] ?? '')).toContain('Runic SSH');
  });

  it('falls back to stacked, art first, once the terminal is too narrow for both', () => {
    const banner = motdBanner(session('web', { name: 'web-01' }), [], 40, i18n);
    const lines = banner.split('\r\n').filter((line) => line.length > 0 || true);

    /* The art's own rows never carry field text once stacked: nothing after
       the art ends fits its own row width to have shared one before. */
    const artRowCount = 13;
    for (const line of lines.slice(0, artRowCount)) {
      expect(stripAnsi(line)).not.toContain('Runic SSH');
    }
    expect(stripAnsi(banner)).toContain('Runic SSH');
    expect(stripAnsi(banner)).toContain('web-01');
  });
});

describe('language', () => {
  it('prints the fields in the locale the session opened with', () => {
    const pt = createTranslator('pt-BR');
    const plain = stripAnsi(motdBanner(session('web'), [], 200, pt));
    expect(plain).toContain('Usuário');
  });
});
