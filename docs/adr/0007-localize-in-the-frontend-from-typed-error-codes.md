# ADR-0007: Localize in the frontend, from typed error codes, with no i18n dependency

* **Status**: Accepted
* **Date**: 2026-08-22

## Context

Runic SSH ships in Brazilian Portuguese, English and Spanish from the first
release. No source tree exists yet, so this is being decided before the first
user-visible string is written, which is the only moment it can be decided
without a migration, because it shapes the error type that every IPC command
returns.

Two questions are separable, and the second only has a good answer once the
first is settled.

**Where human-readable text comes from.** Text reaches the user from two
places. The React frontend owns labels, buttons and empty states. The Rust core
owns failures: a refused authentication, an unreachable host, a keychain with no
secret service behind it. `docs/architecture.md` already says errors are typed
with `thiserror` per module and surfaced across IPC as a serializable enum, and
ADR-0004 requires the Linux no-secret-service case to "degrade to prompting per
connection with a clear explanation", and an explanation is user-facing text,
and therefore translatable text, originating in the core.

**What renders that text.** The webview already carries `Intl`:
`Intl.NumberFormat`, `Intl.RelativeTimeFormat`, `Intl.DateTimeFormat` and
`Intl.PluralRules` are present in WebView2, WKWebView and WebKitGTK. Dates,
byte sizes, transfer durations and plural selection are solved before any
library is added. What is genuinely left is looking a key up in a catalog and
interpolating a value or two.

Constraints that bind this decision:

* Section 2 of `CLAUDE.md`: a new npm package is an architectural decision in a
  project whose pitch is being small and auditable.
* Section 6: `strict: true`, no `any`.
* Rule 2 of `docs/security-model.md`: nothing secret is ever logged or returned
  toward the frontend. Interpolating a value into a message is a formatting
  step, and formatting is exactly where a captured passphrase leaks.
* Section 1 of `CLAUDE.md`: everything that lands in the repository is written
  in English, "without exception". Translation catalogs contradict that rule as
  written.

One thing is out of scope and worth stating so it is not helpfully added later:
**terminal output is never translated.** Remote shell output, MOTDs, SFTP
filenames and server-sent error text pass through verbatim. Only application
chrome is localized.

## Options considered

### Option A: The core returns localized strings

Each command takes the active locale, or the core holds it in state, and Rust
resolves a message before it crosses IPC. The frontend renders whatever it is
handed and never thinks about error text.

The cost lands in the wrong place. The catalog splits in two, so a language is
added by touching both Rust and TypeScript. The locale has to cross the IPC
boundary on every fallible call, or be stored as core state and kept in sync
with a frontend that can change it at any moment. Changing language would mean
re-fetching text the core already sent. And a `String` error is opaque: the
frontend cannot branch on what went wrong, so any UI that wants to offer
"retry" for a timeout but "review host key" for a mismatch has to match on
translated prose.

### Option B: The core returns a typed code plus structured parameters

Every command's error is a serializable enum whose variants carry data, not
sentences: `HostKeyMismatch { host, expected_fp, offered_fp }`,
`KeychainUnavailable { backend }`, `AuthFailed { method }`. The frontend maps
the code to a message in the active locale and interpolates the parameters.

The core never formats a sentence, which also means it never formats a value
into one. The redaction rule in `security-model.md` becomes structural, since
a variant carries only fields we deliberately declared. Adding Spanish touches
no Rust. The frontend can branch on the code to choose an action, not just a
message.

The cost is discipline: every new error variant needs a catalog entry in three
languages, and an unmapped code must fail loudly rather than render blank.

### Option C: `react-i18next`, or `react-intl` with ICU messages

The ecosystem standards. Interpolation, plurals, namespaces, lazy loading,
locale detection plugins, and, for `react-intl`, full ICU message syntax with
nested select and gender, which matters for languages that inflect.

The cost is roughly 40 KB of runtime for the parts we would use, a large API
surface we would not, a dependency to track for advisories, and, for the ICU
route, a compile step. Neither library gives a missing translation key a
compile error by default; both render the raw key at runtime instead.

### Option D: A typed catalog over native `Intl`

Around 120 lines in `src/lib/i18n/`. Flat keyed JSON per locale in
`src/locales/`. The English catalog is the source of truth and its keys are
generated into a union type, so referencing a key that does not exist, or
shipping a locale missing a key, fails `pnpm typecheck` rather than surfacing in
production as a raw identifier. Plural selection through `Intl.PluralRules`,
everything numeric and temporal through the matching `Intl` formatter.

The cost is that we own it. No ICU select or gender forms, no translation
management platform integration, no automatic string extraction.

