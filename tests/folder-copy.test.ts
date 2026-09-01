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
 */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ipc = vi.hoisted(() => ({
  chooseUploadSource: vi.fn(async () => null),
  localListDirectory: vi.fn(),
  localMkdir: vi.fn(async (dir: string, name: string) => `${dir}/${name}`),
  localRemove: vi.fn(async () => undefined),
  localRename: vi.fn(async (dir: string, _old: string, name: string) => `${dir}/${name}`),
  onFinished: vi.fn(async (_transfer: number, onDone: (outcome: unknown) => void) => {
    queueMicrotask(() => onDone({ outcome: 'succeeded', path: 'irrelevant' }));
    return () => {};
  }),
  onProgress: vi.fn(async () => () => {}),
  sftpCancel: vi.fn(async () => undefined),
  sftpDownload: vi.fn(async () => 1),
  sftpList: vi.fn(),
  sftpMkdir: vi.fn(async (_handle: number, dir: string, name: string) => `${dir}/${name}`),
  sftpRemove: vi.fn(async () => undefined),
  sftpRename: vi.fn(async (_handle: number, dir: string, _old: string, name: string) => `${dir}/${name}`),
  sftpTransfer: vi.fn(async () => 1),
  sftpUpload: vi.fn(async () => 1),
}));
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
