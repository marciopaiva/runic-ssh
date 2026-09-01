/**
 * Guards the pure half of an SFTP tab: what a progress or finished event does
 * to the transfers list, the path arithmetic for moving up a remote
 * directory, and how many destination rows the split control renders.
 */

import { describe, expect, it } from 'vitest';

import {
  hasActiveTransfer,
  localFileName,
  pathSegments,
  reduceFolderCopies,
  reduceTransfers,
  remoteParent,
  selectionRange,
  toggleReceiving,
  visibleDestinationRows,
} from '../src/features/sftp/browser';
import type { FolderCopyAction, TransferAction } from '../src/features/sftp/browser';
import type { PaneEntry } from '../src/features/sftp/endpoint';

const STARTED: TransferAction = {
  type: 'started',
  transfer: 1,
  direction: 'download',
  name: 'report.pdf',
  destination: 'deploy@10.4.1.20',
};

describe('reducing transfer events', () => {
  it('adds a transfer as active with nothing moved yet', () => {
    const transfers = reduceTransfers([], STARTED);

    expect(transfers).toEqual([
      {
        transfer: 1,
        direction: 'download',
        name: 'report.pdf',
        destination: 'deploy@10.4.1.20',
        transferred: 0,
        total: null,
        status: 'active',
        errorCode: null,
      },
    ]);
  });

  it('updates only the transfer a progress event names', () => {
    const other: TransferAction = {
      type: 'started',
      transfer: 2,
      direction: 'upload',
      name: 'x.txt',
      destination: 'deploy@10.9.0.5',
    };
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

describe('how many destination rows the split control renders', () => {
  it('shows exactly what was chosen when nothing is occupied', () => {
    expect(visibleDestinationRows(1, 0, 4)).toBe(1);
  });

  it('does not grow past the chosen split when a row fills in', () => {
    /* The bug this guards: filling the one row a maintainer asked for used
       to grow a second, empty one alongside it, which defeated choosing 1
       and getting 1. */
    expect(visibleDestinationRows(1, 1, 4)).toBe(1);
  });

  it('never hides an occupied slot, even below the chosen split', () => {
    expect(visibleDestinationRows(1, 3, 4)).toBe(3);
  });

  it('caps at the maximum regardless of how high the split is set', () => {
    expect(visibleDestinationRows(4, 0, 4)).toBe(4);
  });
});

describe("a pane's own breadcrumb", () => {
  it('breaks an absolute path into a leading root and one crumb per segment', () => {
    expect(pathSegments('/home/deploy/logs')).toEqual([
      { label: '/', path: '/' },
      { label: 'home', path: '/home' },
      { label: 'deploy', path: '/home/deploy' },
      { label: 'logs', path: '/home/deploy/logs' },
    ]);
  });

  it('draws nothing for the remote root', () => {
    expect(pathSegments('.')).toEqual([]);
  });

  it('draws nothing for an empty path', () => {
    expect(pathSegments('')).toEqual([]);
  });

  it('ignores a trailing slash', () => {
    expect(pathSegments('/var/www/')).toEqual([
      { label: '/', path: '/' },
      { label: 'var', path: '/var' },
      { label: 'www', path: '/var/www' },
    ]);
  });

  it('has no root crumb for a relative path', () => {
    expect(pathSegments('config/sub')).toEqual([
      { label: 'config', path: 'config' },
      { label: 'sub', path: 'config/sub' },
    ]);
  });
});

describe("a destination's own receive toggle", () => {
  it('spares a slot that was receiving', () => {
    expect(toggleReceiving(new Set(), 1)).toEqual(new Set([1]));
  });

  it('includes a slot that was spared', () => {
    expect(toggleReceiving(new Set([1]), 1)).toEqual(new Set());
  });

  it('leaves every other slot as it was', () => {
    expect(toggleReceiving(new Set([0, 2]), 1)).toEqual(new Set([0, 1, 2]));
  });
});

describe('a shift-click range', () => {
  const entry = (name: string, isDir = false): PaneEntry => ({
    name,
    path: name,
    isDir,
    isSymlink: false,
    size: 0,
    modifiedUnixSecs: null,
  });

  const entries = [
    entry('a.txt'),
    entry('b.txt'),
    entry('sub', true),
    entry('c.txt'),
    entry('d.txt'),
  ];

  it('covers everything between the anchor and the target, inclusive', () => {
    expect(selectionRange(entries, 'a.txt', 'c.txt')).toEqual(['a.txt', 'b.txt', 'sub', 'c.txt']);
  });

  it('works the same in reverse, anchor after the target', () => {
    expect(selectionRange(entries, 'd.txt', 'b.txt')).toEqual(['b.txt', 'sub', 'c.txt', 'd.txt']);
  });

  it('includes a directory the range passes over (ADR-0049: a folder is selectable too)', () => {
    expect(selectionRange(entries, 'b.txt', 'c.txt')).toEqual(['b.txt', 'sub', 'c.txt']);
  });

  it('is just the target when anchor and target are the same row', () => {
    expect(selectionRange(entries, 'b.txt', 'b.txt')).toEqual(['b.txt']);
  });

  it('falls back to only the target when the anchor no longer exists', () => {
    expect(selectionRange(entries, 'long-gone.txt', 'c.txt')).toEqual(['c.txt']);
  });
});

describe("a native dialog's own last path segment", () => {
  it('takes the last segment of a forward-slash path', () => {
    expect(localFileName('/home/deploy/report.pdf')).toBe('report.pdf');
  });

  it('takes the last segment of a backslash path', () => {
    expect(localFileName('C:\\Users\\deploy\\report.pdf')).toBe('report.pdf');
  });

  it('is the path itself when there is no separator', () => {
    expect(localFileName('report.pdf')).toBe('report.pdf');
  });

  it('ignores a trailing separator', () => {
    expect(localFileName('/home/deploy/reports/')).toBe('reports');
  });
});


describe('reducing folder-copy events (ADR-0049)', () => {
  const STARTED_FOLDER: FolderCopyAction = {
    type: 'started',
    id: 'folder-1',
    name: 'assets',
    destination: 'deploy@10.4.1.20',
    total: 3,
  };

  it('adds a copy as active with nothing attempted yet', () => {
    const copies = reduceFolderCopies([], STARTED_FOLDER);

    expect(copies).toEqual([
      {
        id: 'folder-1',
        name: 'assets',
        destination: 'deploy@10.4.1.20',
        done: 0,
        total: 3,
        failed: 0,
        status: 'active',
      },
    ]);
  });

  it('counts a succeeded file without touching the failed count', () => {
    const copies = reduceFolderCopies(reduceFolderCopies([], STARTED_FOLDER), {
      type: 'fileDone',
      id: 'folder-1',
      succeeded: true,
    });

    expect(copies[0]).toMatchObject({ done: 1, failed: 0 });
  });

  it('counts a failed file in both done and failed', () => {
    const copies = reduceFolderCopies(reduceFolderCopies([], STARTED_FOLDER), {
      type: 'fileDone',
      id: 'folder-1',
      succeeded: false,
    });

    expect(copies[0]).toMatchObject({ done: 1, failed: 1 });
  });

  it('updates only the copy an event names', () => {
    const other: FolderCopyAction = { ...STARTED_FOLDER, id: 'folder-2', name: 'logs' };
    const copies = reduceFolderCopies(reduceFolderCopies([], STARTED_FOLDER), other);

    const after = reduceFolderCopies(copies, { type: 'fileDone', id: 'folder-1', succeeded: true });

    expect(after.find((c) => c.id === 'folder-1')).toMatchObject({ done: 1 });
    expect(after.find((c) => c.id === 'folder-2')).toMatchObject({ done: 0 });
  });

  it('marks a copy done, keeping whatever failed count it already had', () => {
    let copies = reduceFolderCopies([], STARTED_FOLDER);
    copies = reduceFolderCopies(copies, { type: 'fileDone', id: 'folder-1', succeeded: false });
    copies = reduceFolderCopies(copies, { type: 'finished', id: 'folder-1' });

    expect(copies[0]).toMatchObject({ status: 'done', done: 1, failed: 1 });
  });

  it('marks a copy cancelled rather than done', () => {
    const copies = reduceFolderCopies(reduceFolderCopies([], STARTED_FOLDER), {
      type: 'cancelled',
      id: 'folder-1',
    });

    expect(copies[0]).toMatchObject({ status: 'cancelled' });
  });

  it('drops a dismissed copy and nothing else', () => {
    const copies = [
      reduceFolderCopies([], STARTED_FOLDER)[0]!,
      reduceFolderCopies([], { ...STARTED_FOLDER, id: 'folder-2' })[0]!,
    ];

    const after = reduceFolderCopies(copies, { type: 'dismissed', id: 'folder-1' });
    expect(after.map((c) => c.id)).toEqual(['folder-2']);
  });

  it('is a no-op for an event naming a copy that is not in the list', () => {
    const copies = reduceFolderCopies([], STARTED_FOLDER);
    const after = reduceFolderCopies(copies, { type: 'fileDone', id: 'missing', succeeded: true });

    expect(after).toEqual(copies);
  });
});