## Decision

Option B for the boundary, Option D for the renderer.

The core returns typed codes with structured parameters; the frontend owns
every human-readable string in `src/locales/{en,pt-BR,es}.json`, rendered by a
small typed catalog built on `Intl`.

Option B beats A because it is the only shape in which the security rule is
structural rather than a habit: a core that never builds a sentence cannot
interpolate a secret into one. Option D beats C on the project's own stated
terms: the features we would actually use are key lookup and plural selection,
and `Intl.PluralRules` already does the second. The compile-time guarantee that
a missing translation breaks the build, rather than rendering a raw key to a
user, is something neither library offers by default and is worth more here
than the ecosystem tooling we would be buying.

Two tradeoffs are accepted explicitly. We give up ICU's `select` and gender
forms, which Portuguese and Spanish can genuinely need for prose about a
gendered noun; the mitigation is that application chrome mostly is not that
kind of prose, and where it is, the string gets split rather than inflected. And
we give up integration with a translation platform, which becomes a real cost
the moment translation is done by someone who is not a contributor.

## Consequences

**Good**: no runtime dependency for localization. Adding a fourth language is a
JSON file and a line in the locale registry, with no Rust change and no IPC
change. A missing or misspelled key fails the build. Error codes let the UI
choose an action, not just a sentence. The "review host key" path in the
sidebar comes from the code, not from parsed text. Dates, byte counts and
durations format correctly per locale for free, including the `pt-BR` decimal
comma that would otherwise be reported as a bug.

**Bad**: the catalog is ours to maintain, and there is no tooling to tell us a
translation drifted from the English source once both exist. No ICU `select`
means an awkward string somewhere will have to be rewritten rather than
inflected. Every new error variant is now a three-language chore, and the one
that gets skipped is the rarely-hit path, which is exactly the path
`CLAUDE.md` section 8 says gets tested, because it is what the user actually
hits. Approximately 120 lines of i18n machinery is 120 lines of code that a
library would have maintained for us, and if the catalog grows past a few
hundred keys or a translation vendor gets involved, this decision should be
reversed.

**Bad, and specific to this product**: the host key warnings are security
controls made of words. A mistranslated "the key changed, this may be an
interception" is not a typo, it is a vulnerability. Those strings need review by
a native speaker before release, and the English string stays normative when
they disagree.

**Bad, for the approved design**: Portuguese and Spanish run roughly 15 to 30
percent longer than English. The layout approved on 2026-08-22 has tight places
the tab strip, the status bar and the buttons in the host key dialog, that were
composed against English text and will need to be re-checked against the
longest of the three languages, not the shortest.

**Resolved on 2026-08-22**: Spanish ships as neutral `es`, not split into
`es-ES` and `es-419`. Section 1 of `CLAUDE.md` was amended the same day to carve
out `src/locales/` and to require native-speaker review of security copy.

**Resolved on 2026-08-22**: Spanish is not offered in v0.1.0. The context above
says the client ships in three languages from the first release; that is no
longer true, and the reason is the review requirement this same decision
created. No native Spanish speaker is on the project, and a mistranslated host
key warning is a vulnerability rather than a typo, so shipping the language
unreviewed would mean shipping a security control in a language nobody here can
check.

`es.json` stays in the tree, translated and held to the same key-parity tests as
the other two. It is simply not offered in the language selector until the
security copy is signed off, at which point exposing it is a one-line change.
The alternative was leaving the release blocked on finding a person, with no
owner and no date, which is the state that produced this decision.

**Resolved on 2026-08-26**: Spanish is offered, from v0.2.1. A native speaker, a
contributor in the maintainer's network, read the security copy #4 scopes and
verified rather than translated it; the English stayed normative. Exposing it
was the one-line change this decision said it would be, which is what carrying
availability separately from existence bought.

The reviewer asked not to be named and #4 asks for a named one, so that part of
its wording is not met. What a name carries is somebody to ask, and the
maintainer confirmed the review and stands behind it. That is weaker than a name
and stronger than nothing, and it is recorded as the middle thing it is rather
than as the strong one.

**Follow-up**: find that reviewer. #4 closed on 2026-08-26 by redefining its
own scope rather than by a named reviewer showing up, so it stopped being
that tracker the same day this paragraph was written; #227 is the one that
still is. Not release-blocking for v0.1.0 either way. The locale registry
needs to carry availability separately from existence, so a catalogue can be
complete and still not offered. Use CSS logical properties from the first
component, since that is the entire cost of supporting a right-to-left language
later and it is free today. Revisit this decision if the catalog outgrows a few
hundred keys, or as soon as translation moves outside the contributor group.
