// @vitest-environment jsdom
//
// Scoped to this file rather than set in `vite.config.ts`: see
// `shape-control-teardown.test.ts` for why jsdom is opted in per file.

/**
 * Turning the map preview back off (ADR-0073) had no route once the general
 * palette's `preview:map` command was removed: the map pill already opens
 * `MapPreviewPrompt` to turn it on, but nothing turned it off from inside
 * Map itself. This pins the button App.tsx renders in the map's own
 * `toolbarTrailing` branch, source-checked the same way
 * `workspace-pills.test.ts` pins the pills in `toolbarLeading`, since the
 * button is not its own component.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe("the map's toolbar carries a way to turn the preview back off", () => {
  const source = readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf8');

  it('calls choosePreviewFeatures(false) from a button in the map toolbarTrailing branch', () => {
    const mapBranch = source.indexOf("workspace === 'map' ? (", source.indexOf('const toolbarTrailing ='));
    const nextBranch = source.indexOf(') : (', mapBranch);
    expect(mapBranch, 'the map branch of toolbarTrailing').toBeGreaterThan(-1);
    expect(nextBranch, 'the end of toolbarTrailing').toBeGreaterThan(mapBranch);

    const branchSource = source.slice(mapBranch, nextBranch);
    expect(branchSource).toContain('choosePreviewFeatures(false)');
    expect(branchSource).toContain("command.preview.hideMap");
  });
});
