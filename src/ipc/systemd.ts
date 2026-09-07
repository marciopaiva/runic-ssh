/**
 * Typed wrapper over the systemd command.
 *
 * Read-only, matching `ssh/systemd.rs`'s own scope: nothing here starts,
 * stops or reloads anything.
 */

import { invoke } from '@tauri-apps/api/core';

import type { SessionHandle } from './sessions';

/** One line of `systemctl list-units`, named the way `systemctl` names its own columns. */
export interface SystemdUnit {
  readonly name: string;
  /** `loaded`, `not-found`, `masked`, ... */
  readonly load: string;
  /** `active`, `inactive`, `failed`, ... */
  readonly active: string;
  /** `running`, `exited`, `dead`, `failed`, ... */
  readonly sub: string;
  readonly description: string;
}

/**
 * Lists `handle`'s own systemd service units.
 *
 * A host with no `systemd` yields an empty list rather than a rejection: see
 * `ssh/systemd.rs`'s own doc comment for why the two are indistinguishable
 * from here on purpose.
 */
export async function sessionSystemdUnits(handle: SessionHandle): Promise<readonly SystemdUnit[]> {
  return invoke<SystemdUnit[]>('session_systemd_units', { handle });
}
