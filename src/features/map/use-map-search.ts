/**
 * The map's own search, widened across the whole workspace (#386).
 *
 * The toolbar's query used to run against `componentsOn(workspace,
 * currentLayer)` alone: a host buried in another layer had no way to be
 * reached short of entering that layer by hand first, a gap ADR-0068 named
 * and accepted ("Search finds only the level in view") until a map actually
 * grew enough layers for it to bite.
 *
 * Reaching across a layer takes two renders, not one: `act`'s component
 * branch resolves its target through `componentById`, which is scoped to
 * `currentLayer` the same way `componentsOn` is, so a target on another
 * layer does not exist there until `setCurrentLayer` has already committed
 * and the caller has recomputed that map for the new layer. `pendingOpen`
 * is that wait: a match on the layer in view opens the same call turn it
 * always did, one anywhere else leaves `pendingOpen` for the effect below
 * to finish the moment `componentById` follows.
 */

import { useCallback, useEffect, useState } from 'react';

import type { Component, Session, Workspace } from '../../ipc';

export interface UseMapSearchOptions {
  readonly workspace: Workspace;
  /** The layer the map has in view right now (`null` at the outermost map). */
  readonly currentLayer: string | null;
  readonly setCurrentLayer: (layer: string | null) => void;
  /** Left on the way to a search result: a match outranks whatever vision is
      filling the screen the same way entering a layer already does. */
  readonly exitFullscreen: () => void;
  /** The components on the layer in view, keyed by id: empty for a target
      still on another layer, populated for it once `currentLayer` follows. */
  readonly componentById: ReadonlyMap<string, Component>;
  readonly isOpen: (id: string) => boolean;
  readonly act: (target: string, action: 'open' | 'collapse') => void;
  /** A component's host, `null` for this machine, `undefined` for a remote
      kind whose host the book no longer has. */
  readonly hostOf: (component: Component) => Session | null | undefined;
  readonly localName: string;
}

export interface MapSearch {
  readonly query: string;
  readonly onQueryChange: (value: string) => void;
  readonly onQuerySubmit: () => void;
  /** Whether a component on the layer in view matches the current query, for
      dimming the ones that do not. Always true for an empty query. */
  readonly matches: (component: Component) => boolean;
}

export function useMapSearch(options: UseMapSearchOptions): MapSearch {
  const { workspace, currentLayer, setCurrentLayer, exitFullscreen, componentById, isOpen, act, hostOf, localName } = options;
  const [query, setQuery] = useState('');
  const [pendingOpen, setPendingOpen] = useState<string | null>(null);
  const needle = query.trim().toLowerCase();

  const matches = useCallback(
    (component: Component): boolean => {
      if (needle === '') return true;
      const host = hostOf(component);
      if (host === null) return localName.toLowerCase().includes(needle);
      if (host === undefined) return false;
      return `${host.name} ${host.host} ${host.user}`.toLowerCase().includes(needle);
    },
    [hostOf, localName, needle],
  );

  const onQuerySubmit = useCallback((): void => {
    const first = workspace.components.find(matches);
    if (first === undefined) return;
    const layer = first.layer ?? null;
    if (layer === currentLayer) {
      act(first.id, isOpen(first.id) ? 'collapse' : 'open');
      return;
    }
    exitFullscreen();
    setCurrentLayer(layer);
    setPendingOpen(first.id);
  }, [act, currentLayer, exitFullscreen, isOpen, matches, setCurrentLayer, workspace.components]);

  /* Fires once `componentById` has followed `currentLayer` to the match's
     layer. A target removed, or a layer left again, before that render
     lands has nothing to open here: it drops silently rather than opening
     whatever now happens to share the id. */
  useEffect(() => {
    if (pendingOpen === null) return;
    const component = componentById.get(pendingOpen);
    if (component === undefined) return;
    act(pendingOpen, isOpen(pendingOpen) ? 'collapse' : 'open');
    setPendingOpen(null);
  }, [act, componentById, isOpen, pendingOpen]);

  return { query, onQueryChange: setQuery, onQuerySubmit, matches };
}
