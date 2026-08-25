export { asIpcError } from './errors';
export {
  authenticateInteractively,
  credentialPrompt,
  dismissCredential,
  submitCredential,
} from './credential';
export type { CredentialPrompt } from './credential';
export {
  closeWindow,
  isWindowMaximized,
  minimizeWindow,
  onWindowResized,
  toggleMaximizeWindow,
  windowChrome,
  setNativeDecorations,
} from './chrome';
export type { CommandModifier, WindowChrome, WindowControlsOwner } from './chrome';
export type { Hop, IpcError, IpcErrorCode } from './errors';
export { getSettings, setLocale, setTheme } from './settings';
export {
  authenticateSession,
  authenticateWithSaved,
  credentialStoreStatus,
  forgetCredential,
  rememberCredential,
  connectSession,
  deleteSession,
  disconnectSession,
  listSessions,
  saveSession,
  trustHostKey,
  hostKeyDecision,
} from './sessions';
export type {
  CredentialStoreStatus,
  HostKeyDecisionView,
  OpenSession,
  Secret,
  Session,
  SessionDraft,
  SessionHandle,
} from './sessions';
export {
  CLOSED_EVENT,
  OUTPUT_EVENT,
  onClosed,
  onOutput,
  openTerminal,
  resizeTerminal,
  sendInput,
  sessionStats,
} from './terminal';
export type { SessionStats } from './terminal';
export type { SettingsView, Theme } from './settings';
