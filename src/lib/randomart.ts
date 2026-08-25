/**
 * SSH randomart, the Drunken Bishop, drawn the way OpenSSH draws it.
 *
 * The picture is a recognition aid beside the fingerprint, not a substitute
 * for reading it. Its whole value is that somebody who has seen this host's
 * art before recognises it without comparing forty-three base64 characters,
 * and that value depends entirely on our picture and `ssh-keygen -lv` being
 * the same picture. Two people comparing by eye and finding a difference we
 * introduced would be worse than drawing nothing, on the one screen where
 * being wrong matters most.
 *
 * So this is written against OpenSSH's `fingerprint_randomart` rather than
 * against a description of it, and `tests/randomart.test.ts` pins the output
 * of the real command rather than the output of this file.
 *
 * Pure and side-effect free, so a test can hold the picture without a window.
 */

/** OpenSSH's field, `FLDSIZE_X` by `FLDSIZE_Y`. */
const WIDTH = 17;
const HEIGHT = 9;

/**
 * OpenSSH's `augmentation_string`, indexed by how often a square was visited.
 *
 * The last two are not visit counts. `S` marks where the walk began and `E`
 * where it ended, which is why a square can never be augmented into one: see
 * `CEILING` below.
 */
const AUGMENTATION = ' .o+=*BOX@%&#/^SE';
const START = AUGMENTATION.indexOf('S');
const END = AUGMENTATION.indexOf('E');

/**
 * The most visits a square can show.
 *
 * OpenSSH stops augmenting two short of the end of the string, reserving the
 * last two characters for the start and the end. Counting all the way up
 * would print an `S` or an `E` somewhere the bishop merely walked often, and
 * a stray marker is exactly the kind of difference that makes two people
 * comparing by eye disagree. A 32 byte fingerprint walks 128 steps over 153
 * squares, and `^`, the square below this ceiling, shows up in ordinary keys.
 */
const CEILING = END - 2;

export type Hash = 'SHA256' | 'MD5';

/** A decoded fingerprint: the bytes to walk, and what hashed them. */
interface Decoded {
  readonly bytes: Uint8Array;
  readonly hash: Hash;
}

/**
 * Decode a fingerprint string into the bytes the bishop walks.
 *
 * Accepts `SHA256:<base64>`, which is what the core hands the interface, and
 * a hex form with or without an `MD5:` prefix. `null` when the string is
 * neither: the caller then draws no picture rather than a picture of noise,
 * because noise that looks like art is the failure this whole file is about.
 */
export function decodeFingerprint(fingerprint: string): Decoded | null {
  const trimmed = fingerprint.trim();

  const sha256 = /^SHA256:([A-Za-z0-9+/=]+)$/i.exec(trimmed);
  if (sha256 !== null) {
    try {
      const binary = atob(sha256[1] ?? '');
      const bytes = new Uint8Array(binary.length);
      for (let at = 0; at < binary.length; at += 1) bytes[at] = binary.charCodeAt(at);
      return bytes.length > 0 ? { bytes, hash: 'SHA256' } : null;
    } catch {
      return null;
    }
  }

  const hex = trimmed.replace(/^MD5:/i, '').replace(/:/g, '');
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0 || hex.length < 16) return null;

  const bytes = new Uint8Array(hex.length / 2);
  for (let at = 0; at < bytes.length; at += 1) {
    bytes[at] = Number.parseInt(hex.slice(at * 2, at * 2 + 2), 16);
  }

  return { bytes, hash: 'MD5' };
}

/**
 * One of OpenSSH's borders: a title centred in dashes, between two corners.
 *
 * The remainder goes on the right, which is what makes `+---[RSA 3072]----+`
 * three dashes then four rather than the other way round.
 */
function border(title: string): string {
  const label = title === '' ? '' : `[${title}]`;
  const pad = Math.max(0, WIDTH - label.length);
  const left = Math.floor(pad / 2);

  return `+${'-'.repeat(left)}${label}${'-'.repeat(pad - left)}+`;
}

/**
 * How OpenSSH captions the top border, from the algorithm name we are given.
 *
 * `ssh-keygen` writes the type and the key size, `ED25519 256`. The core hands
 * the interface an algorithm name and no size (`ssh/connection.rs` reads it
 * from `key.algorithm()`), so the size is derived where the algorithm fixes
 * it and left off where it does not.
 *
 * That leaves RSA captioned `[RSA]` against `ssh-keygen`'s `[RSA 3072]`. The
 * nine rows between the borders are identical, which is the part being
 * compared; the caption is a caption. Carrying the size across IPC would close
 * it and is a change to the contract rather than to a drawing.
 */
function caption(keyType: string | undefined): string {
  if (keyType === undefined || keyType.trim() === '') return '';

  const name = keyType.trim().toLowerCase();

  if (name === 'ssh-ed25519' || name === 'ed25519') return 'ED25519 256';
  if (name === 'ssh-ed448' || name === 'ed448') return 'ED448 456';

  const nistp = /^ecdsa-sha2-nistp(\d+)$/.exec(name);
  if (nistp !== null) return `ECDSA ${nistp[1] ?? ''}`;

  if (name.startsWith('ssh-rsa') || name.startsWith('rsa-sha2-')) return 'RSA';
  if (name === 'ssh-dss') return 'DSA';

  /* Something we do not have a name for. Whatever the host called itself is
     better than a blank, and better than a guess that reads as authoritative. */
  return keyType.trim().toUpperCase();
}

/**
 * Walk the bishop and return the picture, borders included.
 *
 * `null` when the fingerprint cannot be decoded.
 */
export function randomart(fingerprint: string, keyType?: string): readonly string[] | null {
  const decoded = decodeFingerprint(fingerprint);
  if (decoded === null) return null;

  const field = new Array<number>(WIDTH * HEIGHT).fill(0);
  const startX = Math.floor(WIDTH / 2);
  const startY = Math.floor(HEIGHT / 2);
  let x = startX;
  let y = startY;

  for (const byte of decoded.bytes) {
    /* Two bits at a time, least significant pair first, which is the order
       that decides the whole picture. */
    for (let shift = 0; shift < 8; shift += 2) {
      const bits = (byte >> shift) & 0b11;
      x = Math.max(0, Math.min(WIDTH - 1, x + ((bits & 0b01) === 0 ? -1 : 1)));
      y = Math.max(0, Math.min(HEIGHT - 1, y + ((bits & 0b10) === 0 ? -1 : 1)));

      const at = y * WIDTH + x;
      const visits = field[at] ?? 0;
      if (visits < CEILING) field[at] = visits + 1;
    }
  }

  /* The start first and the end over it. When the walk finishes where it
     began, OpenSSH shows `E`, and a picture showing `S` there differs from
     `ssh-keygen` in one character on one square. */
  field[startY * WIDTH + startX] = START;
  field[y * WIDTH + x] = END;

  const rows: string[] = [border(caption(keyType))];

  for (let row = 0; row < HEIGHT; row += 1) {
    let line = '|';
    for (let column = 0; column < WIDTH; column += 1) {
      line += AUGMENTATION[field[row * WIDTH + column] ?? 0] ?? ' ';
    }
    rows.push(`${line}|`);
  }

  rows.push(border(decoded.hash));

  return rows;
}
