/**
 * A selected host's own identity, fetched once rather than polled.
 *
 * `null` for `handle` clears whatever was last read: switching hosts, or
 * leaving the workspace, should never leave the previous host's kernel
 * version on screen under the new host's name.
 */

import { useEffect, useState } from 'react';

import { sessionSystemInfo } from '../../ipc';
import type { SessionHandle, SystemInfo } from '../../ipc';

const NO_INFO: SystemInfo = { osName: null, kernel: null, hostname: null, cpuModel: null };

export function useSystemInfo(handle: SessionHandle | null): SystemInfo {
  const [info, setInfo] = useState<SystemInfo>(NO_INFO);

  useEffect(() => {
    setInfo(NO_INFO);
    if (handle === null) return;

    let live = true;

    void sessionSystemInfo(handle).then(
      (next) => {
        if (live) setInfo(next);
      },
      () => {
        /* A lost read leaves the card blank rather than wrong: nothing here
           is worth retrying on a timer, since it never changes once it does
           answer. */
      },
    );

    return () => {
      live = false;
    };
  }, [handle]);

  return info;
}
