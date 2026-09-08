import { describe, expect, it } from 'vitest';

import { applyVariables } from '../src/features/macros';

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
