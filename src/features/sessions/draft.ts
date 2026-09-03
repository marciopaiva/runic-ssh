/**
 * Checking a session before it is saved.
 *
 * The core checks the same things and is what actually refuses — see
 * `config::sessions::validate_draft`. This exists so the form can say *which
 * field* is wrong while somebody is filling it in, rather than turning a typo
 * into a round trip and a message with no field attached.
 *
 * The two must agree on what is acceptable. Where they disagree the core wins,
 * because the core is what writes the file; a test pins the limits against it.
 */

import type { Forward, ForwardKind, HostKind } from '../../ipc';
import type { ParameterlessKey } from '../../lib/i18n';

/** A forward's kind, labelled. Shared between `ForwardsFields`' own picker
 * and `StatusBar`'s tooltip, so a renamed kind cannot drift between the two
 * places it is spelled out for a person. */
export const FORWARD_KIND_LABEL: Readonly<Record<ForwardKind, ParameterlessKey>> = {
  local: 'forward.kind.local',
  remote: 'forward.kind.remote',
  dynamic: 'forward.kind.dynamic',
};

/**
 * A field a submit can find wrong.
 *
 * `proxyJump` is here and is not checked by `invalidFields`: the only way it
 * can be wrong is a question about the session list rather than about the
 * string, so it is set by the shell, which has the list. See `jumpHostChoice`.
 * `forwards` names the list as a whole rather than one row: which row is
 * wrong is `ForwardsFields`' own concern, recomputed from `value` directly
 * rather than threaded through here as a second, parallel shape.
 */
export type DraftField = 'name' | 'host' | 'port' | 'user' | 'group' | 'proxyJump' | 'forwards';

/**
 * A forward (ADR-0054) as the form edits it: every number a string, like
 * `port` above, so a field can sit empty or mid-edit without being forced
 * into something plausible early.
 */
export interface ForwardDraft {
  readonly kind: ForwardKind;
  readonly bindPort: string;
  /** Ignored for `dynamic`, whose destination is read from the SOCKS
   * handshake at connect time rather than stored. */
  readonly targetHost: string;
  readonly targetPort: string;
  readonly name: string;
}

export const EMPTY_FORWARD: ForwardDraft = {
  kind: 'local',
  bindPort: '',
  targetHost: '',
  targetPort: '',
  name: '',
};

/** The lengths the core refuses beyond. Pinned against Rust by a test. */
export const LIMITS: Readonly<Record<'name' | 'host' | 'user' | 'group', number>> = {
  name: 120,
  host: 253,
  user: 64,
  group: 120,
};

export interface DraftValues {
  readonly name: string;
  readonly host: string;
  readonly port: string;
  readonly user: string;
  readonly group: string;
  /**
   * The id of the saved session to reach this host through; empty for none.
   *
   * Never validated here. The four ways a reference can be wrong are all
   * questions about the session list rather than about the string, so the form
   * offers only what the core will accept and there is nothing left to check.
   * See `jumpHostChoice`.
   */
  readonly proxyJump: string;
  /** ADR-0031. Never wrong on its own: every value the picker offers is one
   * the core accepts, the same reason `proxyJump` needs no check here. */
  readonly kind: HostKind;
  /** ADR-0054. Started when the session connects; no separate "arm this
   * forward" gesture, the same weight `proxyJump` or `kind` already carry. */
  readonly forwards: readonly ForwardDraft[];
}

export const EMPTY_DRAFT: DraftValues = {
  name: '',
  host: '',
  /* The default nobody should have to type, and the one they will assume is
     there if the field starts blank. */
  port: '22',
  user: '',
  group: '',
  proxyJump: '',
  kind: 'direct',
  forwards: [],
};

/**
 * Characters that make one name look like another.
 *
 * The same set the core refuses. A right-to-left override in a saved host name
 * turns `web-01.example.com` into something that renders as a different host
 * entirely, in a list whose whole job is telling hosts apart.
 */
function isDeceptive(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;

  return (
    code < 0x20 ||
    code === 0x7f ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x2066 && code <= 0x2069) ||
    (code >= 0x202a && code <= 0x202e) ||
    code === 0xfeff
  );
}

/**
 * Every field that is wrong, not just the first.
 *
 * A form that reports one problem at a time makes somebody submit four times
 * to find out about four mistakes.
 */
export function invalidFields(values: DraftValues): readonly DraftField[] {
  const wrong: DraftField[] = [];

  const check = (field: 'name' | 'host' | 'user', value: string): void => {
    const trimmed = value.trim();
    if (trimmed === '' || trimmed.length > LIMITS[field] || [...trimmed].some(isDeceptive)) {
      wrong.push(field);
    }
  };

  check('name', values.name);
  check('host', values.host);
  check('user', values.user);

  const group = values.group.trim();
  if (group !== '' && (group.length > LIMITS.group || [...group].some(isDeceptive))) {
    wrong.push('group');
  }

  if (parsePort(values.port) === null) wrong.push('port');
  if (invalidForwards(values.forwards)) wrong.push('forwards');

  return wrong;
}

/**
 * The port, or `null` when it is not one.
 *
 * Rejects anything that is not entirely digits: `Number('22 ')` is 22 and
 * `Number('')` is 0, and both would let a field the user got wrong through as
 * something plausible.
 */
export function parsePort(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;

  const port = Number(trimmed);
  return port >= 1 && port <= 65535 ? port : null;
}

/**
 * Whether one forward row is not yet complete enough to save: a bind port
 * always, and for `local`/`remote` a target host and port too. `dynamic`
 * needs neither, since its destination is read from the SOCKS handshake.
 */
export function invalidForward(forward: ForwardDraft): boolean {
  if (parsePort(forward.bindPort) === null) return true;
  if (forward.kind === 'dynamic') return false;

  return forward.targetHost.trim() === '' || parsePort(forward.targetPort) === null;
}

export function invalidForwards(forwards: readonly ForwardDraft[]): boolean {
  return forwards.some(invalidForward);
}

/**
 * `forwards` as the core accepts them, once `invalidForwards` has already
 * said every row is complete. `targetHost`/`targetPort` are `null` for
 * `dynamic` regardless of what a row still holds from switching kind and
 * back, the same reasoning the core's own `Forward` shape gives for never
 * storing a destination that kind does not use.
 */
export function toForwards(forwards: readonly ForwardDraft[]): readonly Forward[] {
  return forwards.map((forward) => ({
    kind: forward.kind,
    bindPort: parsePort(forward.bindPort) ?? 0,
    targetHost: forward.kind === 'dynamic' ? null : forward.targetHost.trim(),
    targetPort: forward.kind === 'dynamic' ? null : parsePort(forward.targetPort),
    name: forward.name.trim() === '' ? null : forward.name.trim(),
  }));
}

/** Fills in the name from the host, the way somebody would if asked twice. */
export function suggestName(values: DraftValues): DraftValues {
  if (values.name.trim() !== '' || values.host.trim() === '') return values;

  return { ...values, name: values.host.trim() };
}
