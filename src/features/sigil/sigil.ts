/**
 * A host's sigil: a stem and four levels of branches, derived from its saved
 * id (the Gravura proposal).
 *
 * Pure and deterministic, so the same host always draws the same mark and a
 * test can say so. It comes from the local id and never from the host key. It
 * carries a handful of bits, anyone can forge a similar one, and it must not
 * be read as verifying anything: the fingerprint in text stays the only thing
 * that does that. Straight strokes on a vertical stem, deliberately unlike the
 * key's randomart.
 */

export interface Stroke {
  /** An SVG path, in a 24 by 24 box. */
  readonly d: string;
  readonly side: 'stem' | 'left' | 'right';
}

export interface Level {
  readonly strokes: readonly Stroke[];
}

export interface Sigil {
  readonly stem: Stroke;
  /** Bottom to top. */
  readonly levels: readonly [Level, Level, Level, Level];
}

/** FNV-1a, 32 bits: small, stable, and no more than a mark needs. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

const BASE_Y = 19;
const LEVEL_STEP = 4;

export function sigilOf(id: string): Sigil {
  let bits = hash(id);
  const take = (): number => {
    const bit = bits & 1;
    bits = (bits >>> 1) | (bits << 31 >>> 0);
    return bit;
  };

  const levels = [0, 1, 2, 3].map((index): Level => {
    const y = BASE_Y - index * LEVEL_STEP;
    let left = take() === 1;
    const right = take() === 1;
    /* A level with no branch would read as a gap in the stem, so one is
       always drawn. */
    if (!left && !right) left = true;
    const reach = 3 + take();

    const strokes: Stroke[] = [];
    if (left) strokes.push({ d: `M12 ${y}l-${reach} -${reach}`, side: 'left' });
    if (right) strokes.push({ d: `M12 ${y}l${reach} -${reach}`, side: 'right' });
    return { strokes };
  });

  return {
    stem: { d: 'M12 21V3', side: 'stem' },
    levels: levels as unknown as Sigil['levels'],
  };
}
