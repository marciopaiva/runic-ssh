/**
 * Keeps the two halves of the IPC contract in step.
 *
 * The core and the frontend describe the same errors in two languages, and
 * nothing at runtime notices when they drift — the symptom is a failure the
 * interface cannot name, rendered as a blank toast, in the moment the user most
 * needs to be told something. So the TypeScript union is checked against the
 * Rust enum directly.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { asIpcError } from '../src/ipc/errors';
import type { CredentialStoreStatus, WindowChrome } from '../src/ipc';

const rustSource = readFileSync(
  fileURLToPath(new URL('../src-tauri/src/error.rs', import.meta.url)),
  'utf8',
);

const typescriptSource = readFileSync(
  fileURLToPath(new URL('../src/ipc/errors.ts', import.meta.url)),
  'utf8',
);

/** The variants of the serialized `IpcError` enum, in the core's own casing. */
function rustCodes(): string[] {
  const start = rustSource.indexOf('pub enum IpcError');
  const end = rustSource.indexOf('\n}', start);
  const body = rustSource.slice(start, end);

  return [...body.matchAll(/^\s{4}([A-Z][A-Za-z]*)\s*[,{]/gm)]
    .map(([, name]) => (name ?? '').charAt(0).toLowerCase() + (name ?? '').slice(1))
    .sort();
}

/** The codes the frontend claims it can receive. */
function typescriptCodes(): string[] {
  const start = typescriptSource.indexOf('const CODES');
  const end = typescriptSource.indexOf(']);', start);

  return [...typescriptSource.slice(start, end).matchAll(/'([a-zA-Z]+)'/g)]
    .map(([, code]) => code ?? '')
    .sort();
}

describe('the IPC error contract', () => {
  it('names the same failures on both sides', () => {
    const rust = rustCodes();
    const typescript = typescriptCodes();

    expect(rust.length, 'no variants were found in error.rs').toBeGreaterThan(5);

    const missing = rust.filter((code) => !typescript.includes(code));
    const extra = typescript.filter((code) => !rust.includes(code));

    expect(
      missing,
      `the core can send ${missing.join(', ')}, which the frontend cannot name`,
    ).toEqual([]);
    expect(
      extra,
      `the frontend expects ${extra.join(', ')}, which the core never sends`,
    ).toEqual([]);
  });

  it('narrows a real rejection', () => {
    const rejection = { code: 'hostKeyRejected', verdict: 'changed', offered: null, stored: [] };
    expect(asIpcError(rejection)?.code).toBe('hostKeyRejected');
  });

  it('refuses anything it does not recognise', () => {
    /* A rejection is not guaranteed to be ours — the bridge itself can fail —
       so an unrecognised shape stays undefined rather than being cast into one
       it does not have. */
    for (const rejection of [undefined, null, 'boom', { code: 'invented' }, { message: 'x' }]) {
      expect(asIpcError(rejection)).toBeUndefined();
    }
  });
});

describe('shapes the frontend declares by hand', () => {
  /* The error union is checked against the Rust enum above. Everything else
     crossing the boundary is a type someone wrote twice, and nothing compares
     them — which is how `CredentialStoreStatus` came to describe a shape the
     core never sent. These pin the wire form; the matching assertions are in
     src-tauri/src/vault/mod.rs. */

  it('accepts the credential store status the core actually sends', () => {
    const available: CredentialStoreStatus = JSON.parse('{"kind":"available"}') as CredentialStoreStatus;
    const unavailable: CredentialStoreStatus = JSON.parse(
      '{"kind":"unavailable","reason":"no store"}',
    ) as CredentialStoreStatus;

    expect(available.kind).toBe('available');
    expect(unavailable.kind).toBe('unavailable');
    expect(unavailable.kind === 'unavailable' ? unavailable.reason : null).toBe('no store');
  });

  it('accepts the window chrome the core actually sends', () => {
    /* The titlebar reserves `leadingInset` pixels it never draws into. A
       shape mismatch here is a strip of dead space at the leading edge, or
       tabs drawn underneath the macOS traffic lights. */
    const macos: WindowChrome = JSON.parse(
      '{"controls":"system","leadingInset":78,"commandModifier":"meta"}',
    ) as WindowChrome;
    const undecorated: WindowChrome = JSON.parse(
      '{"controls":"application","leadingInset":0,"commandModifier":"control"}',
    ) as WindowChrome;

    expect(macos.controls).toBe('system');
    expect(macos.leadingInset).toBe(78);
    expect(macos.commandModifier).toBe('meta');
    expect(undecorated.controls).toBe('application');
    expect(undecorated.leadingInset).toBe(0);
    expect(undecorated.commandModifier).toBe('control');
  });

  it('has a Rust test pinning the same window chrome strings', () => {
    const rust = readFileSync(
      fileURLToPath(new URL('../src-tauri/src/commands/chrome.rs', import.meta.url)),
      'utf8',
    );

    expect(rust).toContain(
      '{"controls":"system","leadingInset":78,"commandModifier":"meta"}',
    );
    expect(rust).toContain(
      '{"controls":"application","leadingInset":0,"commandModifier":"control"}',
    );
  });

  it('has a Rust test pinning the same two strings', () => {
    /* If this file's literals change, that one has to change with them, and
       the pair is the only thing keeping the two halves honest. */
    const rust = readFileSync(
      fileURLToPath(new URL('../src-tauri/src/vault/mod.rs', import.meta.url)),
      'utf8',
    );

    expect(rust).toContain('{"kind":"available"}');
    expect(rust).toContain('{"kind":"unavailable","reason":"no store"}');
  });
});
