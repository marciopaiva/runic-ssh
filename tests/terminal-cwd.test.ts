import { describe, expect, it } from 'vitest';

import { parseOsc7 } from '../src/features/terminal/cwd';

describe('parseOsc7', () => {
  it('reads the path and ignores the host', () => {
    expect(parseOsc7('file://web-01/var/www')).toBe('/var/www');
    expect(parseOsc7('file:///home/deploy')).toBe('/home/deploy');
    expect(parseOsc7('file://anything-the-shell-says/etc')).toBe('/etc');
  });

  it('decodes percent escapes', () => {
    expect(parseOsc7('file://h/home/me/my%20docs')).toBe('/home/me/my docs');
    expect(parseOsc7('file://h/a%23b')).toBe('/a#b');
  });

  it('keeps a literal percent that was never encoded', () => {
    expect(parseOsc7('file://h/100%/x')).toBe('/100%/x');
  });

  it('drops a query or fragment', () => {
    expect(parseOsc7('file://h/srv?x=1')).toBe('/srv');
    expect(parseOsc7('file://h/srv#top')).toBe('/srv');
  });

  it('turns a Windows drive path into one', () => {
    expect(parseOsc7('file:///C:/Users/me')).toBe('C:/Users/me');
  });

  it('refuses what is not a usable absolute path', () => {
    for (const bad of [
      '',
      'http://h/x',
      'file://h',
      'file://h/a%00b',
      'file://h/a\nb',
      'file://h/a\u001bb',
      `file://h/${'a'.repeat(5000)}`,
    ]) {
      expect(parseOsc7(bad), bad.slice(0, 30)).toBeNull();
    }
  });
});

describe('the local shells\' folders', () => {
  it('follows the shell that reported last and falls back when it goes away', async () => {
    const { reportLocalCwd, forgetLocalCwd, getLocalCwd } = await import('../src/features/terminal/cwd');

    expect(getLocalCwd()).toBeNull();

    reportLocalCwd('1', '/home/me');
    reportLocalCwd('2', '/srv/app');
    expect(getLocalCwd()).toBe('/srv/app');

    reportLocalCwd('1', '/home/me/src');
    expect(getLocalCwd()).toBe('/home/me/src');

    forgetLocalCwd('1');
    expect(getLocalCwd()).toBe('/srv/app');

    forgetLocalCwd('2');
    expect(getLocalCwd()).toBeNull();
  });
});
