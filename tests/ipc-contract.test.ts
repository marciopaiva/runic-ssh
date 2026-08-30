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

  /* The codes inside `invalidProxyJump` are the same gap as the variants
     above, one level down: they cross as a plain string, so a fourth one added
     in Rust typechecks on both sides while the frontend union quietly cannot
     name it. Found while adding `serving` for #171. */
  it('names the same jump host problems on both sides', () => {
    const rust = [...rustSource.matchAll(/ProxyJumpProblem::[A-Za-z]+ => "([a-z]+)"/g)]
      .map(([, code]) => code ?? '')
      .sort();

    const union = typescriptSource.slice(
      typescriptSource.indexOf('readonly problem:'),
      typescriptSource.indexOf(';', typescriptSource.indexOf('readonly problem:')),
    );
    const typescript = [...union.matchAll(/'([a-z]+)'/g)].map(([, code]) => code ?? '').sort();

    expect(rust.length, 'no problems were found in error.rs').toBeGreaterThan(3);
    expect(typescript).toEqual(rust);
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
      '{"controls":"system","leadingInset":78,"commandModifier":"meta","nativeDecorations":false}',
    ) as WindowChrome;
    const undecorated: WindowChrome = JSON.parse(
      '{"controls":"application","leadingInset":0,"commandModifier":"control","nativeDecorations":false}',
    ) as WindowChrome;
    /* ADR-0005's escape hatch. It agrees with macOS on `controls` and differs
       on everything that decides layout, which is why the core sends the flag
       instead of leaving the webview to infer it from the pair. */
    const native: WindowChrome = JSON.parse(
      '{"controls":"system","leadingInset":0,"commandModifier":"control","nativeDecorations":true}',
    ) as WindowChrome;

    expect(macos.controls).toBe('system');
    expect(macos.leadingInset).toBe(78);
    expect(macos.commandModifier).toBe('meta');
    expect(macos.nativeDecorations).toBe(false);
    expect(undecorated.controls).toBe('application');
    expect(undecorated.leadingInset).toBe(0);
    expect(undecorated.commandModifier).toBe('control');
    expect(undecorated.nativeDecorations).toBe(false);
    expect(native.controls).toBe('system');
    expect(native.leadingInset).toBe(0);
    expect(native.nativeDecorations).toBe(true);
  });

  it('has a Rust test pinning the same window chrome strings', () => {
    const rust = readFileSync(
      fileURLToPath(new URL('../src-tauri/src/commands/chrome.rs', import.meta.url)),
      'utf8',
    );

    expect(rust).toContain(
      '{"controls":"system","leadingInset":78,"commandModifier":"meta","nativeDecorations":false}',
    );
    expect(rust).toContain(
      '{"controls":"application","leadingInset":0,"commandModifier":"control","nativeDecorations":false}',
    );
    expect(rust).toContain(
      '{"controls":"system","leadingInset":0,"commandModifier":"control","nativeDecorations":true}',
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

describe('the settings view', () => {
  it('is spelled the same on both sides', () => {
    /* The frontend narrows the theme to three string literals and the core
       serializes an enum into the same three. Renaming a variant compiles on
       both sides and leaves a window that quietly ignores the setting, so the
       wire form is pinned as a literal in each language. */
    const rust = readFileSync(
      fileURLToPath(new URL('../src-tauri/src/commands/settings.rs', import.meta.url)),
      'utf8',
    );

    expect(rust).toContain(
      String.raw`{"locale":null,"nativeDecorations":false,"theme":"system"}`,
    );

    const wrapper = readFileSync(
      fileURLToPath(new URL('../src/ipc/settings.ts', import.meta.url)),
      'utf8',
    );

    expect(wrapper).toContain("export type Theme = 'system' | 'light' | 'dark';");
  });

  it('has a command for every setting the view carries', () => {
    /* `get_settings` returning a field nothing can write is a setting the user
       can read and never change, which is how the theme sat for three
       releases. */
    const rust = readFileSync(
      fileURLToPath(new URL('../src-tauri/src/commands/settings.rs', import.meta.url)),
      'utf8',
    );

    for (const command of ['get_settings', 'set_locale', 'set_theme']) {
      expect(rust, `${command} is not a command`).toContain(`pub async fn ${command}`);
    }

    const registered = readFileSync(
      fileURLToPath(new URL('../src-tauri/src/lib.rs', import.meta.url)),
      'utf8',
    );

    /* Registered, not merely written: a command missing from the handler list
       fails at runtime with a message the interface cannot name. */
    expect(registered).toContain('commands::settings::set_theme');
  });
});

describe('reaching a host through another one', () => {
  it('spells the hop the same on both sides', () => {
    /* The frontend narrows it to two string literals and the core serializes
       an enum into the same two. Renaming a variant compiles on both sides and
       leaves a host key prompt that stops saying which host it is asking
       about, which is the one thing that screen exists to do. */
    const rust = readFileSync(
      fileURLToPath(new URL('../src-tauri/src/ssh/connection.rs', import.meta.url)),
      'utf8',
    );

    expect(rust).toContain(String.raw`r#""target""#`);
    expect(rust).toContain(String.raw`r#""bastion""#`);

    const frontend = readFileSync(
      fileURLToPath(new URL('../src/ipc/errors.ts', import.meta.url)),
      'utf8',
    );

    expect(frontend).toContain("export type Hop = 'target' | 'bastion';");
  });

  it('sends a refused jump host credential as a bool that is always there', () => {
    /* #191 reports the refusal on a field of `OpenSession`. A bool skipped
       when false arrives as `undefined`, and the frontend reads `undefined` as
       whatever the comparison happens to say: `credentialId` and `proxyJump`
       have each cost a screen that way. So the guard is not that the field
       exists, it is that nothing skips it. */
    const rust = readFileSync(
      fileURLToPath(new URL('../src-tauri/src/commands/sessions.rs', import.meta.url)),
      'utf8',
    );

    const struct = rust.slice(
      rust.indexOf('pub struct OpenSession'),
      rust.indexOf('\n}', rust.indexOf('pub struct OpenSession')),
    );

    const lines = struct.split('\n');
    const field = lines.findIndex((line) => line.includes('pub keep_refused: bool'));

    expect(field, 'the field is not in OpenSession').toBeGreaterThan(0);
    /* The attribute sits on the line above the field, which is what made the
       first version of this assertion pass with the defect in place. */
    expect(lines[field - 1] ?? '').not.toContain('skip_serializing_if');

    const wrapper = readFileSync(
      fileURLToPath(new URL('../src/ipc/sessions.ts', import.meta.url)),
      'utf8',
    );

    /* Not optional on this side either. `keepRefused?: boolean` would let the
       core start skipping it and nothing would fail. */
    expect(wrapper).toContain('readonly keepRefused: boolean;');
  });

  it('names the stored field the same on both sides', () => {
    /* `proxy_jump` with a camelCase rename in Rust, `proxyJump` in the wrapper.
       A rename on one side alone leaves a session that saves its jump host and
       loads without one, which reads as a setting that will not stick. */
    const rust = readFileSync(
      fileURLToPath(new URL('../src-tauri/src/config/sessions.rs', import.meta.url)),
      'utf8',
    );

    expect(rust).toContain('pub proxy_jump: Option<String>');
    expect(rust).toContain("#[serde(rename_all = \"camelCase\")]");

    const wrapper = readFileSync(
      fileURLToPath(new URL('../src/ipc/sessions.ts', import.meta.url)),
      'utf8',
    );

    expect(wrapper).toContain('readonly proxyJump: string | null;');
  });

  it('never lets a chain failure swallow a host key decision', () => {
    /* The interface finds a held decision by the code at the top of the error.
       A wrapper there would leave a host behind a bastion with no way to have
       its key accepted at all, so the core is required to say so and to have a
       test proving it. */
    const rust = readFileSync(
      fileURLToPath(new URL('../src-tauri/src/commands/sessions.rs', import.meta.url)),
      'utf8',
    );

    expect(rust).toContain('a_host_key_refusal_is_never_wrapped_in_a_chain_failure');
  });
});

describe('what became of a credential the user asked to keep', () => {
  /* ADR-0039 retired `authenticate_interactively`, the one place `Keeping`
     was ever constructed on the Rust side; the wizard's own inline test
     computes it client-side now (`submitInlineCredential`), so there is no
     Rust literal left to check it against. What is left, `status.
     credentialUnsaved`, is a different case entirely: a keep the user asked
     for and the store refused, at a hop with no tab of its own. */

  it('has copy for it in every language', () => {
    for (const locale of ['en', 'pt-BR', 'es']) {
      const catalogue = JSON.parse(
        readFileSync(
          fileURLToPath(new URL(`../src/locales/${locale}.json`, import.meta.url)),
          'utf8',
        ),
      ) as Record<string, string>;

      for (const key of ['status.credentialUnsaved', 'status.credentialUnsaved.detail']) {
        expect(catalogue[key], `${locale} ${key}`).toBeTruthy();
      }
    }
  });
});

describe('how long to keep a credential', () => {
  it('is spelled the same on both sides', () => {
    const rust = readFileSync(
      fileURLToPath(new URL('../src-tauri/src/ssh/credentials.rs', import.meta.url)),
      'utf8',
    );

    expect(rust).toContain(String.raw`r#""never""#`);
    expect(rust).toContain(String.raw`r#""forThisRun""#`);
    expect(rust).toContain(String.raw`r#""stored""#`);

    const wrapper = readFileSync(
      fileURLToPath(new URL('../src/ipc/credential.ts', import.meta.url)),
      'utf8',
    );

    expect(wrapper).toContain("export type Keep = 'never' | 'forThisRun' | 'stored';");
  });

  it('never writes what it keeps for this run', () => {
    /* The whole of what makes ADR-0025 acceptable under a threat model that
       does not defend against a local attacker running as the user: a secret
       this process holds is not reachable by anything that model claims to
       stop, *provided it is never written*. The Rust side has a test that
       reads its own source for a write; this one keeps the claim visible from
       the side that offers the choice. */
    const vault = readFileSync(
      fileURLToPath(new URL('../src-tauri/src/vault/mod.rs', import.meta.url)),
      'utf8',
    );

    expect(vault).toContain('what_the_run_keeps_is_never_written_anywhere');
  });

  it('names all three durations in every language', () => {
    for (const locale of ['en', 'pt-BR', 'es']) {
      const catalogue = JSON.parse(
        readFileSync(
          fileURLToPath(new URL(`../src/locales/${locale}.json`, import.meta.url)),
          'utf8',
        ),
      ) as Record<string, string>;

      for (const key of ['credential.keep.forThisRun', 'credential.keep.stored']) {
        expect(catalogue[key], `${locale} ${key}`).toBeTruthy();
      }

      /* Retired copy stays gone rather than left behind saying something
         nothing offers any more: the old single checkbox (ADR-0032), and
         `never` and the bare legend (ADR-0039, with the window itself). */
      for (const key of ['credential.remember', 'credential.keep', 'credential.keep.never']) {
        expect(catalogue[key], `${locale} ${key}`).toBeUndefined();
      }
    }
  });
});

describe('a credential kind suggested ahead of the window (ADR-0030)', () => {
  it('is spelled the same on both sides', () => {
    const rust = readFileSync(
      fileURLToPath(new URL('../src-tauri/src/ssh/credentials.rs', import.meta.url)),
      'utf8',
    );

    expect(rust).toContain(String.raw`r#""password""#`);
    expect(rust).toContain(String.raw`r#""privateKey""#`);

    const wrapper = readFileSync(
      fileURLToPath(new URL('../src/ipc/credential.ts', import.meta.url)),
      'utf8',
    );

    expect(wrapper).toContain("export type SuggestedMethod = 'password' | 'privateKey';");
  });
});

describe('what a host is (ADR-0031)', () => {
  it('is spelled the same on both sides', () => {
    const rust = readFileSync(
      fileURLToPath(new URL('../src-tauri/src/config/sessions.rs', import.meta.url)),
      'utf8',
    );

    for (const wire of [
      String.raw`r#""jumpServer""#`,
      String.raw`r#""database""#`,
      String.raw`r#""web""#`,
      String.raw`r#""other""#`,
    ]) {
      expect(rust).toContain(wire);
    }

    const wrapper = readFileSync(
      fileURLToPath(new URL('../src/ipc/sessions.ts', import.meta.url)),
      'utf8',
    );

    expect(wrapper).toContain(
      "export type HostKind = 'jumpServer' | 'database' | 'web' | 'other';",
    );
  });
});

describe('every command the frontend calls exists in the core', () => {
  /* A wrapper for a command nobody registered compiles, typechecks, and fails
     only when somebody clicks the thing. The two lists live in two languages
     and nothing at runtime compares them, which is the same gap the error codes
     above are here to close. Found while adding `dismiss_host_key`, which is
     one `generate_handler!` line away from being exactly this defect. */
  const wrappers = readFileSync(
    fileURLToPath(new URL('../src/ipc/sessions.ts', import.meta.url)),
    'utf8',
  );

  const registered = readFileSync(
    fileURLToPath(new URL('../src-tauri/src/lib.rs', import.meta.url)),
    'utf8',
  );

  const invoked = [...wrappers.matchAll(/invoke<[^>]*>\(\s*'([a-z_]+)'/g)].map(
    (match) => match[1] ?? '',
  );

  it('finds commands to check', () => {
    /* A regex that matches nothing would make every assertion below vacuous. */
    expect(invoked.length).toBeGreaterThan(5);
  });

  it.each(invoked)('%s is in generate_handler!', (command) => {
    expect(registered).toContain(`::${command},`);
  });
});
