import { describe, expect, it } from 'vitest';
import { isValidArgentinaPhone } from './argentina-phone';

describe('isValidArgentinaPhone', () => {
  it('accepts CABA, interior, mobile 9, and legacy 15', () => {
    expect(isValidArgentinaPhone('+5491112345678')).toBe(true);
    expect(isValidArgentinaPhone('+54 11 5555-0000')).toBe(true);
    expect(isValidArgentinaPhone('011 15 1234 5678')).toBe(true);
    expect(isValidArgentinaPhone('+54 351 123 4567')).toBe(true);
    expect(isValidArgentinaPhone('+54294667788')).toBe(true);
    expect(isValidArgentinaPhone('0294 15 667788')).toBe(true);
  });

  it('rejects non-Argentina and too-short values', () => {
    expect(isValidArgentinaPhone('+1 415 555 2671')).toBe(false);
    expect(isValidArgentinaPhone('+57 300 123 4567')).toBe(false);
    expect(isValidArgentinaPhone('+54 11 123')).toBe(false);
    expect(isValidArgentinaPhone('+54 0 11 1234 5678')).toBe(false);
    expect(isValidArgentinaPhone('abc123')).toBe(false);
  });
});
