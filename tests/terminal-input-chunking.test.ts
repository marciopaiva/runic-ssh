/**
 * Guards that a large paste arrives whole, and in the order it was pasted.
 *
 * `commands/terminal.rs` refuses any single `send_input` above 32 KiB, so a
 * hostile host cannot make the core allocate without bound. A pasted private
 * key is comfortably past that, and until this split existed the refusal landed
 * on a promise nobody awaited: the paste vanished and the terminal said
 * nothing.
 *
 * Splitting one write in order is only half of it. Two writes overlapping on
 * one session would interleave their pieces, which typing into several sessions
 * at once turns from rare into ordinary, so the queue is asserted here too.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Call {
  readonly handle: number;
  readonly data: string;
}

const sent: Call[] = [];

/** Held between the call and its answer, so a slow host can be written down. */
let gate: ((call: Call) => Promise<void>) | null = null;

vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (command: string, args: Call): Promise<void> => {
    if (command !== 'send_input') return;
    if (gate !== null) await gate(args);
    sent.push(args);
  },
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: async (): Promise<() => void> => () => {},
}));

const { sendInput } = await import('../src/ipc/terminal');

const HANDLE = 1 as unknown as Parameters<typeof sendInput>[0];
const OTHER = 2 as unknown as Parameters<typeof sendInput>[0];
const LIMIT = 32 * 1024;

function delivered(): Uint8Array {
  return new Uint8Array(Buffer.concat(sent.map((call) => Buffer.from(call.data, 'base64'))));
}

function text(at: number): string {
  return Buffer.from(sent[at]?.data ?? '', 'base64').toString('utf8');
}

beforeEach(() => {
  sent.length = 0;
  gate = null;
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
      expect(Buffer.from(piece.data, 'base64').length).toBeLessThanOrEqual(LIMIT);
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

    expect(sent.map((call) => call.data)).toEqual(['']);
  });

  it('delivers the pieces in the order they were pasted', async () => {
    const text = new TextEncoder().encode('A'.repeat(LIMIT) + 'B'.repeat(LIMIT) + 'C');

    await sendInput(HANDLE, text);

    const arrived = new TextDecoder().decode(delivered());
    expect(arrived.indexOf('B')).toBe(LIMIT);
    expect(arrived.endsWith('C')).toBe(true);
  });
});

describe('what happens when two writes overlap', () => {
  it('does not interleave the pieces of one session', async () => {
    /* Without a queue the second write starts between the first write's two
       pieces, because that is exactly where the first one yields. A keystroke
       landing in the middle of a pasted key is not something the host can be
       asked to sort out. */
    const long = new TextEncoder().encode('A'.repeat(LIMIT) + 'B'.repeat(LIMIT));
    const short = new TextEncoder().encode('!');

    const first = sendInput(HANDLE, long);
    const second = sendInput(HANDLE, short);
    await Promise.all([first, second]);

    expect(sent).toHaveLength(3);
    expect(text(0).startsWith('A')).toBe(true);
    expect(text(1).startsWith('B')).toBe(true);
    expect(text(2)).toBe('!');
  });

  it('lets the next write through after one is refused', async () => {
    /* The core refuses a write it considers malformed. One refusal must not
       become a session that has stopped accepting keystrokes. */
    let calls = 0;
    gate = (): Promise<void> => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error('malformedInput')) : Promise.resolve();
    };

    const refused = sendInput(HANDLE, new TextEncoder().encode('bad'));
    const after = sendInput(HANDLE, new TextEncoder().encode('good'));

    await expect(refused).rejects.toThrow('malformedInput');
    await expect(after).resolves.toBeUndefined();
    expect(sent).toHaveLength(1);
    expect(text(0)).toBe('good');
  });

  it('does not let a slow session hold up a different one', async () => {
    /* The queue is per handle. Typing into four sessions at once would be
       useless if the slowest one set the pace for all of them. */
    let release = (): void => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    gate = (call: Call): Promise<void> =>
      call.handle === 1 ? held : Promise.resolve();

    const slow = sendInput(HANDLE, new TextEncoder().encode('slow'));
    const quick = sendInput(OTHER, new TextEncoder().encode('quick'));

    await quick;
    expect(sent).toHaveLength(1);
    expect(text(0)).toBe('quick');

    release();
    await slow;
    expect(text(1)).toBe('slow');
  });
});
