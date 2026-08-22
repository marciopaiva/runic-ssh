/**
 * The message contract.
 *
 * `en.json` is the source of truth in the type system as well as in the
 * agreement: every key comes from it, and every other catalogue has to satisfy
 * the same shape. A missing key in `pt-BR.json` is a compile error rather than
 * a raw identifier rendered to a user, which is the guarantee ADR-0007 chose
 * this approach for.
 */

import en from '../../locales/en.json';

/** Every key that exists. Referencing anything else does not compile. */
export type MessageKey = keyof typeof en;

/**
 * The placeholder names inside a message, read out of the string literal.
 *
 * `'Connected to {host} as {user}'` yields `'host' | 'user'`, so passing the
 * wrong parameter — or forgetting one — is caught at the call site rather than
 * rendering `{host}` to the user.
 */
export type Placeholders<S extends string> =
  S extends `${string}{${infer Name}}${infer Rest}`
    ? Name | Placeholders<Rest>
    : never;

/** The parameters a given key requires: none at all when it has no holes. */
export type MessageParams<K extends MessageKey> =
  Placeholders<(typeof en)[K]> extends never
    ? Record<string, never>
    : { readonly [P in Placeholders<(typeof en)[K]>]: string | number };

/**
 * A complete catalogue.
 *
 * Deliberately not `Partial`. A locale is complete or it is not shipped, and
 * "translate the rest later" is how half a screen ends up in English.
 */
export type Catalog = { readonly [K in MessageKey]: string };

export { en as sourceCatalog };
