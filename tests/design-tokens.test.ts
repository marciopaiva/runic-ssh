/**
 * Guards the token system.
 *
 * Two failures this catches are both silent. A literal colour in a component
 * survives every build and quietly ignores the active theme, which is how the
 * custom themes promised for v0.3.0 turn into a rewrite. And a token defined in
 * one theme but not the other renders that theme's text on the other theme's
 * ground — the classic unreadable-interface bug, invisible to whoever is not
 * using that theme.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const tokensFile = join(repoRoot, 'src/styles/tokens.css');

/** Reads one `selector { … }` block. No block here nests, so this is enough. */
function block(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(selector);
  expect(start, `tokens.css has no ${selector} block`).toBeGreaterThan(-1);

  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  const body = css.slice(open + 1, close);

  const found = new Map<string, string>();
  for (const [, name, value] of body.matchAll(/(--rs-[\w-]+)\s*:\s*([^;]+);/g)) {
    if (name !== undefined && value !== undefined) {
      found.set(name, value.trim());
    }
  }
  return found;
}

function themes(): {
  dark: Map<string, string>;
  systemLight: Map<string, string>;
  chosenLight: Map<string, string>;
} {
  const css = readFileSync(tokensFile, 'utf8');
  return {
    dark: block(css, ':root {'),
    systemLight: block(css, ":root:not([data-theme='dark'])"),
    chosenLight: block(css, ":root[data-theme='light']"),
  };
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      sourceFiles(path, out);
    } else if (/\.(ts|tsx|css)$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

describe('token definitions', () => {
  it('defines a palette at all', () => {
    expect(themes().dark.size).toBeGreaterThan(20);
  });

  it('defines every dark token in light too', () => {
    const { dark, systemLight, chosenLight } = themes();

    for (const [name, set] of [
      ['system light', systemLight],
      ['chosen light', chosenLight],
    ] as const) {
      const missing = [...dark.keys()].filter((k) => !set.has(k));
      expect(
        missing,
        `${name} is missing ${missing.join(', ')}; those render dark values on a light ground`,
      ).toEqual([]);
    }
  });

  it('defines no light token that dark does not have', () => {
    const { dark, chosenLight } = themes();
    const extra = [...chosenLight.keys()].filter((k) => !dark.has(k));
    expect(extra, `light defines ${extra.join(', ')} with no dark counterpart`).toEqual([]);
  });

  it('keeps the two light definitions identical', () => {
    /* The palette is written twice, once for the system preference and once for
       an explicit choice. Nothing but this test stops them drifting. */
    const { systemLight, chosenLight } = themes();
    const drifted = [...chosenLight.entries()]
      .filter(([name, value]) => systemLight.get(name) !== value)
      .map(([name]) => name);

    expect(
      drifted,
      `these differ between the media query and the data-theme block: ${drifted.join(', ')}`,
    ).toEqual([]);
  });
});

/**
 * The file with its comments blanked, line numbering intact.
 *
 * A hex in a comment paints nothing, so it is not what this guard is for. It
 * matters because an issue reference is indistinguishable from a three-digit
 * colour: `#123` is both, and every issue number from 100 up would fail this
 * test for being mentioned. That is a guard training people to ignore it,
 * which is worse than a comment nobody checked.
 *
 * Lines are blanked rather than dropped so a reported line number still points
 * at the right line.
 */
function withoutComments(source: string): string[] {
  const out: string[] = [];
  let inBlock = false;

  for (const line of source.split('\n')) {
    let kept = '';
    let at = 0;

    while (at < line.length) {
      if (inBlock) {
        const close = line.indexOf('*/', at);
        if (close < 0) {
          at = line.length;
        } else {
          inBlock = false;
          at = close + 2;
        }
        continue;
      }

      const block = line.indexOf('/*', at);
      const lineComment = line.indexOf('//', at);

      if (lineComment >= 0 && (block < 0 || lineComment < block)) {
        kept += line.slice(at, lineComment);
        break;
      }
      if (block >= 0) {
        kept += line.slice(at, block);
        inBlock = true;
        at = block + 2;
        continue;
      }
      kept += line.slice(at);
      break;
    }

    out.push(kept);
  }

  return out;
}

describe('token usage', () => {
  it('has no literal colour outside the token file', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(join(repoRoot, 'src'))) {
      if (file === tokensFile) continue;

      const lines = withoutComments(readFileSync(file, 'utf8'));
      lines.forEach((line, index) => {
        for (const [hex] of line.matchAll(
          /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g,
        )) {
          offenders.push(`${relative(repoRoot, file)}:${index + 1} ${hex}`);
        }
      });
    }

    expect(
      offenders,
      `a literal colour ignores the active theme:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  /* The guard stopped reading comments so that an issue number would stop
     failing it. These two say the narrowing went only that far: a hex that
     paints is still caught, and the thing it was narrowed for is still let
     through. Without them the next person cannot tell a deliberate exemption
     from a guard that quietly stopped working. */
  it('still catches a literal colour in code', () => {
    const code = withoutComments(
      ['const bad = "#ff5f6b";', 'const worse = { color: \'#0af\' };'].join('\n'),
    ).join('\n');

    expect(code).toContain('#ff5f6b');
    expect(code).toContain('#0af');
  });

  it('lets an issue reference through, in either comment style', () => {
    const prose = withoutComments(
      ['// answered by #123', '/* and by #137 */', 'const fine = 1; // #135'].join('\n'),
    ).join('\n');

    expect(prose).not.toContain('#123');
    expect(prose).not.toContain('#137');
    expect(prose).not.toContain('#135');
    expect(prose).toContain('const fine = 1;');
  });
});
