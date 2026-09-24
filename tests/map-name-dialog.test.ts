// @vitest-environment jsdom
//
// Scoped to this file for the reason `map-stage-teardown.test.ts` gives.

/**
 * `NameDialog`'s own limit (#387): it used to check every name against
 * `MAX_VISION_NAME`, even a layer's, which has its own `MAX_LAYER_NAME`. The
 * caller now passes the limit that applies; this pins that the dialog
 * actually enforces whatever it is given, not a constant of its own.
 */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import { createTranslator } from '../src/lib/i18n';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const translator = createTranslator('en');
vi.mock('../src/features/settings', () => ({ useTranslator: () => translator }));

const { NameDialog } = await import('../src/components/map/NameDialog');

async function mount(maxLength: number, onSave: (name: string) => void) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(NameDialog, {
        title: 'Name it',
        body: 'Pick a name.',
        initial: '',
        maxLength,
        onSave,
        onClose: () => {},
      }),
    );
  });
  const input = host.querySelector('input') as HTMLInputElement;
  const save = host.querySelector('button') as HTMLButtonElement;
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  return {
    input,
    save,
    async type(value: string) {
      await act(async () => {
        nativeSetter?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

describe("NameDialog's max length comes from its caller", () => {
  it('renders the input with the given maxLength', async () => {
    const harness = await mount(5, () => {});
    expect(harness.input.maxLength).toBe(5);
    await harness.unmount();
  });

  it('accepts a name at the limit and disables save past it', async () => {
    const saved: string[] = [];
    const harness = await mount(5, (name) => saved.push(name));

    await harness.type('abcde');
    expect(harness.save.disabled).toBe(false);

    await harness.type('abcdef');
    expect(harness.save.disabled).toBe(true);

    harness.save.click();
    expect(saved).toEqual([]);
    await harness.unmount();
  });

  it('a limit of one caller does not bleed into another mount', async () => {
    const tight = await mount(3, () => {});
    await tight.type('abcd');
    expect(tight.save.disabled).toBe(true);
    await tight.unmount();

    const loose = await mount(30, () => {});
    await loose.type('abcd');
    expect(loose.save.disabled).toBe(false);
    await loose.unmount();
  });
});
