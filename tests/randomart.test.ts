/**
 * Holds our randomart to what `ssh-keygen -lv` actually draws.
 *
 * The distinction matters more than it looks. A test that pins the output of
 * the implementation proves it does not regress; it cannot tell a correct
 * picture from a confidently wrong one. This picture's whole value is that it
 * is the same picture OpenSSH shows, because the way it gets used is somebody
 * comparing what is on their screen against what `ssh-keygen -lv` printed
 * somewhere they already trust. A difference we introduced would make two
 * people disagree for no reason, on the screen where being wrong is worst.
 *
 * So the art below is not written by hand and did not come out of this
 * codebase. Every line was captured from OpenSSH on 2026-08-25:
 *
 *   ssh-keygen -q -t ed25519 -N "" -C "" -f k && ssh-keygen -lv -f k.pub
 *
 * Regenerating them means running that again, never running the tests and
 * writing down what they printed. Same failure in kind as #129, and the same
 * answer: check against the implementation everybody else is using.
 *
 * Two of the twelve were searched for rather than taken as they came, because
 * the ordinary key exercises neither edge. One is a walk that ends on the
 * square it started, seventy-nine keys in. The other is a square that would be
 * crowded past the ceiling, eight keys in, and it was added only after a
 * mutation showed the first attempt at that fixture did not catch the bug it
 * was there for: it reached the ceiling and never tried to pass it.
 *
 * Checking this way found four differences in the version proposed on
 * `feat/visual-improvements`, and each has a test below naming it.
 */

import { describe, expect, it } from 'vitest';

import { decodeFingerprint, randomart } from '../src/lib/randomart';

