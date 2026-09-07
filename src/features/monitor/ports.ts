/**
 * Reading a listening-socket list as something a screen can show.
 *
 * Pure and testable without a window: what a query matches. Asserted here
 * rather than eyeballed in the component that draws it.
 */

import type { ListeningSocket } from '../../ipc';

/** Case-insensitive, against the socket's process, address, protocol and port. */
export function filterPorts(
  ports: readonly ListeningSocket[],
  query: string,
): readonly ListeningSocket[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return ports;

  return ports.filter(
    (port) =>
      port.process.toLowerCase().includes(needle) ||
      port.address.toLowerCase().includes(needle) ||
      port.protocol.toLowerCase().includes(needle) ||
      String(port.port).includes(needle),
  );
}
