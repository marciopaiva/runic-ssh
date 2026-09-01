/**
 * Guards the pure half of an SFTP tab: what a progress or finished event does
 * to the transfers list, the path arithmetic for moving up a remote
 * directory, and how many destination rows the split control renders.
 */

import { describe, expect, it } from 'vitest';

import {
  hasActiveTransfer,
  pathSegments,
  reduceTransfers,
  remoteParent,
  selectionRange,
  toggleReceiving,
  visibleDestinationRows,
} from '../src/features/sftp/browser';
import type { TransferAction } from '../src/features/sftp/browser';
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
    expect(selectionRange(entries, 'a.txt', 'c.txt')).toEqual(['a.txt', 'b.txt', 'c.txt']);
  });

  it('works the same in reverse, anchor after the target', () => {
    expect(selectionRange(entries, 'd.txt', 'b.txt')).toEqual(['b.txt', 'c.txt', 'd.txt']);
  });

  it('skips a directory the range passes over', () => {
    expect(selectionRange(entries, 'b.txt', 'c.txt')).toEqual(['b.txt', 'c.txt']);
  });

  it('is just the target when anchor and target are the same row', () => {
    expect(selectionRange(entries, 'b.txt', 'b.txt')).toEqual(['b.txt']);
  });

  it('falls back to only the target when the anchor no longer exists', () => {
    expect(selectionRange(entries, 'long-gone.txt', 'c.txt')).toEqual(['c.txt']);
  });
});

