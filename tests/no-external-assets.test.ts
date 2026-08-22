/**
 * Guards the no-egress rule for assets.
 *
 * Rule 5 of docs/security-model.md rules out a network call to a host the user
 * did not configure, and the CSP in tauri.conf.json admits no external origin.
 * A stylesheet link to a font host would break both, and it is the single most
 * likely way for it to happen: linking Google Fonts is the reflex, it looks
 * harmless, and it works in `pnpm dev` because a dev server has no CSP.
 *
 * An SSH client that contacts a CDN on launch tells that CDN when its user
 * starts work, and from where.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

function scannedFiles(): string[] {
  const files = [join(repoRoot, 'index.html')];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(ts|tsx|css|html)$/.test(entry.name)) files.push(path);
    }
  };
  walk(join(repoRoot, 'src'));

  return files;
}

/** Reports `file:line match` for every regex hit across the scanned tree. */
function findAll(pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const file of scannedFiles()) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        for (const [match] of line.matchAll(pattern)) {
          hits.push(`${relative(repoRoot, file)}:${index + 1} ${match.trim()}`);
        }
      });
  }
  return hits;
}

describe('shipped assets', () => {
  it('loads nothing from an external origin', () => {
    /* Every asset the app renders has to come from the bundle. */
    const hits = findAll(/url\(\s*['"]?https?:\/\/[^)]*/gi);

    expect(
      hits,
      `these fetch from outside the bundle at runtime:\n  ${hits.join('\n  ')}`,
    ).toEqual([]);
  });

  it('links no font host', () => {
    const hits = findAll(/fonts\.(?:googleapis|gstatic)\.com/gi);

    expect(
      hits,
      `a font host reference reintroduces the egress rule 5 forbids:\n  ${hits.join('\n  ')}`,
    ).toEqual([]);
  });

  it('has no remote stylesheet or script tag', () => {
    const hits = findAll(
      /<(?:link|script)\b[^>]*\b(?:href|src)\s*=\s*["']https?:\/\/[^"']*/gi,
    );

    expect(
      hits,
      `a remote tag bypasses the bundle:\n  ${hits.join('\n  ')}`,
    ).toEqual([]);
  });

  it('declares both bundled faces locally', () => {
    const css = readFileSync(join(repoRoot, 'src/styles/fonts.css'), 'utf8');

    expect(css).toContain("font-family: 'Manrope'");
    expect(css).toContain("font-family: 'JetBrains Mono'");
    /* Relative paths only: an absolute one would leave the bundle. */
    for (const [, url] of css.matchAll(/src:\s*url\(["']([^"']+)["']\)/g)) {
      expect(url, `${url} is not a bundle-relative path`).toMatch(/^\.\//);
    }
  });
});
