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
import type { LayoutKind } from '../terminal';

import type { Command } from './registry';

export interface CommandActions {
  /** Opens the editor with no session, to add one. */
  readonly newSession: () => void;
  /** Opens the editor on an existing session. */
  readonly editSession: (sessionId: string) => void;
  readonly selectSession: (sessionId: string) => void;
  readonly activateTab: (sessionId: string) => void;
  readonly closeTab: (sessionId: string) => void;
  readonly moveTab: (step: 1 | -1) => void;
  readonly window: (action: WindowAction) => void;
  readonly chooseLocale: (locale: string | null) => void;
  /** Hands the title bar to the window manager, or takes it back. */
  readonly useNativeDecorations: (native: boolean) => void;
  /** Puts the settings tab on the strip and focuses it. */
  readonly openSettings: () => void;
  /** Divides the panel, or puts it back to one terminal. */
  readonly splitPanel: (kind: LayoutKind) => void;
  /** Arms or disarms typing into every pane at once. */
  readonly toggleSync: () => void;
}

export interface CommandContext {
  readonly i18n: Translator;
  readonly sessions: readonly LiveSession[];
  readonly tabs: readonly Tab[];
  readonly activeId: string | null;
  /** `null` while the language follows the operating system. */
  readonly chosenLocale: string | null;
  readonly maximized: boolean;
  /** Whether the window manager is currently drawing the title bar. */
  readonly nativeDecorations: boolean;
  /** How the panel is divided right now. */
  readonly layout: LayoutKind;
  /** Whether what is typed reaches every pane. */
  readonly syncing: boolean;
  /** How many panes have a session in them. */
  readonly panesFilled: number;
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

  /* First, and present even with nothing saved. An SSH client whose palette
     lists no way to add a host is one nobody can use — which is exactly what
     shipped before this was here. */
  const commands: Command[] = [
    {
      id: 'session:new',
      section: 'sessions',
      title: i18n.t('command.session.new'),
      keywords: ['new', 'add', 'novo', 'adicionar', 'nueva', 'host'],
      run: actions.newSession,
    },
  ];

  const rest = sessions.map((live) => {
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

  const editing = sessions.map((live) => ({
    id: `session:edit:${live.session.id}`,
    section: 'sessions' as const,
    title: i18n.t('command.session.edit', { name: live.session.name }),
    detail: `${live.session.user}@${live.session.host}`,
    keywords: [live.session.host, 'edit', 'editar', 'delete', 'excluir'],
    run: () => actions.editSession(live.session.id),
  }));

  return [...commands, ...rest, ...editing];
}

/** Everything that is not a place to go. */
export function actionCommands(context: CommandContext): readonly Command[] {
  const {
    i18n,
    tabs,
    activeId,
    chosenLocale,
    maximized,
    nativeDecorations,
    layout,
    syncing,
    panesFilled,
    actions,
  } = context;
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

  /* One open session is enough. Splitting first and connecting into the empty
     pane is the ordinary way round, since picking a tab fills an empty pane
     before it replaces the focused one. With nothing open at all there is no
     panel to divide, and the entry would be a shape with two holes in it. */
  if (tabs.length > 0) {
    const shapes: readonly (readonly [
      LayoutKind,
      'command.split.columns' | 'command.split.rows' | 'command.split.grid',
    ])[] = [
      ['columns', 'command.split.columns'],
      ['rows', 'command.split.rows'],
      ['grid', 'command.split.grid'],
    ];

    for (const [kind, label] of shapes) {
      if (kind === layout) continue;
      commands.push({
        id: `split:${kind}`,
        section: 'actions',
        title: i18n.t(label),
        keywords: ['split', 'pane', 'dividir', 'painel', 'panel'],
        run: () => actions.splitPanel(kind),
      });
    }
  }

  if (layout !== 'single') {
    commands.push({
      id: 'split:none',
      section: 'actions',
      title: i18n.t('command.split.none'),
      keywords: ['split', 'pane', 'dividir', 'painel', 'panel'],
      run: () => actions.splitPanel('single'),
    });
  }

  /* Only with somewhere for it to reach. Armed against a single pane it would
     do nothing and still say it was on, which for this switch is worse than
     being absent. */
  if (panesFilled > 1) {
    commands.push({
      id: 'split:sync',
      section: 'actions',
      title: i18n.t(syncing ? 'command.split.sync.off' : 'command.split.sync.on'),
      /* The count is on the entry that arms it. How many hosts a keystroke is
         about to reach is the fact worth reading before pressing Enter, and
         after that the status bar carries it. */
      ...(syncing
        ? {}
        : { detail: i18n.t('command.split.sync.detail', { count: String(panesFilled) }) }),
      keywords: ['sync', 'broadcast', 'sincronizar', 'todos', 'sincronizado'],
      run: actions.toggleSync,
    });
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

  /* The way in that does not need the palette to be discovered first: this
     command is what the tab is for, and the tab is what the settings are for.
     Everything below it here is reachable from inside that tab too. */
  commands.push({
    id: 'settings:open',
    section: 'actions',
    title: i18n.t('command.settings.open'),
    keywords: ['settings', 'preferences', 'configuracoes', 'preferencias', 'ajustes', 'idioma'],
    run: actions.openSettings,
  });

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

  /* ADR-0005's escape hatch, and the palette is the only way to reach it —
     there is no settings panel yet. Worth stating why it is reachable from a
     command at all: the user who needs it may have a window they cannot move
     or resize, and the palette opens from the keyboard. */
  commands.push({
    id: 'chrome:decorations',
    section: 'actions',
    title: nativeDecorations
      ? i18n.t('command.window.drawnDecorations')
      : i18n.t('command.window.nativeDecorations'),
    /* No `detail`. It is drawn `shrink-0` beside a title that truncates, so a
       sentence there squeezes the title to nothing — which is what a first
       draft of this command did. The reason a user needs this lives in
       docs/installing.md, not in a palette row. */
    keywords: ['decorations', 'titlebar', 'decoracoes', 'decoraciones', 'barra'],
    run: () => actions.useNativeDecorations(!nativeDecorations),
  });

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
