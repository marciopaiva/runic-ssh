/**
 * ADR-0071: the sidebar is summoned as an overlay rather than reflowing the
 * layout, so it no longer needs to start open just to be discoverable. This
 * pins `sidebarOpen`'s initial value literally, the same way
 * `tests/no-terminal-in-home.test.ts` pins the gate around it, so a revert
 * back to `useState(true)` fails here instead of only showing up as a visual
 * regression on first launch.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));
const source = readFileSync(path.join(here, '..', 'src', 'App.tsx'), 'utf8');

describe('the sidebar overlay starts closed (ADR-0071)', () => {
  it('declares sidebarOpen with useState(false)', () => {
    expect(source).toContain('const [sidebarOpen, setSidebarOpen] = useState(false);');
  });
});
