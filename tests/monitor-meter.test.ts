import { describe, expect, it } from 'vitest';

import { meterTone } from '../src/features/monitor';

describe('grading a meter by how full it is', () => {
  it('calls anything under 70% ok', () => {
    expect(meterTone(0)).toBe('ok');
    expect(meterTone(69)).toBe('ok');
  });

  it('calls 70 up to 90 a warning', () => {
    expect(meterTone(70)).toBe('warn');
    expect(meterTone(89)).toBe('warn');
  });

  it('calls 90 and up danger', () => {
    expect(meterTone(90)).toBe('danger');
    expect(meterTone(100)).toBe('danger');
  });
});
