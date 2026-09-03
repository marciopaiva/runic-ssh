// @vitest-environment jsdom
//
// Scoped to this file rather than set in `vite.config.ts`, the same reason
// `terminal-teardown.test.ts` scopes it: jsdom's `URL` disagrees with
// Node's about what a relative `import.meta.url` resolves to, which every
// other test in this directory relies on.

/**
 * A recursive folder copy (ADR-0049) must recreate the copied folder
 * itself at the destination, not pour its contents loose into whatever
 * pane it was dropped on. `useFanout`'s own `runFolderCopy` used to walk
 * straight from the copied folder's own listing, so a folder named
 * "probe" containing `a.txt` and `sub/` landed as `a.txt` and `sub/`
 * directly inside the destination, with no "probe" directory ever
 * created. Reported directly against the real fixture: copying a folder
 * that itself contained a subdirectory made the missing wrapper obvious,
 * since files and folders from inside it appeared to spill straight into
 * the destination's own listing.
 *
 * `sftpMkdir`/`localMkdir` and the transfer functions are mocked; what is
 * under test is the order and the paths `useFanout` calls them with, not
 * whether a real SFTP server accepts a `create_dir`.
 *
 * A second, separate bug surfaced chasing a report against this same
 * copy: it would stop partway through and never move again. A transfer
 * used to be watched for its own ending only after the frontend already
 * had a handle back from `sftpUpload` and its kin, by which point a fast
 * local transfer could already have finished and emitted the event
 * nothing was listening for yet. Copying several small local files back
 * to back, exactly what a folder copy does, made the race easy to lose.
 * The mock's `startTransfer` fires that event before the handle is even
 * returned, the worst case the fix (a subscription made once, before any
 * transfer starts, plus a map of endings nobody has claimed yet) has to
 * survive.
 */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/* `onAnyFinished` is registered exactly once, at `useFanout`'s own mount
 * (the fix under test): this mock keeps that one callback and calls it
 * itself, from each transfer-shaped function, the same "already
 * listening before any transfer starts" order the real fix relies on. A
 * per-handle `onFinished(transfer, cb)` mock would not exercise this at
 * all, since it could never race anything by construction.
 *
 * Firing `finishedCallback` synchronously, before `startTransfer` even
 * returns the handle, is deliberate: it reproduces the exact race a fast
 * local transfer won against the frontend, which learns a transfer's own
 * handle only once the surrounding `await` resolves. `waitForFinished`
 * (`use-fanout.ts`) has to find this in its own unclaimed-outcomes map
 * rather than missing it, or this test hangs the same way the real bug
 * did. */
interface FakeFinishedEvent {
  readonly transfer: number;
  readonly outcome: string;
  readonly path?: string;
  readonly error?: { readonly code: string };
}

const ipc = vi.hoisted(() => {
  let finishedCallback: ((event: FakeFinishedEvent) => void) | null = null;
  let nextTransfer = 1;

  const startTransfer = async (): Promise<number> => {
    const transfer = nextTransfer;
    nextTransfer += 1;
    finishedCallback?.({ transfer, outcome: 'succeeded', path: 'irrelevant' });
    return transfer;
  };

  return {
    localListDirectory: vi.fn(),
    localMkdir: vi.fn(async (dir: string, name: string) => `${dir}/${name}`),
    localRemove: vi.fn(async () => undefined),
    localRename: vi.fn(async (dir: string, _old: string, name: string) => `${dir}/${name}`),
    onAnyFinished: vi.fn(async (onDone: (event: FakeFinishedEvent) => void) => {
      finishedCallback = onDone;
      return () => {
        finishedCallback = null;
      };
    }),
    onAnyProgress: vi.fn(async () => () => {}),
    /* A cancelled transfer still ends through the ordinary `FINISHED_EVENT`
     * (`commands::sftp`'s own doc comment: `sftp_cancel` never rejects, the
     * transfer it aborts reports its own ending the usual way), tagged
     * with the error `SftpError::Cancelled` maps to. */
    sftpCancel: vi.fn(async (transfer: number) => {
      finishedCallback?.({ transfer, outcome: 'failed', error: { code: 'sftpTransferCancelled' } });
    }),
    sftpDownload: vi.fn(startTransfer),
    sftpList: vi.fn(),
    sftpMkdir: vi.fn(async (_handle: number, dir: string, name: string) => `${dir}/${name}`),
    sftpRemove: vi.fn(async () => undefined),
    sftpRename: vi.fn(async (_handle: number, dir: string, _old: string, name: string) => `${dir}/${name}`),
    sftpTransfer: vi.fn(startTransfer),
    sftpUpload: vi.fn(startTransfer),
  };
});
vi.mock('../src/ipc', () => ipc);

