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
import type { LocalShellKind, Macro } from '../../ipc';
import type { WindowAction } from '../chrome';
import type { Tab } from '../chrome';
import { hostRows } from '../sessions';
import type { LiveSession } from '../sessions';
import { GRIDS, SHAPE_LABEL, localShellKindId, localShellLabel } from '../terminal';
import type { Grid } from '../terminal';

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
  /** Reveals or hides the preview features, the map among them (ADR-0066). */
  readonly usePreviewFeatures: (on: boolean) => void;
  /** Puts the settings tab on the strip and focuses it. */
  readonly openSettings: () => void;
  /** Divides the panel, or puts it back to one terminal. */
  readonly splitPanel: (kind: Grid) => void;
  /** Sends whatever is focused to another rectangle. */
  readonly moveTabToGroup: (at: number) => void;
  /** Closes every tab in the group holding the focus. */
  readonly closeGroup: () => void;
  /** Arms or disarms typing into every pane at once. */
  readonly toggleSync: () => void;
  /**
   * Sends a macro's own text to whatever a keystroke would currently reach
   * (one session, or a broadcast group already reaching several), resolving
   * `${host}`/`${port}`/`${username}` against the session it lands in first.
   */
  readonly runMacro: (macro: Macro) => void;
  /** Opens the macro editor. */
  readonly openMacros: () => void;
  /**
   * Puts a saved host where the workspace beside the button that opened this
   * palette is standing: the focused rectangle in Sessions, or the fan-out
   * slot last clicked in SFTP (ADR-0072).
   */
  readonly openHostInto: (sessionId: string) => void;
  /** SFTP's own endpoint with no host behind it, into that same slot. */
  readonly openLocalInto: () => void;
  /** Opens the hosts-manager sidebar (ADR-0076). */
  readonly openHostsManager: () => void;
  /** Opens a native shell of the given kind into the same slot (ADR-0074). */
  readonly openLocalShellInto: (kind: LocalShellKind) => void;
}

