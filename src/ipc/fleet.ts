/**
 * Typed wrapper over the fleet run command (ADR-0078).
 *
 * Takes a saved macro's id and session handles, never command text: what runs
 * on a host is whatever the person saved as a script macro, resolved by the
 * core. A host the run could not use comes back as `failed` in its own slot
 * rather than rejecting the whole call.
 */

import { invoke } from '@tauri-apps/api/core';

import type { SessionHandle } from './sessions';

export type FleetResult =
  | {
      readonly handle: SessionHandle;
      readonly state: 'ran';
      readonly stdout: string;
      readonly stderr: string;
      /** `null` when the command was cut off or never reported one. */
      readonly exitStatus: number | null;
      /** A stream passed its cap and the run was ended there. */
      readonly truncated: boolean;
      /** The host's deadline passed before it finished. */
      readonly timedOut: boolean;
    }
  | { readonly handle: SessionHandle; readonly state: 'failed' };

export async function fleetRun(
  macroId: string,
  handles: readonly SessionHandle[],
): Promise<FleetResult[]> {
  return invoke<FleetResult[]>('fleet_run', { macroId, handles });
}
