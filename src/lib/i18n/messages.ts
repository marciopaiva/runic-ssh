/**
 * The message contract.
 *
 * `en.json` is the source of truth in the type system as well as in the
 * agreement: every key comes from it, and every other catalogue has to satisfy
 * the same shape. A missing key in `pt-BR.json` is a compile error rather than
 * a raw identifier rendered to a user, which is the guarantee ADR-0007 chose
 * this approach for.
 */

import { SOURCE_CATALOG } from './catalog.generated';

/** Every key that exists. Referencing anything else does not compile. */
export type MessageKey = keyof typeof SOURCE_CATALOG;

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
  Placeholders<(typeof SOURCE_CATALOG)[K]> extends never
    ? Record<string, never>
    : { readonly [P in Placeholders<(typeof SOURCE_CATALOG)[K]>]: string | number };

/**
 * Keys whose message has no holes.
 *
 * Somewhere to stand when the key is chosen at runtime: `t` cannot know which
 * member of a union it was handed, so a dynamic key has to come from a set
 * where the answer is the same for every member. Narrowing to this is stronger
 * than loosening `t` would have been — a label picked at runtime now *cannot*
 * be one that needed a parameter nobody passed.
 */
export type ParameterlessKey = {
  [K in MessageKey]: Placeholders<(typeof SOURCE_CATALOG)[K]> extends never ? K : never;
}[MessageKey];

/**
 * The argument list for a key: exactly one parameter object when the message
 * has holes, and nothing at all when it does not.
 *
 * A tuple rather than an optional parameter, because optional would let a
 * message with holes be called without filling them — which renders `{host}`
 * to a user and is the failure this typing exists to prevent.
 */
export type MessageArgs<K extends MessageKey> =
  Placeholders<(typeof SOURCE_CATALOG)[K]> extends never
    ? []
    : [params: MessageParams<K>];

/**
 * A complete catalogue.
 *
 * Deliberately not `Partial`. A locale is complete or it is not shipped, and
 * "translate the rest later" is how half a screen ends up in English.
 */
export type Catalog = { readonly [K in MessageKey]: string };

export { SOURCE_CATALOG as sourceCatalog };
