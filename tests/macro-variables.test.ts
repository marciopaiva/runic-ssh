import { describe, expect, it } from 'vitest';

import { applyVariables, usesVariables } from '../src/features/macros';

const SESSION = { host: '10.0.4.12', port: 2222, user: 'deploy' };

describe("resolving a macro's own variables", () => {
  it('replaces every occurrence of each variable', () => {
    expect(applyVariables('ssh $username@$host -p $port', SESSION)).toBe(
      'ssh deploy@10.0.4.12 -p 2222',
    );
  });

  it('replaces a variable used more than once', () => {
    expect(applyVariables('$host $host', SESSION)).toBe('10.0.4.12 10.0.4.12');
  });

  it('leaves text with no variables untouched', () => {
    expect(applyVariables('systemctl status nginx\n', SESSION)).toBe(
      'systemctl status nginx\n',
    );
  });

  it('leaves an unrecognised placeholder exactly as written', () => {
    /* A typo reads as a typo in the terminal, which is recoverable, rather
       than vanishing into a blank nobody can trace back to it. */
    expect(applyVariables('$hostt', SESSION)).toBe('$hostt');
  });
});

describe('detecting whether a macro reads the session at all', () => {
  it('is true for each variable on its own', () => {
    expect(usesVariables('ssh $username@$host -p $port')).toBe(true);
    expect(usesVariables('echo $host')).toBe(true);
    expect(usesVariables('echo $port')).toBe(true);
    expect(usesVariables('echo $username')).toBe(true);
  });

  it('is false for text with no variable', () => {
    expect(usesVariables('systemctl status nginx\n')).toBe(false);
  });

  it('is false for an unrecognised placeholder', () => {
    expect(usesVariables('$hostt')).toBe(false);
  });
});
