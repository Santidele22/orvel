import { describe, expect, it } from 'vitest';
import { mapPendingPremiumRequest } from './map-pending-premium-request';

describe('mapPendingPremiumRequest', () => {
  it('maps the five queue fields from an RPC row', () => {
    expect(
      mapPendingPremiumRequest({
        request_id: 'req-1',
        who: 'Salon Norte',
        what_they_asked: 'PREMIUM',
        status: 'pending',
        requested_at: '2026-08-29T12:00:00.000Z',
        account_exists: true,
      }),
    ).toEqual({
      id: 'req-1',
      who: 'Salon Norte',
      whatTheyAsked: 'PREMIUM',
      status: 'pending',
      when: '2026-08-29T12:00:00.000Z',
      accountExists: true,
    });
  });

  it('uses Alta pendiente when the business name is missing and never surfaces ciphertext', () => {
    const mapped = mapPendingPremiumRequest({
      request_id: 'req-2',
      who: '  ',
      what_they_asked: 'PREMIUM',
      status: 'pending',
      requested_at: '2026-08-29T13:00:00.000Z',
      account_exists: false,
      email_encrypted: 'cipher-blob',
      phone_hmac: 'hmac-blob',
    });

    expect(mapped.who).toBe('Alta pendiente');
    expect(mapped.accountExists).toBe(false);
    expect(JSON.stringify(mapped)).not.toContain('cipher-blob');
    expect(JSON.stringify(mapped)).not.toContain('hmac-blob');
  });
});
