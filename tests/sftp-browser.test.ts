/**
 * Guards the pure half of an SFTP tab: what a progress or finished event does
 * to the transfers list, and the path arithmetic for moving up a remote
 * directory.
 */

import { describe, expect, it } from 'vitest';

import {
  ancestorChain,
  hasActiveTransfer,
  reduceTransfers,
  remoteParent,
  treeRows,
} from '../src/features/sftp/browser';
import type { TransferAction, TreeLevel } from '../src/features/sftp/browser';
import type { SftpEntry } from '../src/ipc';

function dir(name: string, remotePath: string): SftpEntry {
  return { name, remotePath, isDir: true, isSymlink: false, size: 0, modifiedUnixSecs: null };
}

const STARTED: TransferAction = {
  type: 'started',
  transfer: 1,
  direction: 'download',
  name: 'report.pdf',
};

describe('reducing transfer events', () => {
  it('adds a transfer as active with nothing moved yet', () => {
    const transfers = reduceTransfers([], STARTED);

    expect(transfers).toEqual([
      {
        transfer: 1,
        direction: 'download',
        name: 'report.pdf',
        transferred: 0,
        total: null,
        status: 'active',
        errorCode: null,
      },
    ]);
  });

  it('updates only the transfer a progress event names', () => {
    const other: TransferAction = { type: 'started', transfer: 2, direction: 'upload', name: 'x.txt' };
    const transfers = reduceTransfers(reduceTransfers([], STARTED), other);

    const after = reduceTransfers(transfers, {
      type: 'progress',
      transfer: 1,
      progress: { transferred: 500, total: 1000 },
    });

    expect(after.find((t) => t.transfer === 1)).toMatchObject({ transferred: 500, total: 1000 });
    expect(after.find((t) => t.transfer === 2)).toMatchObject({ transferred: 0, total: null });
  });

  it('marks a transfer succeeded, with no error code', () => {
    const transfers = reduceTransfers([], STARTED);
    const after = reduceTransfers(transfers, {
      type: 'finished',
      transfer: 1,
      outcome: { outcome: 'succeeded', path: '/home/user/downloads/report.pdf' },
    });

    expect(after[0]).toMatchObject({ status: 'succeeded', errorCode: null });
  });

  it('marks a transfer failed, carrying the error code', () => {
    const transfers = reduceTransfers([], STARTED);
    const after = reduceTransfers(transfers, {
      type: 'finished',
      transfer: 1,
      outcome: { outcome: 'failed', error: { code: 'sftpNotFound' } },
    });

    expect(after[0]).toMatchObject({ status: 'failed', errorCode: 'sftpNotFound' });
  });

  it('treats a cancelled transfer as cancelled, not failed', () => {
    /* sftp_cancel never rejects (commands::sftp's own doc comment); the
       transfer it aborts still finishes through the ordinary event, tagged
       with the error the aborted task's own SftpError::Cancelled maps to.
       The transfers list must not show this as a red error, since the user
       asked for exactly this ending. */
    const transfers = reduceTransfers([], STARTED);
    const after = reduceTransfers(transfers, {
      type: 'finished',
      transfer: 1,
      outcome: { outcome: 'failed', error: { code: 'sftpTransferCancelled' } },
    });

    expect(after[0]).toMatchObject({ status: 'cancelled', errorCode: null });
  });

  it('drops a dismissed transfer and nothing else', () => {
    const transfers = [
      reduceTransfers([], STARTED)[0]!,
      reduceTransfers([], { ...STARTED, transfer: 2 })[0]!,
    ];

    const after = reduceTransfers(transfers, { type: 'dismissed', transfer: 1 });
    expect(after.map((t) => t.transfer)).toEqual([2]);
  });

  it('is a no-op for an event naming a transfer that is not in the list', () => {
    const transfers = reduceTransfers([], STARTED);
    const after = reduceTransfers(transfers, {
      type: 'progress',
      transfer: 999,
      progress: { transferred: 1, total: 1 },
    });

    expect(after).toEqual(transfers);
  });
});

describe('whether anything is still moving', () => {
  it('is false with nothing in the list', () => {
    expect(hasActiveTransfer([])).toBe(false);
  });

  it('is true while one transfer is active', () => {
    expect(hasActiveTransfer(reduceTransfers([], STARTED))).toBe(true);
  });

  it('is false once every transfer has settled', () => {
    const transfers = reduceTransfers([], STARTED);
    const done = reduceTransfers(transfers, {
      type: 'finished',
      transfer: 1,
      outcome: { outcome: 'succeeded', path: '/x' },
    });

    expect(hasActiveTransfer(done)).toBe(false);
  });
});

describe('moving up a remote directory', () => {
  it('goes from a deep path to its parent', () => {
    expect(remoteParent('/var/www/releases')).toBe('/var/www');
  });

  it('goes from a top-level directory to the root', () => {
    expect(remoteParent('/var')).toBe('/');
  });

  it('has nowhere to go from the root', () => {
    expect(remoteParent('/')).toBeNull();
  });

  it('has nowhere to go from the starting directory', () => {
    expect(remoteParent('.')).toBeNull();
  });

  it('ignores a trailing slash', () => {
    expect(remoteParent('/var/www/')).toBe('/var');
  });
});

describe('the chain of ancestors above a remote path', () => {
  it('is just the path itself at the root', () => {
    expect(ancestorChain('/')).toEqual(['/']);
  });

  it('is just the path itself before any navigation', () => {
    expect(ancestorChain('.')).toEqual(['.']);
  });

  it('walks up to the root, in root-first order', () => {
    expect(ancestorChain('/var/www/releases')).toEqual(['/', '/var', '/var/www', '/var/www/releases']);
  });
});

describe('flattening a chain into sidebar tree rows', () => {
  const chain = ['/', '/var', '/var/www'];

  it('is empty for an empty chain', () => {
    expect(treeRows([], new Map(), [])).toEqual([]);
  });

  it('draws only the root, current, once nothing is cached yet', () => {
    const rows = treeRows(['.'], new Map(), [dir('config', './config')]);

    expect(rows).toEqual([
      { path: '.', name: '.', depth: 0, isDir: true, expandable: true, expanded: true, current: true },
      { path: './config', name: 'config', depth: 1, isDir: true, expandable: true, expanded: false, current: false },
    ]);
  });

  it('marks the deepest chain entry current, and its ancestors merely expanded', () => {
    const cache = new Map<string, TreeLevel>([
      ['/', [dir('var', '/var'), dir('etc', '/etc')]],
      ['/var', [dir('www', '/var/www')]],
    ]);

    const rows = treeRows(chain, cache, [dir('releases', '/var/www/releases'), dir('shared', '/var/www/shared')]);

    expect(rows.map((row) => [row.path, row.depth, row.expanded, row.current])).toEqual([
      ['/', 0, true, false],
      ['/var', 1, true, false],
      ['/etc', 1, false, false],
      ['/var/www', 2, true, true],
      ['/var/www/releases', 3, false, false],
      ['/var/www/shared', 3, false, false],
    ]);
  });

  it('stops descending once a level is not cached yet', () => {
    const cache = new Map<string, TreeLevel>([['/', [dir('var', '/var')]]]);

    const rows = treeRows(chain, cache, []);

    expect(rows.map((row) => row.path)).toEqual(['/', '/var']);
  });

  it('stops descending once a level failed to load', () => {
    const cache = new Map<string, TreeLevel>([
      ['/', [dir('var', '/var')]],
      ['/var', 'error'],
    ]);

    const rows = treeRows(chain, cache, []);

    expect(rows.map((row) => row.path)).toEqual(['/', '/var']);
  });
});


