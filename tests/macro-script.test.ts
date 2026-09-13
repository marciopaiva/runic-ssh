import { describe, expect, it } from 'vitest';

import { ensureTrailingNewline, wrapScript } from '../src/features/macros';

const SESSION = { host: '10.0.4.12', port: 2222, user: 'deploy' };

describe('ensuring a run always submits its last line', () => {
  it('adds a newline when the text has none', () => {
    expect(ensureTrailingNewline('echo hi')).toBe('echo hi\n');
  });

  it('leaves a text that already ends in one alone', () => {
    expect(ensureTrailingNewline('echo hi\n')).toBe('echo hi\n');
  });
});

describe("wrapping a script macro's text", () => {
  it('defaults to sh with no shebang', () => {
    expect(wrapScript('echo hi', SESSION)).toMatch(/^sh <<'RUNIC_MACRO_\w+_EOF'\n/);
  });

  it('reads the interpreter off a leading #! line', () => {
    expect(wrapScript('#!/bin/bash\necho hi', SESSION)).toMatch(/^bash <<'RUNIC_MACRO_\w+_EOF'\n/);
  });

  it('follows an env indirection to the real interpreter', () => {
    expect(wrapScript('#!/usr/bin/env bash\necho hi', SESSION)).toMatch(
      /^bash <<'RUNIC_MACRO_\w+_EOF'\n/,
    );
  });

  it('falls back to sh when env names nothing', () => {
    expect(wrapScript('#!/usr/bin/env\necho hi', SESSION)).toMatch(/^sh <<'RUNIC_MACRO_\w+_EOF'\n/);
  });

  it("exports host, port and username inside the heredoc, not ahead of it", () => {
    const wrapped = wrapScript('echo hi', SESSION);
    const [openLine, ...rest] = wrapped.split('\n');
    expect(openLine).toMatch(/^sh <<'RUNIC_MACRO_\w+_EOF'$/);
    expect(rest.slice(0, 3)).toEqual([
      "export host='10.0.4.12'",
      "export port='2222'",
      "export username='deploy'",
    ]);
  });

  it('single-quotes a value that itself contains an apostrophe', () => {
    const wrapped = wrapScript('echo hi', { ...SESSION, user: "o'brien" });
    expect(wrapped).toContain(`export username='o'\\''brien'`);
  });

  it("ends the body with the same marker the opening line named", () => {
    const wrapped = wrapScript('echo hi', SESSION);
    const marker = /^sh <<'(RUNIC_MACRO_\w+_EOF)'$/.exec(wrapped.split('\n')[0] ?? '')?.[1];
    expect(marker).toBeDefined();
    expect(wrapped.trimEnd().endsWith(`\n${marker}`)).toBe(true);
  });

  it('gives the body a trailing newline before the closing marker even without one', () => {
    const wrapped = wrapScript('echo hi', SESSION);
    expect(wrapped).toContain('echo hi\nRUNIC_MACRO_');
  });

  it('never reuses the same marker twice in a row', () => {
    const first = wrapScript('echo hi', SESSION).split('\n')[0];
    const second = wrapScript('echo hi', SESSION).split('\n')[0];
    expect(first).not.toBe(second);
  });
});