export interface CommandContext {
  readonly i18n: Translator;
  readonly sessions: readonly LiveSession[];
  readonly tabs: readonly Tab[];
  readonly activeId: string | null;
  /** What a macro reaches: `activeId` on the classic strip, the map's own
      focused terminal while that workspace is shown, since the map has no
      strip of its own for `activeId` to mean anything there. */
  readonly macroTargetId: string | null;
  /** `null` while the language follows the operating system. */
  readonly chosenLocale: string | null;
  readonly maximized: boolean;
  /** Whether the window manager is currently drawing the title bar. */
  readonly nativeDecorations: boolean;
  /** Whether the preview features are revealed, the map among them. */
  readonly previewFeatures: boolean;
  /** How the panel is divided right now. */
  readonly layout: Grid;
  /** Whether what is typed reaches every pane. */
  readonly syncing: boolean;
  /** How many panes have a session in them. */
  readonly panesFilled: number;
  /** How many rectangles the current shape has. */
  readonly groupCount: number;
  /** Which of them holds the focus, or `-1` when nothing is focused. */
  readonly focusedGroup: number;
  /** What the focused tab is called, whichever kind it is. */
  readonly focusedTitle: string | null;
  readonly macros: readonly Macro[];
  readonly actions: CommandActions;
  /**
   * Which workspace pill is showing, for `hostBookCommands`: it decides
   * whether "this machine" belongs in the list at all.
   */
  readonly workspace: 'sessions' | 'sftp' | 'map';
  /** The shells this platform offers, detected once at startup (ADR-0074). */
  readonly localShellKinds: readonly LocalShellKind[];
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

/**
 * The saved host book, for the "+" beside the ADR-0072 pills.
 *
 * Ordered the way Home's own list is (ADR-0060, `hostRows`): a bastion
 * before whatever rides it, rather than the file's raw order. Every row
 * opens into whichever slot the button beside it stands for, `openHostInto`
 * deciding what that means for the workspace showing; the "+" is how the
 * fan-out gets an occupant now that the SFTP sidebar's own pinned "this
 * machine" row is gone with it.
 *
 * Before this, the "+" could only place an already-saved host: Sessions and
 * SFTP had no way to create one at all, unlike Home's own row and the
 * keyboard palette's `session:new`. "New host" fixes that the same way this
 * list already fixes everything else, as a row rather than a second button.
 */
export function hostBookCommands(context: CommandContext): readonly Command[] {
  const { i18n, sessions, workspace, actions } = context;

  const commands: Command[] = hostRows(sessions).map(({ live }) => {
    const { session } = live;
    return {
      id: `hostbook:${session.id}`,
      section: 'sessions',
      title: session.name,
      detail: `${session.user}@${session.host}`,
      keywords: [session.host, session.user, session.group ?? ''].filter((word) => word !== ''),
      run: () => actions.openHostInto(session.id),
    };
  });

  if (workspace === 'sftp') {
    /* The same label the pinned sidebar row used to carry (`sftp.localhost`),
       and the one a pane already shows once this is dropped into it: this
       row replaces that one rather than naming the same endpoint twice. */
    commands.unshift({
      id: 'hostbook:local',
      section: 'sessions',
      title: i18n.t('sftp.localhost'),
      keywords: ['local', 'localhost'],
      run: actions.openLocalInto,
    });
  }

  /* First, and present even with nothing saved, the same reasoning
     `sessionCommands`'s own `session:new` already rests on. */
  commands.unshift({
    id: 'hostbook:new',
    section: 'sessions',
    title: i18n.t('command.hostbook.new'),
    keywords: ['new', 'add', 'novo', 'adicionar', 'nuevo', 'host'],
    run: actions.newSession,
  });

  return commands;
}

/**
 * The native shells this platform can open, for the same "+" the host book
 * uses (ADR-0074).
 *
 * Gated the same way `hostBookCommands`'s own `hostbook:local` row is:
 * a local shell is a terminal session like any other, so it belongs beside
 * the saved hosts in Sessions and Map, not in SFTP, whose "+" places file
 * endpoints rather than sessions.
 */
export function localShellCommands(context: CommandContext): readonly Command[] {
  const { i18n, workspace, localShellKinds, actions } = context;
  if (workspace === 'sftp') return [];

  return localShellKinds.map((kind) => ({
    id: `local:${localShellKindId(kind)}`,
    section: 'sessions' as const,
    title: i18n.t('command.local.open', { name: localShellLabel(kind, i18n) }),
    keywords: ['local', 'shell', 'terminal'],
    run: () => actions.openLocalShellInto(kind),
  }));
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
    previewFeatures,
    layout,
    syncing,
    panesFilled,
    groupCount,
    focusedGroup,
    focusedTitle,
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
     panel to divide, and the entry would be a shape with two holes in it.

     Every shape but the one in use, from the same list the control in the top
     strip draws, so the two cannot come to offer different sets. */
  if (tabs.length > 0) {
    for (const kind of GRIDS) {
      if (kind === layout || kind === '1x1') continue;

      commands.push({
        id: `split:${kind}`,
        section: 'actions',
        title: i18n.t(SHAPE_LABEL[kind]),
        keywords: ['split', 'pane', 'dividir', 'painel', 'panel', kind],
        run: () => actions.splitPanel(kind),
      });
    }
  }

  if (layout !== '1x1') {
    commands.push({
      id: 'split:none',
      section: 'actions',
      title: i18n.t('command.split.none'),
      keywords: ['split', 'pane', 'dividir', 'painel', 'panel'],
      run: () => actions.splitPanel('1x1'),
    });
  }

  /* Moving a tab is only a thing when there is somewhere to move it to, and
     only when something is focused to move. Named, because with four
     rectangles on screen "move the tab" is a question and not an instruction. */
  if (focusedGroup >= 0 && focusedTitle !== null) {
    for (let to = 0; to < groupCount; to += 1) {
      if (to === focusedGroup) continue;
      commands.push({
        id: `group:move:${String(to)}`,
        section: 'actions',
        title: i18n.t('group.move', { name: focusedTitle, number: String(to + 1) }),
        keywords: ['group', 'move', 'grupo', 'mover', 'pane'],
        run: () => actions.moveTabToGroup(to),
      });
    }

    commands.push({
      id: 'group:close',
      section: 'actions',
      title: i18n.t('group.close'),
      keywords: ['group', 'close', 'grupo', 'fechar', 'cerrar', 'pane'],
      run: actions.closeGroup,
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

  /* The one door to the map until it leaves preview (ADR-0066). A fresh
     install shows the classic navigation, and this reveals the map's rail
     slot for the curious; turning it off hides the slot again and Home
     takes over if the map was showing. */
  commands.push({
    id: 'preview:map',
    section: 'actions',
    title: previewFeatures
      ? i18n.t('command.preview.hideMap')
      : i18n.t('command.preview.showMap'),
    keywords: ['preview', 'map', 'mapa', 'previa', 'previsualizacao', 'experimental'],
    run: () => actions.usePreviewFeatures(!previewFeatures),
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

/**
 * Saved macros, run-ready, plus the way to manage them.
 *
 * A macro's own entry is only offered with somewhere to send it: an active
 * session. The same reasoning `actionCommands` already applies to
 * `tab:close`: an entry that cannot do anything costs a keystroke and a
 * disappointment, in a list whose whole value is that everything in it
 * works. "Manage macros" needs no session at all, so it is never gated.
 */
export function macroCommands(context: CommandContext): readonly Command[] {
  const { i18n, macros, macroTargetId, actions } = context;
  const commands: Command[] = [];

  if (macroTargetId !== null) {
    for (const macro of macros) {
      commands.push({
        id: `macro:${macro.id}`,
        section: 'snippets',
        title: macro.name,
        keywords: ['macro', 'snippet'],
        run: () => actions.runMacro(macro),
      });
    }
  }

  commands.push({
    id: 'macros:manage',
    section: 'actions',
    title: i18n.t('command.macros.manage'),
    keywords: ['macro', 'macros', 'snippet', 'snippets'],
    run: actions.openMacros,
  });

  return commands;
}

/**
 * The one entry point ADR-0076's contract requires beyond the toolbar
 * button: never gated, since managing hosts needs no session already open,
 * the same reasoning `macros:manage` already rests on.
 */
export function hostsManagerCommand(context: CommandContext): readonly Command[] {
  const { i18n, actions } = context;

  return [
    {
      id: 'hosts:manage',
      section: 'actions',
      title: i18n.t('command.hosts.manage'),
      keywords: ['host', 'hosts', 'sessions', 'manage', 'gerenciar', 'administrar'],
      run: actions.openHostsManager,
    },
  ];
}