/** Captured from `ssh-keygen -lv`. Read the note above before editing. */
const OPENSSH: readonly {
  readonly keyType: string;
  readonly fingerprint: string;
  readonly art: readonly string[];
}[] = [
  {
    keyType: 'ssh-ed25519',
    fingerprint: 'SHA256:xytAvhY0kpgPbXv3Nbv6lXhSt8QDzbFJ8Pazz9mEtLw',
    art: [
      '+--[ED25519 256]--+',
      '|             ..o |',
      '|   + .        = +|',
      '|  + = +      . B |',
      '|   + * . .    + .|',
      '|    o = S o o o=o|',
      '|     . = o o B.==|',
      '|      o . o + Bo.|',
      '|     .   .   = ++|',
      '|          .oo E.+|',
      '+----[SHA256]-----+',
    ],
  },
  {
    keyType: 'ssh-ed25519',
    fingerprint: 'SHA256:d1OzWd0Z60uFLozHrL2v3RU61b8h5LLAHE3Ux+S2xo0',
    art: [
      '+--[ED25519 256]--+',
      '|           .. oo |',
      '|          .  ..+*|',
      '|           .  ===|',
      '|          o= o+*=|',
      '|        S.o.O.EOo|',
      '|        o..=oo= +|',
      '|         +...= oo|',
      '|          . ooo.+|',
      '|           .ooo..|',
      '+----[SHA256]-----+',
    ],
  },
  {
    keyType: 'ssh-ed25519',
    fingerprint: 'SHA256:ihCDTmOGgvKunBco39oFBe5GtzDW8dFnslqblu7C+O8',
    art: [
      '+--[ED25519 256]--+',
      '|    . . ..       |',
      '|o. . o o .o o    |',
      '|*=o * + .  =     |',
      '|B..* = .  o      |',
      '| .+ + . So +     |',
      '|.o + o .. =      |',
      '|....o oo o       |',
      '|..oo... o .      |',
      '|.oo..  ..=E      |',
      '+----[SHA256]-----+',
    ],
  },
  {
    keyType: 'ssh-ed25519',
    fingerprint: 'SHA256:QQ9N6s7mk2ifCvtDhmrwwccHEOEr+xuyyPhGYTJVlU0',
    art: [
      '+--[ED25519 256]--+',
      '|  o+...+Eo.      |',
      '| .o   ...+.      |',
      '| ...    o .      |',
      '|o o..  . .       |',
      '|.=.o o  S        |',
      '|.o+ + +o         |',
      '|o+.+.+ .+.       |',
      '|++=. o+oo.       |',
      '|+=+..oo++.       |',
      '+----[SHA256]-----+',
    ],
  },
  {
    keyType: 'ssh-ed25519',
    fingerprint: 'SHA256:V5BajV1oQMI5rvW3TWjcu3McG4vM9NRHrnUdpLV3ImU',
    art: [
      '+--[ED25519 256]--+',
      '|       ..o+* o.  |',
      '|        +.+.= Eo |',
      '|       . + ..o+ .|',
      '|        +  ....o+|',
      '|       oS... + +*|',
      '|      .  .. =.o+B|',
      '|           o+++=B|',
      '|            .+=+o|',
      '|              .+ |',
      '+----[SHA256]-----+',
    ],
  },
  {
    keyType: 'ssh-ed25519',
    fingerprint: 'SHA256:u59y7Jj7jKZ/c9ZFuAwDYdNIGUsdN5eKcROdvYJU+GQ',
    art: [
      '+--[ED25519 256]--+',
      '|         .BB++= =|',
      '|         o+*oE *.|',
      '|          o.O o..|',
      '|           oo+...|',
      '|        S    +.o |',
      '|         .    o .|',
      '|        ..   . . |',
      '|        o*=.o .  |',
      '|      .+BO*+     |',
      '+----[SHA256]-----+',
    ],
  },
  {
    keyType: 'ssh-ed25519',
    fingerprint: 'SHA256:9vTjAlpNymzpqy7h2CKny7485CWrDsHNyXTWAf3IZQw',
    art: [
      '+--[ED25519 256]--+',
      '|     .oEo        |',
      '|      ...+       |',
      '|   . o..=        |',
      '|. = +  o ..      |',
      '|.. =   oS=.      |',
      '| + ..  .Oo..     |',
      '|+ ++ . = .. o    |',
      '|=++ + . . .. .   |',
      '|B@o. oo... ..    |',
      '+----[SHA256]-----+',
    ],
  },
  {
    keyType: 'ssh-ed25519',
    fingerprint: 'SHA256:OvrHKdjpNXjMFaCtmXtQrKFK4q/AVKdK66zWcEjFXWY',
    art: [
      '+--[ED25519 256]--+',
      '|  . . .E.        |',
      '|   o .o+ .       |',
      '|  .. .o + .      |',
      '| .. o. B   .     |',
      '|ooo.. * S .      |',
      '|==oo   B .       |',
      '|.==  o=oB.       |',
      '|+.....+=+.       |',
      '|++...ooo         |',
      '+----[SHA256]-----+',
    ],
  },
    /* the walk ends on the square it started. */
  {
    keyType: 'ssh-ed25519',
    fingerprint: 'SHA256:7fHzUXLqk8RcNh7IvAtfUy1LbdAopfmIx3BSIFGyvGk',
    art: [
      '+--[ED25519 256]--+',
      '|        +oo....o |',
      '|       . + ..oo .|',
      '|        o o *..o.|',
      '|         + * *ooB|',
      '|        E + ++=**|',
      '|       . . = .=O |',
      '|          . =.=..|',
      '|             *o. |',
      '|              o. |',
      '+----[SHA256]-----+',
    ],
  },
    /* a square would be visited past the ceiling: the bottom right corner is
       the character below the marker reserve, and one more visit turns it into
       a stray E while the real one sits mid field. Eight keys to find. */
  {
    keyType: 'ssh-ed25519',
    fingerprint: 'SHA256:Fej+P+YExOk5i+V89JziC+z/Rv7dz/+Edf5f/o6bC8k',
    art: [
      '+--[ED25519 256]--+',
      '|         ..      |',
      '|        .. o     |',
      '|       .  =      |',
      '|        .+ .     |',
      '|       .S * .   o|',
      '|        .* * +.=.|',
      '|        ..* Eo= +|',
      '|         ..=ooo*=|',
      '|          .=*=*=^|',
      '+----[SHA256]-----+',
    ],
  },
  {
    keyType: 'ecdsa-sha2-nistp384',
    fingerprint: 'SHA256:3XSj4gfRGokGuuFYsuUwZ2qIOptGf7p+d/JAl9leP8k',
    art: [
      '+---[ECDSA 384]---+',
      '|      .          |',
      '|     . . . o     |',
      '|  + B   o + o o  |',
      '|.. # o . .+* o . |',
      '|o = +  .S+=.o.   |',
      '|.o    . ...o. o .|',
      '|+ .    .  ...  E |',
      '| = . o o.. .    .|',
      '|+ .+= . +.       |',
      '+----[SHA256]-----+',
    ],
  },
    /* ssh-keygen captions this [RSA 2048]; we have no key size. */
  {
    keyType: 'rsa-sha2-512',
    fingerprint: 'SHA256:bL6TnzYcF+vMosjzM8WNfJm+7Yq7JXo1cd9e4OqfcU8',
    art: [
      '+---[RSA 2048]----+',
      '|                 |',
      '|                 |',
      '|                 |',
      '|       .    o o  |',
      '|        So o O o.|',
      '|       o  * X . +|',
      '|        .+.X.o..E|',
      '|     ...=o*=*. =o|',
      '|      oo=O**+== .|',
      '+----[SHA256]-----+',
    ],
  },
];

/** Everything but the top border: the nine rows and the hash label. */
function picture(art: readonly string[]): readonly string[] {
  return art.slice(1);
}

