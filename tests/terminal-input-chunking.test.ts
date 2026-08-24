/**
 * Guards that a large paste arrives whole, and in the order it was pasted.
 *
 * `commands/terminal.rs` refuses any single `send_input` above 32 KiB, so a
 * hostile host cannot make the core allocate without bound. A pasted private
 * key is comfortably past that, and until this split existed the refusal landed
 * on a promise nobody awaited: the paste vanished and the terminal said
 * nothing.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const sent: string[] = [];

vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (command: string, args: { readonly data: string }): Promise<void> => {
    if (command === 'send_input') sent.push(args.data);
  },
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: async (): Promise<() => void> => () => {},
}));

const { sendInput } = await import('../src/ipc/terminal');

const HANDLE = 'a1b2c3' as unknown as Parameters<typeof sendInput>[0];
const LIMIT = 32 * 1024;

function delivered(): Uint8Array {
  return new Uint8Array(Buffer.concat(sent.map((piece) => Buffer.from(piece, 'base64'))));
}

beforeEach(() => {
  sent.length = 0;
});

describe('what crosses to the core', () => {
  it('sends an ordinary keystroke as one call', () => {
    /* The common case by far, and it must not grow a loop's worth of calls. */
    return sendInput(HANDLE, new Uint8Array([0x03])).then(() => {
      expect(sent).toHaveLength(1);
      expect(delivered()).toEqual(new Uint8Array([0x03]));
    });
  });

  it('splits a paste the core would refuse whole', async () => {
    const key = new Uint8Array(LIMIT * 2 + 500);
    for (let i = 0; i < key.length; i += 1) key[i] = i % 251;

    await sendInput(HANDLE, key);

    expect(sent).toHaveLength(3);
    expect(delivered()).toEqual(key);
  });

  it('keeps every piece inside the limit the core enforces', async () => {
    await sendInput(HANDLE, new Uint8Array(LIMIT * 3 + 1));

    for (const piece of sent) {
      expect(Buffer.from(piece, 'base64').length).toBeLessThanOrEqual(LIMIT);
    }
  });

  it('sends exactly one call for input that is exactly the limit', () => {
    /* The boundary the core allows: it refuses what is *larger* than the
       limit, so splitting here would be a wasted round trip. */
    return sendInput(HANDLE, new Uint8Array(LIMIT)).then(() => {
      expect(sent).toHaveLength(1);
    });
  });

  it('still sends something when there is nothing to send', async () => {
    /* An empty write is a write. Dropping it here would be a silent change to
       what the host sees. */
    await sendInput(HANDLE, new Uint8Array(0));

    expect(sent).toEqual(['']);
  });

  it('delivers the pieces in the order they were pasted', async () => {
    const text = new TextEncoder().encode('A'.repeat(LIMIT) + 'B'.repeat(LIMIT) + 'C');

    await sendInput(HANDLE, text);

    const arrived = new TextDecoder().decode(delivered());
    expect(arrived.indexOf('B')).toBe(LIMIT);
    expect(arrived.endsWith('C')).toBe(true);
  });
});
