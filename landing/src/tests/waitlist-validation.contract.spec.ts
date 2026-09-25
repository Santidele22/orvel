import { describe, expect, it } from 'vitest';

import { WAITLIST_RUBROS, validateWaitlist } from '../lib/waitlist';

const VALID_WAITLIST = {
  name: 'Ana García',
  email: 'ana@example.com',
  whatsapp: '11 2345 6789',
  rubro: 'peluqueria'
};

describe('Contract: waitlist zod validation', () => {
  it('accepts a complete payload with AR WhatsApp and a known rubro', () => {
    const result = validateWaitlist(VALID_WAITLIST);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toMatchObject({
      name: 'Ana García',
      email: 'ana@example.com',
      rubro: 'peluqueria',
      normalizedWhatsapp: '+541123456789'
    });
  });

  it('exposes the waitlist rubro enum', () => {
    expect([...WAITLIST_RUBROS]).toEqual(['barberia', 'unas', 'peluqueria', 'masajes', 'otro']);
  });

  it('rejects missing name, invalid email, invalid AR WhatsApp, and unknown rubro', () => {
    const result = validateWaitlist({
      name: '',
      email: 'not-an-email',
      whatsapp: '123',
      rubro: 'spa'
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.fieldErrors).toMatchObject({
      name: expect.any(String),
      email: expect.any(String),
      whatsapp: expect.any(String),
      rubro: expect.any(String)
    });
  });

  it('rejects a WhatsApp that is not a recognized Argentina number', () => {
    const result = validateWaitlist({
      ...VALID_WAITLIST,
      whatsapp: '+1 415 555 2671'
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.fieldErrors.whatsapp).toBeTruthy();
  });
});
