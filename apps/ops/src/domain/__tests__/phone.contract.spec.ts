import { describe, expect, it } from 'vitest';
import { normalizePhoneForWhatsApp } from '../phone';

describe('normalizePhoneForWhatsApp', () => {
  it('keeps an already international mobile number', () => {
    expect(normalizePhoneForWhatsApp('+54 9 294 412-3390')).toBe('5492944123390');
  });

  it('strips trunk 0 and mobile 15 after the area code', () => {
    expect(normalizePhoneForWhatsApp('0294 15 412-3390')).toBe('5492944123390');
  });

  it('prefixes 549 when only the national subscriber is present', () => {
    expect(normalizePhoneForWhatsApp('294 412-3390')).toBe('5492944123390');
  });

  it('is idempotent for a wa.me-ready value', () => {
    expect(normalizePhoneForWhatsApp('5492944123390')).toBe('5492944123390');
  });

  it('normalizes Buenos Aires 011 15 numbers', () => {
    expect(normalizePhoneForWhatsApp('011 15 1234-5678')).toBe('5491112345678');
  });

  it('returns null for empty or too-short input', () => {
    expect(normalizePhoneForWhatsApp('')).toBeNull();
    expect(normalizePhoneForWhatsApp('123')).toBeNull();
  });
});
