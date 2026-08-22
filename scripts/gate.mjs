// The gate, run quietly, for the local loop.
//
// Section 8 of CLAUDE.md lists the five commands in their verbose form, and
// that form stays canonical: it is what CI runs, and its output is what a
// report cites when it claims something passed. This script is the other
// thing — the fast check you run between edits, which should say "ok" and get
// out of the way.
//
// The distinction matters more than it looks. A quiet run tells you whether
// the gate passes. It does not tell you *which* test proved *what*, and a
// claim that something was verified needs the loud form behind it.
//
//   node scripts/gate.mjs            every command
//   node scripts/gate.mjs rust       only the Rust half
//   node scripts/gate.mjs front      only the frontend half
//
// Any failure re-runs that command verbosely, because the moment you need
// output is the moment it failed.

import { spawnSync } from 'node:child_process';

/** @type {{ name: string, half: 'rust' | 'front', quiet: string[], loud: string[], cwd?: string }[]} */
const COMMANDS = [
  {
    name: 'fmt',
    half: 'rust',
    cwd: 'src-tauri',
    quiet: ['cargo', ['fmt', '--all', '--', '--check']],
    loud: ['cargo', ['fmt', '--all', '--', '--check']],
  },
  {
    name: 'clippy',
    half: 'rust',
    cwd: 'src-tauri',
    quiet: ['cargo', ['clippy', '--quiet', '--all-targets', '--all-features', '--', '-D', 'warnings']],
    loud: ['cargo', ['clippy', '--all-targets', '--all-features', '--', '-D', 'warnings']],
  },
  {
    name: 'cargo test',
    half: 'rust',
    cwd: 'src-tauri',
    quiet: ['cargo', ['test', '--quiet']],
    loud: ['cargo', ['test']],
  },
  {
    name: 'typecheck',
    half: 'front',
    quiet: ['pnpm', ['--silent', 'typecheck']],
    loud: ['pnpm', ['typecheck']],
  },
  {
    name: 'pnpm test',
    half: 'front',
    quiet: ['pnpm', ['--silent', 'vitest', 'run', '--reporter=dot']],
    loud: ['pnpm', ['test']],
  },
].map((command) => ({
  ...command,
  quiet: command.quiet,
  loud: command.loud,
}));

const only = process.argv[2];
const selected = COMMANDS.filter((command) => only === undefined || command.half === only);

if (selected.length === 0) {
  console.error(`unknown selection "${only}" — use "rust", "front", or nothing at all`);
  process.exit(2);
}

let failed = null;

for (const command of selected) {
  const [binary, args] = command.quiet;
  const started = Date.now();
  const result = spawnSync(binary, args, {
    cwd: command.cwd,
    stdio: ['ignore', 'ignore', 'pipe'],
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  if (result.status === 0) {
    console.log(`  ok    ${command.name.padEnd(12)} ${seconds}s`);
    continue;
  }

  console.log(`  FAIL  ${command.name.padEnd(12)} ${seconds}s`);
  failed = command;
  break;
}

if (failed === null) {
  console.log(`\n  the gate passes. For a report, run the five commands in section 8 —\n  a claim that something was verified cites output, not this summary.`);
  process.exit(0);
}

console.log(`\n  re-running ${failed.name} verbosely:\n`);
const [binary, args] = failed.loud;
const loud = spawnSync(binary, args, {
  cwd: failed.cwd,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(loud.status ?? 1);