const stubTranslator = {
  locale: 'en',
  t: (key: string) => key,
  number: (value: number) => String(value),
  bytes: (value: number) => String(value),
  plural: () => 'other' as const,
};
vi.mock('../src/features/settings', () => ({ useTranslator: () => stubTranslator }));

const { useFanout, destinationPaneId } = await import('../src/features/sftp/use-fanout');
type UseFanoutReturn = ReturnType<typeof useFanout>;

function Probe({ onReady }: { readonly onReady: (value: UseFanoutReturn) => void }): null {
  const fanout = useFanout([]);
  onReady(fanout);
  return null;
}

async function mountProbe() {
  const rootEl = document.createElement('div');
  document.body.appendChild(rootEl);
  const root = createRoot(rootEl);

  let latest!: UseFanoutReturn;
  await act(async () => {
    root.render(createElement(Probe, { onReady: (value) => (latest = value) }));
  });

  return {
    get current() {
      return latest;
    },
    async rerender() {
      await act(async () => {
        root.render(createElement(Probe, { onReady: (value) => (latest = value) }));
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      rootEl.remove();
    },
  };
}

beforeEach(() => {
  for (const mock of Object.values(ipc)) mock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sending a folder recreates it at the destination', () => {
  it('creates the copied folder itself before anything inside it', async () => {
    /* "probe" contains one file and one subdirectory, itself holding
       another file: the exact shape that made the missing wrapper
       obvious against the real fixture. */
    ipc.localListDirectory.mockImplementation(async (path: string | null) => {
      if (path === '/home/paiva/probe') {
        return {
          path,
          parent: '/home/paiva',
          entries: [
            { name: 'a.txt', path: '/home/paiva/probe/a.txt', isDir: false, isSymlink: false, size: 1, modifiedUnixSecs: null },
            { name: 'sub', path: '/home/paiva/probe/sub', isDir: true, isSymlink: false, size: 0, modifiedUnixSecs: null },
          ],
        };
      }
      if (path === '/home/paiva/probe/sub') {
        return {
          path,
          parent: '/home/paiva/probe',
          entries: [
            { name: 'b.txt', path: '/home/paiva/probe/sub/b.txt', isDir: false, isSymlink: false, size: 1, modifiedUnixSecs: null },
          ],
        };
      }
      throw new Error(`unexpected localListDirectory(${path})`);
    });

    const probe = await mountProbe();

    await act(async () => {
      probe.current.setSource({ kind: 'local' });
      probe.current.addDestination({ kind: 'remote', sessionId: 'fixture', handle: 7 });
    });
    await probe.rerender();

    await act(async () => {
      probe.current.reportPane(destinationPaneId(0), { path: '/home/deploy', reload: () => {} });
    });
    await probe.rerender();

    await act(async () => {
      probe.current.sendToDestinations({
        name: 'probe',
        path: '/home/paiva/probe',
        isDir: true,
        isSymlink: false,
        size: 0,
        modifiedUnixSecs: null,
      });
    });

    await vi.waitFor(() => {
      expect(ipc.sftpUpload).toHaveBeenCalledTimes(2);
    });

    /* The copied folder's own directory, created first and named after
       itself: the bug this guards fixed was this call never happening
       at all. */
    expect(ipc.sftpMkdir).toHaveBeenCalledWith(7, '/home/deploy', 'probe');
    /* The subdirectory inside it, created under the new wrapper, not
       under the destination's own root. */
    expect(ipc.sftpMkdir).toHaveBeenCalledWith(7, '/home/deploy/probe', 'sub');
    /* Both files land inside the wrapper too, `a.txt` at its own level
       and `b.txt` one level further in, never directly in `/home/deploy`. */
    expect(ipc.sftpUpload).toHaveBeenCalledWith(7, '/home/paiva/probe/a.txt', '/home/deploy/probe');
    expect(ipc.sftpUpload).toHaveBeenCalledWith(7, '/home/paiva/probe/sub/b.txt', '/home/deploy/probe/sub');

    /* mkdir precedes the calls that depend on it. */
    const order = [...ipc.sftpMkdir.mock.invocationCallOrder, ...ipc.sftpUpload.mock.invocationCallOrder].sort(
      (a, b) => a - b,
    );
    const wrapperMkdirAt = ipc.sftpMkdir.mock.invocationCallOrder[0];
    const firstUploadAt = ipc.sftpUpload.mock.invocationCallOrder[0];
    expect(wrapperMkdirAt).toBeDefined();
    expect(firstUploadAt).toBeDefined();
    expect(wrapperMkdirAt as number).toBeLessThan(firstUploadAt as number);
    expect(order.length).toBe(4);

    await probe.unmount();
  });
});

describe('cancelling a folder copy', () => {
  /* Reported directly, alongside the stall this file's other test guards:
   * while a copy was stuck, its own Cancel button did nothing either.
   * Both had the same cause. `cancelFolderCopy` only ever set a flag the
   * stuck loop was never going to check again, since it was permanently
   * parked on a promise for an event that had already been lost. Fixing
   * the loss (the fix above) is what makes a flag set while a file is
   * genuinely still in flight reach anywhere at all: this test holds one
   * file open on purpose and checks cancelling it actually stops the copy,
   * rather than assuming the other fix covered this by implication. */
  it('stops after the file in flight, starts no more, and marks the copy cancelled', async () => {
    ipc.localListDirectory.mockImplementation(async (path: string | null) => {
      if (path === '/home/paiva/probe') {
        return {
          path,
          parent: '/home/paiva',
          entries: [
            { name: 'x.txt', path: '/home/paiva/probe/x.txt', isDir: false, isSymlink: false, size: 1, modifiedUnixSecs: null },
            { name: 'y.txt', path: '/home/paiva/probe/y.txt', isDir: false, isSymlink: false, size: 1, modifiedUnixSecs: null },
          ],
        };
      }
      throw new Error(`unexpected localListDirectory(${path})`);
    });

    /* Unlike every other upload in this file's mock, this one does not
     * fire its own ending: it stays in flight, the way a real transfer
     * against a real connection does for at least a moment, until this
     * test cancels it. */
    ipc.sftpUpload.mockImplementationOnce(async () => 1);

    const probe = await mountProbe();

    await act(async () => {
      probe.current.setSource({ kind: 'local' });
      probe.current.addDestination({ kind: 'remote', sessionId: 'fixture', handle: 7 });
    });
    await probe.rerender();

    await act(async () => {
      probe.current.reportPane(destinationPaneId(0), { path: '/home/deploy', reload: () => {} });
    });
    await probe.rerender();

    await act(async () => {
      probe.current.sendToDestinations({
        name: 'probe',
        path: '/home/paiva/probe',
        isDir: true,
        isSymlink: false,
        size: 0,
        modifiedUnixSecs: null,
      });
    });

    await vi.waitFor(() => {
      expect(ipc.sftpUpload).toHaveBeenCalledTimes(1);
    });
    await probe.rerender();

    const id = probe.current.folderCopies[0]?.id;
    expect(id).toBeDefined();

    await act(async () => {
      probe.current.cancelFolderCopy(id as string);
    });

    await vi.waitFor(() => {
      expect(probe.current.folderCopies.find((copy) => copy.id === id)?.status).toBe('cancelled');
    });

    expect(ipc.sftpCancel).toHaveBeenCalledWith(1);
    /* `y.txt` was never dispatched: cancelling reached the file actually
       in flight and stopped the walk before it could start another. */
    expect(ipc.sftpUpload).toHaveBeenCalledTimes(1);

    await probe.unmount();
  });
});
