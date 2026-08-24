// The two rules a machine can check: the long dash, and the commit prefix.
//
// Section 1 forbids the long dash as a general connector, and section 9 lists
// the prefixes a subject may start with. Both were being enforced by whoever
// happened to read the diff, which is another way of saying sometimes.
//
// It looks only at lines this branch adds. That is not a shortcut, it is the
// rule: section 1 corrected the documents people read and deliberately left
// the code comments alone, because a style pass across the tree takes the line
// authorship with it. There are around 180 long dashes in comments today and
// every one of them is meant to be there. Checking the tree would report all
// of them on the first run and the check would be switched off by lunchtime.
//
//   node scripts/prose.mjs           against the merge base with main
//   node scripts/prose.mjs <ref>     against something else
//
// Three exemptions, each because the dash is not prose:
//
//   src/locales/*.json    user-facing copy, where a dash is typography
//   catalog.generated.ts  generated from those catalogues
//   '—' alone in quotes   the placeholder `formatBytes` returns for no value
//
// and the Keep a Changelog version heading, where a dash stands between the
// version and its date. That is the format's own separator, not a sentence.
//
// Note that the exemption is for the pattern, never for text that quotes it.
// This comment used to carry the heading as a literal example and the check
// reported itself on the first run, correctly.

import { spawnSync } from 'node:child_process';

const DASH = '—';

const ALLOWED_PREFIXES = ['feat', 'fix', 'refactor', 'docs', 'test', 'chore', 'ci', 'design'];
const SUBJECT_LIMIT = 72;

const EXCLUDED = [':(exclude)src/locales', ':(exclude)src/lib/i18n/catalog.generated.ts'];

/** Runs git and returns stdout, or exits saying which call failed. */
function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(`  git ${args.join(' ')} failed:\n${result.stderr}`);
    process.exit(2);
  }
  return result.stdout;
}

/** The commit this branch grew from, so only its own lines are read. */
function baseRef() {
  const asked = process.argv[2];
  if (asked !== undefined) return git(['rev-parse', asked]).trim();

  for (const candidate of ['main', 'origin/main']) {
    const found = spawnSync('git', ['merge-base', 'HEAD', candidate], { encoding: 'utf8' });
    if (found.status === 0) return found.stdout.trim();
  }

  console.error('  no main or origin/main to compare against. Pass a ref.');
  process.exit(2);
}

/** A dash carrying data rather than joining a clause. */
function isExempt(text) {
  const trimmed = text.trim();
  if (new RegExp(`^## \\[.+\\] ${DASH} \\d{4}-\\d{2}-\\d{2}$`).test(trimmed)) return true;
  return new RegExp(`['"\`]${DASH}['"\`]`).test(trimmed);
}

/** Every line the range adds, with the number it will have in the new file. */
function addedLines(base) {
  const diff = git(['diff', '--unified=0', `${base}...HEAD`, '--', '.', ...EXCLUDED]);
  const found = [];

  let file = null;
  let next = 0;

  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) {
      file = line.slice('+++ b/'.length);
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(line);
    if (hunk !== null) {
      next = Number(hunk[1]);
      continue;
    }
    if (line.startsWith('+') && file !== null) {
      found.push({ file, line: next, text: line.slice(1) });
      next += 1;
    }
  }

  return found;
}

const base = baseRef();
const problems = [];

for (const added of addedLines(base)) {
  if (!added.text.includes(DASH) || isExempt(added.text)) continue;
  problems.push(`${added.file}:${added.line}  ${added.text.trim()}`);
}

/* `--no-merges` is not tidiness. On a pull request GitHub checks out the merge
   commit rather than the branch head, and its subject is "Merge <sha> into
   <sha>", which no prefix rule can accept. The check reported it on its own
   first run in CI. */
for (const subject of git(['log', `${base}..HEAD`, '--no-merges', '--format=%s']).split('\n').filter(Boolean)) {
  const prefix = /^([a-z]+)(?:\(.+\))?: /.exec(subject);
  if (prefix === null || !ALLOWED_PREFIXES.includes(prefix[1])) {
    problems.push(`commit  ${subject}\n          prefix must be one of ${ALLOWED_PREFIXES.join(', ')}`);
  } else if (subject.length > SUBJECT_LIMIT) {
    problems.push(`commit  ${subject}\n          subject is ${subject.length} characters, the limit is ${SUBJECT_LIMIT}`);
  }
}

if (problems.length === 0) {
  console.log(`  ok    prose   nothing added against ${base.slice(0, 7)}`);
  process.exit(0);
}

console.log(`  FAIL  prose   ${problems.length} against ${base.slice(0, 7)}\n`);
for (const problem of problems) console.log(`  ${problem}`);
console.log(`\n  Section 1: the long dash is not a general connector, and a sentence`);
console.log(`  needing one to hold it together usually wants to be two sentences.`);
console.log(`  Section 9 lists the prefixes. Old comments are exempt on purpose.`);
process.exit(1);
