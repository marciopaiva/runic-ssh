/**
 * Guards the wall ADR-0008 rests on.
 *
 * The argument for collecting a credential in its own window is that the
 * window never renders a byte a remote host chose. That is a claim about what
 * code can run in that document — and a claim about code is only worth
 * anything if something checks it.
 *
 * So this walks the import graph from the credential entry point and fails if
 * it can reach the terminal, the session machinery, or anything that decodes
 * remote output. Checking the source rather than the bundle is deliberate: it
 * fails the moment somebody writes the import, not after a build somebody
 * might not run.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Anything that renders, decodes or subscribes to what a host sent. */
const FORBIDDEN = [
  /^@xterm\//,
  /features\/terminal/,
  /components\/TerminalView/,
  /features\/status/,
  /ipc\/terminal/,
];

const IMPORT = /(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;

function candidates(specifier: string, from: string): string[] {
  const base = resolve(dirname(from), specifier);

  return [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ];
}

function read(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Every module reachable from an entry point, and every bare specifier it
 * imports along the way.
 */
function graph(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const current = queue.pop();
    if (current === undefined || files.has(current)) continue;

    const source = read(current);
    if (source === null) continue;
    files.add(current);

    for (const [, specifier] of source.matchAll(IMPORT)) {
      if (specifier === undefined) continue;

      if (!specifier.startsWith('.')) {
        packages.add(specifier);
        continue;
      }

      for (const candidate of candidates(specifier, current)) {
        if (read(candidate) !== null) {
          queue.push(candidate);
          break;
        }
      }
    }
  }

  return { files, packages };
}

function reachable(entry: string): string[] {
  const { files, packages } = graph(resolve(root, entry));

  return [
    ...[...files].map((file) => file.slice(root.length)),
    ...packages,
  ].filter((name) => FORBIDDEN.some((pattern) => pattern.test(name)));
}

describe('the credential window', () => {
  it('cannot reach anything that renders remote output', () => {
    /* ADR-0008's whole argument. If this list is ever non-empty, the prompt
       shares a document with code that decodes what a host sent, and the
       reason for a separate window is gone. */
    expect(reachable('src/credential/main.tsx')).toEqual([]);
  });

  it('is checked against an entry point that does reach it', () => {
    /* The negative test above passes trivially if the patterns match nothing
       or the walker never walks. This is what proves neither is true. */
    expect(reachable('src/main.tsx').length).toBeGreaterThan(0);
  });

  it('has its own document rather than a route in the main one', () => {
    const html = readFileSync(resolve(root, 'credential.html'), 'utf8');

    expect(html).toContain('/src/credential/main.tsx');
    expect(html).not.toContain('/src/main.tsx');
  });

  it('is built as its own entry, so the two never share a bundle', () => {
    const config = readFileSync(resolve(root, 'vite.config.ts'), 'utf8');

    expect(config).toContain('credential.html');
  });

  it('never renders a rejection from the call that carried the secret', () => {
    /* CLAUDE.md 7.2, in the one place it is easiest to break by accident. A
       rejection that did not come from the core — the bridge failing, serde
       refusing to read an argument — is exactly the kind that quotes what it
       could not read, and the argument here is the password. Stringifying it
       would put the secret on the screen and in the DOM.

       The fetch above it may stringify: that call carries a request id. This
       checks only the handler that follows `submitCredential`. */
    const source = readFileSync(resolve(root, 'src/credential/CredentialWindow.tsx'), 'utf8');
    const start = source.indexOf('submitCredential(');

    expect(start, 'the submit call moved or was renamed').toBeGreaterThan(-1);

    const handler = source
      .slice(start, source.indexOf('.finally(', start))
      /* Comments out, or this matches the one explaining why the code does
         not do it. */
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    expect(handler.length, 'the catch handler could not be located').toBeGreaterThan(0);
    expect(handler).not.toMatch(/String\s*\(\s*rejection/);
    expect(handler).not.toMatch(/JSON\.stringify/);
  });
});
