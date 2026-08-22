/**
 * Where commands come from.
 *
 * Pure functions of the application's state, so what the palette will offer
 * can be asserted without opening it. Each source translates its own titles:
 * it is the part that knows what the command means, and the palette only ranks
 * and draws.
 *
 * A command is only built when it can actually run. An entry that reports its
 * own unavailability is worse than an absent one — it costs a keystroke, a
 * read and a disappointment, in a list whose whole value is that everything in
 * it works.
 */

import { offeredLocales } from '../../lib/i18n';
import type { Translator } from '../../lib/i18n';
import type { WindowAction } from '../chrome';
import type { Tab } from '../chrome';
import type { LiveSession } from '../sessions';

import type { Command } from './registry';

export interface CommandActions {
  readonly selectSession: (sessionId: string) => void;
  readonly activateTab: (sessionId: string) => void;
  readonly closeTab: (sessionId: string) => void;
  readonly moveTab: (step: 1 | -1) => void;
  readonly window: (action: WindowAction) => void;
  readonly chooseLocale: (locale: string | null) => void;
}

export interface CommandContext {
  readonly i18n: Translator;
  readonly sessions: readonly LiveSession[];
  readonly tabs: readonly Tab[];
  readonly activeId: string | null;
  /** `null` while the language follows the operating system. */
  readonly chosenLocale: string | null;
  readonly maximized: boolean;
  readonly actions: CommandActions;
}

/**
 * Every saved host, reachable by name or by address.
 *
 * An open session switches to its tab; a closed one is selected in the
 * sidebar. Connecting is not offered because it cannot yet be finished — see
 * the credential prompt that ADR-0008 describes and nothing builds.
 */
export function sessionCommands(context: CommandContext): readonly Command[] {
  const { i18n, sessions, tabs, actions } = context;
  const open = new Set(tabs.map((tab) => tab.sessionId));

  return sessions.map((live) => {
    const { session } = live;
    const isOpen = open.has(session.id);

    return {
      id: `session:${session.id}`,
      section: 'sessions' as const,
      title: isOpen
        ? i18n.t('command.session.switch', { name: session.name })
        : i18n.t('command.session.select', { name: session.name }),
      detail: `${session.user}@${session.host}`,
      /* Typing an address finds a host saved under a friendly name, which is
         how anyone who administers a fleet actually remembers them. */
      keywords: [session.host, session.user, session.group ?? ''].filter(
        (word) => word !== '',
      ),
      run: () => {
        if (isOpen) actions.activateTab(session.id);
        else actions.selectSession(session.id);
      },
    };
  });
}

/** Everything that is not a place to go. */
export function actionCommands(context: CommandContext): readonly Command[] {
  const { i18n, tabs, activeId, chosenLocale, maximized, actions } = context;
  const commands: Command[] = [];

  if (activeId !== null) {
    commands.push({
      id: 'tab:close',
      section: 'actions',
      title: i18n.t('command.tab.close'),
      keywords: ['tab', 'aba', 'pestaña'],
      run: () => actions.closeTab(activeId),
    });
  }

  if (tabs.length > 1) {
    commands.push(
      {
        id: 'tab:next',
        section: 'actions',
        title: i18n.t('command.tab.next'),
        keywords: ['tab', 'aba', 'pestaña'],
        run: () => actions.moveTab(1),
      },
      {
        id: 'tab:previous',
        section: 'actions',
        title: i18n.t('command.tab.previous'),
        keywords: ['tab', 'aba', 'pestaña'],
        run: () => actions.moveTab(-1),
      },
    );
  }

  const windowActions: readonly (readonly [string, WindowAction, 'command.window.minimize' | 'command.window.maximize' | 'command.window.restore' | 'command.window.close'])[] =
    [
      ['window:minimize', 'minimize', 'command.window.minimize'],
      maximized
        ? ['window:restore', 'restore', 'command.window.restore']
        : ['window:maximize', 'maximize', 'command.window.maximize'],
      ['window:close', 'close', 'command.window.close'],
    ];

  for (const [id, action, label] of windowActions) {
    commands.push({
      id,
      section: 'actions',
      title: i18n.t(label),
      keywords: ['window', 'janela', 'ventana'],
      run: () => actions.window(action),
    });
  }

  for (const locale of offeredLocales()) {
    /* The language already in use is not a command. Running it would be a
       no-op the user cannot tell apart from the palette having failed. */
    if (locale.tag === chosenLocale) continue;

    commands.push({
      id: `locale:${locale.tag}`,
      section: 'actions',
      /* The language's own name, never translated: someone looking for their
         language is looking for the word they call it by. */
      title: i18n.t('command.language.use', { name: locale.name }),
      detail: locale.tag,
      keywords: ['language', 'idioma', 'lingua', 'lengua', locale.tag],
      run: () => actions.chooseLocale(locale.tag),
    });
  }

  if (chosenLocale !== null) {
    commands.push({
      id: 'locale:system',
      section: 'actions',
      title: i18n.t('command.language.system'),
      keywords: ['language', 'idioma', 'lingua', 'lengua'],
      run: () => actions.chooseLocale(null),
    });
  }

  return commands;
}
