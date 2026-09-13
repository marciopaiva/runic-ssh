/**
 * Which platform a scripted paste refuses on (#381), from a user agent
 * string so the check needs no browser to run under.
 */

import { describe, expect, it } from 'vitest';

import { isLinux } from '../src/features/map';

describe('isLinux', () => {
  it('reads a Linux desktop webview as Linux', () => {
    expect(isLinux('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko)')).toBe(true);
  });

  it('does not read Android as Linux, though the kernel is', () => {
    expect(isLinux('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36')).toBe(false);
  });

  it('does not read Windows or macOS as Linux', () => {
    expect(isLinux('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')).toBe(false);
    expect(isLinux('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15')).toBe(false);
  });
});
