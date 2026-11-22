// @vitest-environment jsdom
//
// ADR-0079: after a reconnect an SFTP pane follows its host onto the new
// connection and lists the folder it was in.

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const sftpList = vi.fn(async (..._args: unknown[]) => []);
vi.mock('../src/ipc', () => ({
  sftpList: (...args: unknown[]) => sftpList(...args),
  asIpcError: () => undefined,
  localListDirectory: vi.fn(),
  localMkdir: vi.fn(),
  localRemove: vi.fn(),
  localRename: vi.fn(),
  sftpMkdir: vi.fn(),
  sftpRemove: vi.fn(),
  sftpRename: vi.fn(),
}));

const { usePane } = await import('../src/features/sftp/use-pane');
const { rebound } = await import('../src/features/sftp/endpoint');

type Api = ReturnType<typeof usePane>;
let api: Api;

function Probe(props: { handle: number }): null {
  api = usePane({ kind: 'remote', sessionId: 's1', handle: props.handle as never });
  return null;
}

const roots: Array<ReturnType<typeof createRoot>> = [];

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  sftpList.mockClear();
});

describe('a pane across a reconnect', () => {
  it('lists the folder it was in on the new handle, without remounting', async () => {
    const root = createRoot(document.createElement('div'));
    roots.push(root);
    await act(async () => root.render(createElement(Probe, { handle: 1 })));
    await act(async () => api.enter('/var/www'));
    expect(sftpList).toHaveBeenLastCalledWith(1, '/var/www');

    await act(async () => root.render(createElement(Probe, { handle: 2 })));

    expect(sftpList).toHaveBeenLastCalledWith(2, '/var/www');
    expect(api.path).toBe('/var/www');
    expect(api.history).toEqual(['.']);
  });
});

describe('rebound', () => {
  const remote = { kind: 'remote', sessionId: 's1', handle: 1 as never } as const;

  it('moves only the remote endpoint of that session', () => {
    expect(rebound(remote, 's1', 2 as never)).toEqual({ ...remote, handle: 2 });
    expect(rebound(remote, 's2', 2 as never)).toBe(remote);
    expect(rebound({ kind: 'local' }, 's1', 2 as never)).toEqual({ kind: 'local' });
    expect(rebound(null, 's1', 2 as never)).toBeNull();
  });

  it('leaves an endpoint already on that handle alone', () => {
    expect(rebound(remote, 's1', 1 as never)).toBe(remote);
  });
});
