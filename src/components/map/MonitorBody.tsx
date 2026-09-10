import type { JSX } from 'react';

import type { Session, SessionHandle } from '../../ipc';
import { useSystemStats } from '../../features/status';
import { groupLabel } from '../../features/terminal';

import { MonitorWorkspace } from '../MonitorWorkspace';

/**
 * A monitor component's body: the Monitor workspace's own surface, fed by
 * its own readings. One poll per open window, stopped when the window goes,
 * which `useSystemStats` already does for the workspace it was written for.
 */
export function MonitorBody({ session, handle }: { readonly session: Session; readonly handle: SessionHandle }): JSX.Element {
  const stats = useSystemStats(handle);
  return <MonitorWorkspace identity={groupLabel(session)} handle={handle} stats={stats} />;
}
