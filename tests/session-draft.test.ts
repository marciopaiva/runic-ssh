/**
 * Guards the session form.
 *
 * The core refuses the same things and is what actually writes the file — see
 * `config::sessions::validate_draft`. These cover what the form adds on top:
 * saying *which* field is wrong, saying it about all of them at once, and not
 * letting a value through that looks plausible and is not.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  EMPTY_DRAFT,
  EMPTY_FORWARD,
  LIMITS,
  invalidFields,
  invalidForward,
  invalidForwards,
  parsePort,
  suggestName,
  toForwards,
} from '../src/features/sessions/draft';
import type { DraftValues, ForwardDraft } from '../src/features/sessions/draft';

const valid: DraftValues = {
  name: 'web-01',
  host: '10.0.4.31',
  port: '22',
  user: 'deploy',
  group: 'Production',
  proxyJump: '',
  kind: 'direct',
  forwards: [],
};

const withValue = (field: keyof DraftValues, value: string): DraftValues => ({
  ...valid,
  [field]: value,
});

describe('a session draft', () => {
  it('accepts one that is filled in', () => {
    expect(invalidFields(valid)).toEqual([]);
  });

  it('accepts one with no group', () => {
    /* The group is optional, and a form that insisted on one would make
       people invent categories. */
    expect(invalidFields(withValue('group', ''))).toEqual([]);
  });

  it('names every field that is wrong, not just the first', () => {
    /* Reporting one at a time makes somebody submit four times to find out
       about four mistakes. */
    expect(
      [
        ...invalidFields({
          name: '',
          host: '',
          port: 'x',
          user: '',
          group: '',
          proxyJump: '',
          kind: 'direct',
          forwards: [],
        }),
      ].sort(),
    ).toEqual(['host', 'name', 'port', 'user'].sort());
  });

  it('refuses a field that is only whitespace', () => {
    expect(invalidFields(withValue('host', '   '))).toEqual(['host']);
  });

  it('refuses a name longer than the core will store', () => {
    expect(invalidFields(withValue('name', 'x'.repeat(LIMITS.name + 1)))).toEqual(['name']);
  });

  it('refuses a host name that renders as a different one', () => {
    /* A right-to-left override turns web-01.example.com into something that
       reads as another host entirely, in a list whose only job is telling
       hosts apart. The core refuses it too; this says which field. */
    expect(invalidFields(withValue('host', 'web-01‮moc.elpmaxe'))).toEqual(['host']);
  });

  it('refuses an invisible character in a name', () => {
    expect(invalidFields(withValue('name', 'web​-01'))).toEqual(['name']);
  });
});

describe('the port', () => {
  it('accepts a plain number', () => {
    expect(parsePort('2222')).toBe(2222);
  });

  it('refuses anything that is not digits', () => {
    /* Number('22 ') is 22 and Number('') is 0, so anything built on Number
       alone lets a field the user got wrong through as something plausible. */
    expect(parsePort('22a')).toBeNull();
    expect(parsePort('')).toBeNull();
    expect(parsePort('  ')).toBeNull();
    expect(parsePort('2.2')).toBeNull();
    expect(parsePort('-22')).toBeNull();
  });

  it('refuses one outside the range a port has', () => {
    expect(parsePort('0')).toBeNull();
    expect(parsePort('65536')).toBeNull();
    expect(parsePort('65535')).toBe(65535);
  });

  it('starts at 22 rather than blank', () => {
    /* Nobody should have to type it, and a blank field is one people assume
       is already filled. */
    expect(parsePort(EMPTY_DRAFT.port)).toBe(22);
  });
});

describe('naming a session', () => {
  it('falls back to the host when the name is left blank', () => {
    expect(suggestName({ ...valid, name: '' }).name).toBe(valid.host);
  });

  it('does not overwrite a name somebody typed', () => {
    expect(suggestName(valid).name).toBe('web-01');
  });

  it('has nothing to suggest with no host either', () => {
    expect(suggestName({ ...EMPTY_DRAFT }).name).toBe('');
  });
});

describe('a forward row (ADR-0054)', () => {
  const local: ForwardDraft = { ...EMPTY_FORWARD, bindPort: '8080', targetHost: 'target.internal', targetPort: '80' };

  it('accepts a complete local or remote row', () => {
    expect(invalidForward(local)).toBe(false);
    expect(invalidForward({ ...local, kind: 'remote' })).toBe(false);
  });

  it('accepts a dynamic row with no target at all', () => {
    expect(invalidForward({ ...EMPTY_FORWARD, kind: 'dynamic', bindPort: '1080' })).toBe(false);
  });

  it('refuses a missing or invalid bind port on every kind', () => {
    expect(invalidForward({ ...local, bindPort: '' })).toBe(true);
    expect(invalidForward({ ...local, bindPort: '0' })).toBe(true);
    expect(invalidForward({ ...EMPTY_FORWARD, kind: 'dynamic', bindPort: '' })).toBe(true);
  });

  it('refuses a local or remote row missing a target host', () => {
    expect(invalidForward({ ...local, targetHost: '' })).toBe(true);
  });

  it('refuses a local or remote row with an invalid target port', () => {
    expect(invalidForward({ ...local, targetPort: 'x' })).toBe(true);
  });

  it('ignores an empty target on a dynamic row, even if one was typed before switching kind', () => {
    /* Switching a row to Dynamic and back to Local should not resurrect a
       half-typed target the UI hid meanwhile; that is `toForwards`' own
       concern, this is just the validity check agreeing it is fine either
       way while the row reads as Dynamic. */
    expect(invalidForward({ ...local, kind: 'dynamic' })).toBe(false);
  });

  it('flags the whole list when any one row is invalid', () => {
    expect(invalidForwards([local, { ...local, bindPort: '' }])).toBe(true);
    expect(invalidForwards([local])).toBe(false);
    expect(invalidForwards([])).toBe(false);
  });

  it('carries a name through, or null when left blank', () => {
    expect(toForwards([{ ...local, name: 'web' }])[0]?.name).toBe('web');
    expect(toForwards([local])[0]?.name).toBeNull();
  });

  it('drops the target for a dynamic row even if one was typed before switching kind', () => {
    expect(toForwards([{ ...local, kind: 'dynamic' }])[0]).toMatchObject({
      targetHost: null,
      targetPort: null,
    });
  });

  it('parses every port as the number the core expects', () => {
    expect(toForwards([local])[0]).toMatchObject({ bindPort: 8080, targetPort: 80 });
  });
});

describe('the limits', () => {
  it('are the ones the core enforces', () => {
    /* Two copies of four numbers. If the form is stricter it refuses what
       would have been stored; if it is laxer the user gets a round trip and
       an error with no field attached. */
    const rust = readFileSync(
      fileURLToPath(new URL('../src-tauri/src/config/sessions.rs', import.meta.url)),
      'utf8',
    );

    expect(rust).toContain(`field("name", &draft.name, ${LIMITS.name})`);
    expect(rust).toContain(`field("host", &draft.host, ${LIMITS.host})`);
    expect(rust).toContain(`field("user", &draft.user, ${LIMITS.user})`);
    expect(rust).toContain(`field("group", group, ${LIMITS.group})`);
  });
});
