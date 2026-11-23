/**
 * Turning a Logbook event into the words and the tone a line shows (ADR-0081).
 *
 * Pure, so each kind's wording can be asserted without a window. The wording is
 * all in the locale files: this only picks the key and the values it takes.
 */

import type { LogbookEvent } from '../../ipc';
import type { Translator } from '../../lib/i18n';

export interface LogbookLine {
  readonly text: string;
  /** What a reader scans for: a loss, a change of key, a failure. */
  readonly tone: 'plain' | 'warn';
}

export function describeEvent(event: LogbookEvent, i18n: Translator): LogbookLine {
  switch (event.kind) {
    case 'connected':
      return { text: i18n.t('logbook.event.connected'), tone: 'plain' };
    case 'dropped':
      return { text: i18n.t('logbook.event.dropped'), tone: 'warn' };
    case 'reconnecting':
      return {
        text: i18n.t('logbook.event.reconnecting', { attempt: String(event.attempt) }),
        tone: 'plain',
      };
    case 'reconnected':
      return { text: i18n.t('logbook.event.reconnected'), tone: 'plain' };
    case 'hostKeyTrusted':
      return event.replaced
        ? { text: i18n.t('logbook.event.keyReplaced', { print: event.fingerprint }), tone: 'warn' }
        : { text: i18n.t('logbook.event.keyAccepted', { print: event.fingerprint }), tone: 'plain' };
    case 'macroRun':
      if (event.outcome === 'timedOut') {
        return { text: i18n.t('logbook.event.macroTimedOut', { name: event.name }), tone: 'warn' };
      }
      if (event.outcome === 'failed') {
        return { text: i18n.t('logbook.event.macroFailed', { name: event.name }), tone: 'warn' };
      }
      if (event.exitStatus === null) {
        return { text: i18n.t('logbook.event.macroRanNoStatus', { name: event.name }), tone: 'plain' };
      }
      return {
        text: i18n.t('logbook.event.macroRan', { name: event.name, status: String(event.exitStatus) }),
        tone: event.exitStatus === 0 ? 'plain' : 'warn',
      };
  }
}
