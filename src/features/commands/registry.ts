/**
 * The command registry.
 *
 * One place every action in the application can be reached from. The order
 * matters more than it looks: a registry added after the fact only ever sees
 * the parts somebody remembered to register, so this exists before most of the
 * commands do.
 *
 * A source is a function rather than a list because most commands depend on
 * what is happening — which sessions are open, which tab is active. Asking the
 * sources at the moment the palette opens is what keeps a stale command from
 * being offered.
 *
 * Titles arrive translated. The source knows what the command means and has the
 * translator; the palette only ranks and draws.
 */

export type CommandSection = 'sessions' | 'actions' | 'snippets';

export interface Command {
  /** Stable across renders. Used for React keys and for the active option. */
  readonly id: string;
  readonly section: CommandSection;
  /** Shown, already translated. */
  readonly title: string;
  /** Shown at the trailing edge: a host, a state, a shortcut. */
  readonly detail?: string;
  /**
   * Matched against but never shown.
   *
   * Where a host name goes, so that typing `10.0.4` finds a session listed
   * under a friendly name, and where an English alias goes, so that a habit
   * built in one language survives switching to another.
   */
  readonly keywords?: readonly string[];
  readonly run: () => void;
}

/** Asked for its commands each time the palette opens. */
export type CommandSource = () => readonly Command[];

/**
 * Collects every source, in the order sections should appear.
 *
 * Sessions first: the most common reason to open a palette in an SSH client is
 * to go somewhere, not to change a setting.
 */
export const SECTION_ORDER: readonly CommandSection[] = ['sessions', 'actions', 'snippets'];

export function collect(sources: readonly CommandSource[]): readonly Command[] {
  const commands = sources.flatMap((source) => [...source()]);

  /* A duplicate id would make two rows share an `aria-activedescendant`, so
     the screen reader announces one row while Enter runs the other. */
  const seen = new Set<string>();
  return commands.filter((command) => {
    if (seen.has(command.id)) return false;
    seen.add(command.id);
    return true;
  });
}

/** Groups ranked commands under their section, dropping empty sections. */
export function bySection<T extends { readonly command: Command }>(
  ranked: readonly T[],
): readonly { readonly section: CommandSection; readonly entries: readonly T[] }[] {
  return SECTION_ORDER.map((section) => ({
    section,
    entries: ranked.filter((entry) => entry.command.section === section),
  })).filter((group) => group.entries.length > 0);
}
