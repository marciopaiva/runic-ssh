/**
 * Guards the build configuration.
 *
 * Three settings in this project are load-bearing in ways that are invisible
 * once they drift: the compiler flags that make section 6 of CLAUDE.md hold,
 * the dev server port the shell points at, and the source map that a release
 * build must not emit. None of them fails loudly on its own, so they are
 * asserted here instead of trusted to review.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import viteConfig from '../vite.config';

const repoRoot = new URL('..', import.meta.url);
const at = (relative: string): string =>
  fileURLToPath(new URL(relative, repoRoot));

function readTsconfig(): Record<string, unknown> {
  const path = at('tsconfig.json');
  const parsed = ts.readConfigFile(path, (file) => readFileSync(file, 'utf8'));

  expect(parsed.error, 'tsconfig.json does not parse').toBeUndefined();

  const config = parsed.config as { compilerOptions?: Record<string, unknown> };
  return config.compilerOptions ?? {};
}

describe('TypeScript configuration', () => {
  /* Section 6 asks for strict mode, no `any`, and no non-null assertion used
     to silence the compiler. `strict` alone leaves the rest of these open. */
  const required = [
    'strict',
    'noUncheckedIndexedAccess',
    'exactOptionalPropertyTypes',
    'noImplicitOverride',
    'noPropertyAccessFromIndexSignature',
    'noUnusedLocals',
    'noUnusedParameters',
  ] as const;

  it.each(required)('has %s enabled', (flag) => {
    expect(
      readTsconfig()[flag],
      `${flag} was turned off; section 6 of CLAUDE.md depends on it`,
    ).toBe(true);
  });
});

describe('Vite configuration', () => {
  it('refuses to fall back to another dev server port', () => {
    /* `tauri.conf.json` points devUrl at a fixed port. Without strictPort,
       Vite moves to the next free one and the shell opens a blank window
       instead of failing. */
    expect(viteConfig.server?.strictPort).toBe(true);
  });

  it('serves the dev server on the port the shell expects', () => {
    const tauri = JSON.parse(
      readFileSync(at('src-tauri/tauri.conf.json'), 'utf8'),
    ) as { build: { devUrl: string } };

    const expected = Number(new URL(tauri.build.devUrl).port);

    expect(
      viteConfig.server?.port,
      'the Vite port and tauri.conf.json devUrl have drifted apart',
    ).toBe(expected);
  });

  it('emits no source map in a release build', () => {
    /* A source map hands anyone who opens the bundle a readable map of the
       IPC surface. */
    expect(viteConfig.build?.sourcemap).toBe(false);
  });
});
