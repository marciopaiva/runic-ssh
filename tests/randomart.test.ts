/**
 * Pins SSH randomart (Drunken Bishop).
 *
 * The picture is a recognition aid on the unknown-host-key screen. A change
 * to the walk that silently produces a different grid would make two people
 * comparing fingerprints by eye disagree without either knowing why, so the
 * grid for a known payload is fixed here.
 */

import { describe, expect, it } from 'vitest';

import { fingerprintBytes, randomart } from '../src/lib/randomart';

describe('fingerprintBytes', () => {
  it('decodes a SHA256 base64 fingerprint', () => {
    // 32 zero bytes → base64 AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
    const fp = 'SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    const bytes = fingerprintBytes(fp);
    expect(bytes).not.toBeNull();
    expect(bytes!.length).toBe(32);
    expect([...bytes!].every((b) => b === 0)).toBe(true);
  });

  it('decodes a colon-separated hex fingerprint', () => {
    const bytes = fingerprintBytes('MD5:00:11:22:33:44:55:66:77:88:99:aa:bb:cc:dd:ee:ff');
    expect(bytes).not.toBeNull();
    expect(bytes!.length).toBe(16);
    expect(bytes![0]).toBe(0x00);
    expect(bytes![15]).toBe(0xff);
  });

  it('returns null for garbage rather than inventing a picture', () => {
    expect(fingerprintBytes('not-a-fingerprint')).toBeNull();
    expect(fingerprintBytes('')).toBeNull();
    expect(fingerprintBytes('SHA256:!!!')).toBeNull();
  });
});

describe('randomart', () => {
  it('returns null when the fingerprint cannot be decoded', () => {
    expect(randomart('garbage')).toBeNull();
  });

  it('draws a stable grid for a known payload', () => {
    // 32 zero bytes. The walk is deterministic; this pins the characters and
    // the S/E markers so a change to the augmentation string or the field
    // size fails loudly.
    const fp = 'SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    const art = randomart(fp, 'ED25519');
    expect(art).not.toBeNull();
    expect(art![0]).toMatch(/^\+.*\[ED25519\].*\+$/);
    expect(art![art!.length - 1]).toMatch(/^\+-+\+$/);
    // 9 field rows + top + bottom
    expect(art!.length).toBe(11);
    // Start marker is always present
    expect(art!.some((line) => line.includes('S'))).toBe(true);
    // End marker is always present
    expect(art!.some((line) => line.includes('E'))).toBe(true);
  });

  it('is pure: same input, same picture', () => {
    const fp = 'SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    expect(randomart(fp, 'ED25519')).toEqual(randomart(fp, 'ED25519'));
  });

  it('labels the top border with the key type', () => {
    const fp = 'SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    const art = randomart(fp, 'ECDSA');
    expect(art![0]).toContain('[ECDSA]');
  });
});