describe('the picture OpenSSH draws', () => {
  it.each(OPENSSH.map((entry, at) => [at, entry] as const))(
    'draws key %i square for square as ssh-keygen does',
    (_at, entry) => {
      const drawn = randomart(entry.fingerprint, entry.keyType);

      expect(drawn).not.toBeNull();
      expect(picture(drawn ?? [])).toEqual(picture(entry.art));
    },
  );

  it.each(
    OPENSSH.filter((entry) => !entry.keyType.startsWith('rsa-')).map(
      (entry, at) => [at, entry] as const,
    ),
  )('captions key %i as ssh-keygen does', (_at, entry) => {
    /* Every type but RSA, whose caption carries a key size the interface is
       never given. The row below says what that costs. */
    expect(randomart(entry.fingerprint, entry.keyType)?.[0]).toBe(entry.art[0]);
  });

  it('exercises both edges, not twelve ordinary keys', () => {
    const bodies = OPENSSH.map((entry) => entry.art.slice(1, -1).join(''));

    /* A walk that finished where it began: OpenSSH draws E over S, so there is
       no S at all. */
    expect(bodies.some((body) => !body.includes('S'))).toBe(true);
    /* A square crowded to the character below the marker reserve. */
    expect(bodies.some((body) => body.includes('^'))).toBe(true);
    expect(new Set(OPENSSH.map((entry) => entry.keyType)).size).toBe(3);
  });
});

describe('what checking against ssh-keygen found', () => {
  /* Four differences, every one of which passed the test that pinned the
     implementation's own output. They are listed separately because a green
     fixture says nothing about which of them it caught. */

  it('names the hash on the bottom border', () => {
    /* It used to be a row of dashes. That border is where OpenSSH says which
       fingerprint the walk came from, and the same key draws two different
       pictures under SHA256 and MD5. A border that does not say which is a
       picture nobody can compare. */
    expect(randomart(OPENSSH[0]?.fingerprint ?? '', 'ssh-ed25519')?.at(-1)).toBe(
      '+----[SHA256]-----+',
    );
  });

  it('draws E, not S, where the walk ends on the square it started', () => {
    /* OpenSSH writes the start marker and then the end marker over it. The
       precedence the other way round changes one character on one square,
       which is the kind of difference nobody can explain with two screens
       side by side. Fixture nine is a key that does it. */
    const both = OPENSSH[8];
    const body = (randomart(both?.fingerprint ?? '', both?.keyType) ?? [])
      .slice(1, -1)
      .join('');

    expect(body).not.toContain('S');
    expect(body).toContain('E');
  });

  it('never augments a square into a marker', () => {
    /* Visits stop two short of the end of the augmentation string, because the
       last two characters are the start and the end. Counting all the way up
       prints a stray S or E on a square the bishop merely crossed often.
       Fixture ten reaches the character below that ceiling, so this is one
       visit away rather than theoretical. */
    for (const entry of OPENSSH) {
      const body = (randomart(entry.fingerprint, entry.keyType) ?? []).slice(1, -1).join('');
      const count = (glyph: string): number => [...body].filter((one) => one === glyph).length;

      expect(count('S')).toBeLessThanOrEqual(1);
      expect(count('E')).toBe(1);
    }
  });

  it('does not truncate the caption to seven characters', () => {
    /* `[ECDSA 2]` and `[RSA 307]` were what the slice produced. Nonsense, on
       the screen that asks somebody to be careful. */
    expect(randomart(OPENSSH[10]?.fingerprint ?? '', 'ecdsa-sha2-nistp384')?.[0]).toBe(
      '+---[ECDSA 384]---+',
    );
  });
});

describe('what it does with a caption it cannot complete', () => {
  it('leaves the size off RSA rather than inventing one', () => {
    /* `ssh-keygen` writes `[RSA 2048]`. The core hands the interface an
       algorithm name and no key size, so the size is derived where the
       algorithm fixes it and left off where it does not. The nine rows, which
       are the part anybody compares, are identical either way, and the test
       above asserts that for this same key. */
    const rsa = OPENSSH.at(-1);

    expect(randomart(rsa?.fingerprint ?? '', rsa?.keyType)?.[0]).toBe('+------[RSA]------+');
    expect(rsa?.art[0]).toBe('+---[RSA 2048]----+');
  });

  it('captions an algorithm it has never heard of with what the host said', () => {
    expect(randomart(OPENSSH[0]?.fingerprint ?? '', 'ssh-newthing-2040')?.[0]).toContain(
      'SSH-NEWTHING-2040',
    );
  });

  it('draws nothing at all rather than a picture of noise', () => {
    /* Bytes that are not a fingerprint walk into something that looks exactly
       as much like randomart as the real thing does. */
    expect(randomart('not a fingerprint')).toBeNull();
    expect(randomart('SHA256:')).toBeNull();
    expect(randomart('')).toBeNull();
    expect(decodeFingerprint('abcd')).toBeNull();
  });

  it('reads the hex and MD5 forms too, and says which hashed them', () => {
    const md5 = decodeFingerprint('MD5:d4:1d:8c:d9:8f:00:b2:04:e9:80:09:98:ec:f8:42:7e');

    expect(md5?.hash).toBe('MD5');
    expect(md5?.bytes.length).toBe(16);
    expect(decodeFingerprint(OPENSSH[0]?.fingerprint ?? '')?.hash).toBe('SHA256');
  });
});
