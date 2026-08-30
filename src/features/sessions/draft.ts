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

import type { HostKind } from '../../ipc';

/**
 * A field a submit can find wrong.
 *
 * `proxyJump` is here and is not checked by `invalidFields`: the only way it
 * can be wrong is a question about the session list rather than about the
 * string, so it is set by the shell, which has the list. See `jumpHostChoice`.
 */
export type DraftField = 'name' | 'host' | 'port' | 'user' | 'group' | 'proxyJump';

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
  kind: 'other',
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

/** Fills in the name from the host, the way somebody would if asked twice. */
export function suggestName(values: DraftValues): DraftValues {
  if (values.name.trim() !== '' || values.host.trim() === '') return values;

  return { ...values, name: values.host.trim() };
}
