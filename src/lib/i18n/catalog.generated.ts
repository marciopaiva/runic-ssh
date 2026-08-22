/* Generated from src/locales/en.json by scripts/generate-catalog-types.mjs.
 * Do not edit: run `pnpm typecheck`, which regenerates it.
 *
 * This exists only so the compiler can read what a message says. The runtime
 * catalogue is still the JSON — see src/lib/i18n/locales.ts. */

export const SOURCE_CATALOG = {
  "app.name": "Runic SSH",
  "app.shell.idle": "shell mounted · no session yet",
  "language.en": "English",
  "language.pt-BR": "Português (Brasil)",
  "language.es": "Español",
  "hostKey.unknown.title": "Unknown host key",
  "hostKey.unknown.body": "Runic SSH has never connected to {host} before. Confirm the fingerprint through a channel you already trust — not through this connection.",
  "hostKey.field.host": "HOST",
  "hostKey.field.keyType": "KEY TYPE",
  "hostKey.field.fingerprint": "SHA256 FINGERPRINT",
  "hostKey.verify.label": "I verified this fingerprint out of band",
  "hostKey.verify.hint": "From the provider console, a configuration repository, or someone who runs the host.",
  "hostKey.savedTo": "Saved to known_hosts",
  "hostKey.action.cancel": "Cancel",
  "hostKey.action.trust": "Trust and connect",
  "hostKey.changed.title": "Host key changed — connection blocked",
  "hostKey.changed.body": "The key {host} presented does not match the one saved. Either the host was rebuilt, or something is sitting between you and it.",
  "hostKey.changed.trusted": "TRUSTED BEFORE",
  "hostKey.changed.offered": "OFFERED NOW",
  "hostKey.changed.confirmPrompt": "TO OVERRIDE, TYPE THE HOST NAME",
  "hostKey.changed.replace": "Replace stored key",
  "hostKey.changed.cancel": "Cancel connection",
  "hostKey.revoked.title": "This key is revoked",
  "hostKey.revoked.body": "known_hosts marks this key as revoked. It cannot be accepted, and there is no override.",
  "hostKey.certificate.title": "This host uses a certificate",
  "hostKey.certificate.body": "known_hosts says {host} authenticates with a certificate. Runic SSH does not verify certificates yet, and trusting a bare key instead is exactly the substitution that marker warns about.",
} as const;
