export { useTerminal } from './use-terminal';
export type { TerminalState } from './use-terminal';
export { useLocalShellTerminal } from './use-local-shell-terminal';
export { localShellKindId, localShellLabel } from './local-shell-kind';
export type { LocalShellTab } from './local-shell-kind';
export { terminalTheme } from './theme';
export { mountedTerminals } from './mounted';
export type { MountedTerminal } from './mounted';
export {
  GRIDS,
  WHOLE_AREA,
  activeEntry,
  gridBoxes,
  gridCount,
  groupLabel,
  groupOf,
  groupSyncState,
  inputTargets,
  moveEntry,
  placeEntry,
  receivingSessions,
  removeEntry,
  resolveGroups,
  sparedSessions,
} from './groups';
export type { Box, Grid, Group, GroupLabel, HeldGroup } from './groups';
export { SHAPE_LABEL, dimensions } from './shapes';
export type { ShapeLabel } from './shapes';
