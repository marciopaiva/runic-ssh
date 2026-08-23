/**
 * Guards how the workflows reference the code they run.
 *
 * Section 4 of `docs/security-model.md` names a supply chain attacker as an
 * adversary. An action is the sharpest version of that: code from another
 * repository, executed with access to this one and to CI secrets, referenced
 * by a pointer its owner can move. So every `uses:` is pinned to a commit.
 *
 * That rule lived in a comment at the top of three files, which is a rule
 * nothing enforces. `.github/dependabot.yml` now keeps the pins current; this
 * keeps them pins.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const WORKFLOWS = fileURLToPath(new URL('../.github/workflows', import.meta.url));

interface Use {
  readonly file: string;
  readonly line: number;
  readonly ref: string;
  /** `actions/checkout`, or a third party. */
  readonly action: string;
  /** The `# v1.2.3` beside the SHA, if there is one. */
  readonly comment: string | null;
}

function uses(): readonly Use[] {
  const found: Use[] = [];

  for (const file of readdirSync(WORKFLOWS).filter((name) => name.endsWith('.yml'))) {
    const text = readFileSync(`${WORKFLOWS}/${file}`, 'utf8');

    text.split('\n').forEach((line, index) => {
      const match = /^\s*uses:\s*(\S+?)@(\S+)\s*(?:#\s*(.*))?$/.exec(line);
      if (match === null) return;

      found.push({
        file,
        line: index + 1,
        action: match[1] ?? '',
        ref: match[2] ?? '',
        comment: match[3]?.trim() ?? null,
      });
    });
  }

  return found;
}

describe('the actions the workflows run', () => {
  it('finds the uses this file is meant to be guarding', () => {
    /* Every assertion below passes vacuously against an empty list, and a
       regex that stops matching is a silent way to get there. */
    expect(uses().length).toBeGreaterThanOrEqual(5);
  });

  it('pins every one to a commit rather than a tag', () => {
    /* The whole rule. A tag is a pointer its owner can move, and moving it
       replaces the code that runs here — with no diff, no pull request and
       nothing in this repository changing. */
    for (const use of uses()) {
      expect(use.ref, `${use.file}:${use.line} pins ${use.action} to a movable ref`).toMatch(
        /^[0-9a-f]{40}$/,
      );
    }
  });

  it('says beside each SHA which version it is', () => {
    /* A bare 40-character hash tells a reviewer nothing about whether it is
       current. The comment is what makes the pin legible, and Dependabot
       rewrites it together with the SHA. */
    for (const use of uses()) {
      expect(use.comment, `${use.file}:${use.line} pins ${use.action} with no version`).toMatch(
        /^v\d+\.\d+\.\d+$/,
      );
    }
  });

  it('runs only actions GitHub owns', () => {
    /* The narrower half of the same rule, and the reason the release job in
       package.yml publishes through the `gh` CLI already on the runner rather
       than through the action everyone reaches for first. */
    for (const use of uses()) {
      expect(use.action, `${use.file}:${use.line} runs a third-party action`).toMatch(
        /^actions\//,
      );
    }
  });

  it('pins one SHA per action across every workflow', () => {
    /* Three files use `actions/checkout`. Bumping two of the three leaves a
       repository that runs two versions of the same action and reads as
       though it runs one — and the odd one out is whichever file the next
       person does not open. */
    const byAction = new Map<string, Set<string>>();

    for (const use of uses()) {
      const refs = byAction.get(use.action) ?? new Set<string>();
      refs.add(`${use.ref} ${use.comment ?? ''}`.trim());
      byAction.set(use.action, refs);
    }

    for (const [action, refs] of byAction) {
      expect([...refs], `${action} is pinned to more than one commit`).toHaveLength(1);
    }
  });

  it('is watched by something that will notice when a pin goes stale', () => {
    /* The pins were all current on 2026-08-23 except two, which were behind
       by two and three major versions — one of them added the day before by
       someone who was writing about supply chain security at the time. Pins
       do not age visibly, so this asserts the watch exists at all. */
    const dependabot = readFileSync(
      fileURLToPath(new URL('../.github/dependabot.yml', import.meta.url)),
      'utf8',
    );

    expect(dependabot).toContain('package-ecosystem: github-actions');
  });
});
