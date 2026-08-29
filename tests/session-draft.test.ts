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
  LIMITS,
  invalidFields,
  parsePort,
  suggestName,
} from '../src/features/sessions/draft';
import type { DraftValues } from '../src/features/sessions/draft';

const valid: DraftValues = {
  name: 'web-01',
  host: '10.0.4.31',
  port: '22',
  user: 'deploy',
  group: 'Production',
  proxyJump: '',
  kind: 'other',
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
    expect([...invalidFields({ name: '', host: '', port: 'x', user: '', group: '', proxyJump: '', kind: 'other' })].sort()).toEqual(
      ['host', 'name', 'port', 'user'].sort(),
    );
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
