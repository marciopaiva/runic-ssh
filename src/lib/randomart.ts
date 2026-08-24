/**
 * SSH randomart (Drunken Bishop), as OpenSSH draws it.
 *
 * Generated from the fingerprint string the core already hands the UI
 * (`SHA256:…` or a hex form). The picture is a recognition aid for the
 * out-of-band check, not a substitute for reading the fingerprint.
 *
 * Pure and side-effect free so the same input always produces the same grid,
 * and so a test can pin the picture without a window.
 */

/** OpenSSH's 17×9 field. */
const WIDTH = 17;
const HEIGHT = 9;

/** Characters by visit count, matching OpenSSH's `augmentation_string`. */
const AUGMENTATION = ' .o+=*BOX@%&#/^SE';

/**
 * Decode the payload of a fingerprint string into raw bytes.
 *
 * Accepts `SHA256:<base64>` (what Runic shows today) and a bare hex string.
 * Returns `null` when the string is not a fingerprint we can walk — the UI
 * then simply omits the randomart rather than drawing noise.
 */
export function fingerprintBytes(fingerprint: string): Uint8Array | null {
  const trimmed = fingerprint.trim();

  const sha256 = trimmed.match(/^SHA256:([A-Za-z0-9+/=]+)$/i);
  if (sha256 !== null) {
    try {
      const binary = atob(sha256[1] ?? '');
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.length > 0 ? bytes : null;
    } catch {
      return null;
    }
  }

  const hex = trimmed.replace(/^MD5:/i, '').replace(/:/g, '');
  if (/^[0-9a-f]+$/i.test(hex) && hex.length % 2 === 0 && hex.length >= 16) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }

  return null;
}

/**
 * Walk the Drunken Bishop over `bytes` and return the ASCII art lines,
 * including the top/bottom borders OpenSSH prints.
 *
 * `null` when the fingerprint cannot be decoded — callers should hide the
 * art rather than invent a picture.
 */
export function randomart(fingerprint: string, keyType?: string): string[] | null {
  const bytes = fingerprintBytes(fingerprint);
  if (bytes === null) return null;

  const field = new Array<number>(WIDTH * HEIGHT).fill(0);
  let x = Math.floor(WIDTH / 2);
  let y = Math.floor(HEIGHT / 2);

  for (const byte of bytes) {
    for (let shift = 0; shift < 8; shift += 2) {
      const bits = (byte >> shift) & 0b11;
      const dx = (bits & 0b01) === 0 ? -1 : 1;
      const dy = (bits & 0b10) === 0 ? -1 : 1;
      x = Math.max(0, Math.min(WIDTH - 1, x + dx));
      y = Math.max(0, Math.min(HEIGHT - 1, y + dy));
      field[y * WIDTH + x] = (field[y * WIDTH + x] ?? 0) + 1;
    }
  }

  const startX = Math.floor(WIDTH / 2);
  const startY = Math.floor(HEIGHT / 2);
  const start = startY * WIDTH + startX;
  const end = y * WIDTH + x;

  const label = (keyType ?? 'ED25519').slice(0, 7);
  const topPad = Math.max(0, WIDTH - 2 - label.length);
  const topLeft = Math.floor(topPad / 2);
  const topRight = topPad - topLeft;
  const top = `+${'-'.repeat(topLeft)}[${label}]${'-'.repeat(topRight)}+`;
  const bottom = `+${'-'.repeat(WIDTH)}+`;

  const rows: string[] = [top];
  for (let row = 0; row < HEIGHT; row += 1) {
    let line = '|';
    for (let col = 0; col < WIDTH; col += 1) {
      const at = row * WIDTH + col;
      if (at === start) {
        line += 'S';
      } else if (at === end) {
        line += 'E';
      } else {
        const visits = field[at] ?? 0;
        const index = Math.min(visits, AUGMENTATION.length - 1);
        line += AUGMENTATION[index] ?? ' ';
      }
    }
    line += '|';
    rows.push(line);
  }
  rows.push(bottom);
  return rows;
}
