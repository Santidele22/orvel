import { describe, expect, it, vi } from 'vitest';

import { appendWaitlistToSheet, fetchWaitlistOccupied } from '../lib/waitlist-sheet';

const ENTRY = {
  name: 'Ana García',
  email: 'ana@example.com',
  whatsapp: '11 2345 6789',
  normalizedWhatsapp: '+541123456789',
  rubro: 'peluqueria' as const,
  createdAt: '2026-08-20T12:00:00.000Z'
};

const CONFIG = {
  webhookUrl: 'https://script.google.com/macros/s/example/exec',
  secret: 'test-secret'
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('Contract: appendWaitlistToSheet', () => {
  it('returns persistence_unavailable and skips fetch when url or secret is missing', async () => {
    const fetchImpl = vi.fn();

    await expect(
      appendWaitlistToSheet(ENTRY, { webhookUrl: '', secret: CONFIG.secret }, fetchImpl)
    ).resolves.toEqual({ ok: false, reason: 'persistence_unavailable' });

    await expect(
      appendWaitlistToSheet(ENTRY, { webhookUrl: CONFIG.webhookUrl, secret: '   ' }, fetchImpl)
    ).resolves.toEqual({ ok: false, reason: 'persistence_unavailable' });

    await expect(
      appendWaitlistToSheet(ENTRY, { webhookUrl: undefined, secret: undefined }, fetchImpl)
    ).resolves.toEqual({ ok: false, reason: 'persistence_unavailable' });

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('POSTs JSON with secret and waitlist fields to the webhook', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: 'ok' }));

    await appendWaitlistToSheet(ENTRY, CONFIG, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(CONFIG.webhookUrl);
    expect(init.method).toBe('POST');
    expect(String(init.headers && (init.headers as Record<string, string>)['Content-Type'])).toMatch(
      /application\/json/i
    );
    expect(JSON.parse(String(init.body))).toEqual({
      secret: CONFIG.secret,
      name: ENTRY.name,
      email: ENTRY.email,
      whatsapp: ENTRY.whatsapp,
      normalizedWhatsapp: ENTRY.normalizedWhatsapp,
      rubro: ENTRY.rubro,
      createdAt: ENTRY.createdAt
    });
  });

  it('maps { status: "ok", position } to the exact founder offer', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: 'ok', position: 3 }));

    await expect(appendWaitlistToSheet(ENTRY, CONFIG, fetchImpl)).resolves.toEqual({
      ok: true,
      offer: {
        position: 3,
        inBenefit: true,
        discountPercent: 50,
        discountLabel: '50%'
      }
    });
  });

  it('maps { status: "ok" } to success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: 'ok' }));

    await expect(appendWaitlistToSheet(ENTRY, CONFIG, fetchImpl)).resolves.toEqual({
      ok: true,
      offer: null
    });
  });

  it('maps { status: "duplicate" } to already_exists', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: 'duplicate' }));

    await expect(appendWaitlistToSheet(ENTRY, CONFIG, fetchImpl)).resolves.toEqual({
      ok: false,
      reason: 'already_exists',
      offer: null
    });
  });

  it('maps network throw, HTTP 500, and invalid bodies to persistence_unavailable', async () => {
    const throwingFetch = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(appendWaitlistToSheet(ENTRY, CONFIG, throwingFetch)).resolves.toEqual({
      ok: false,
      reason: 'persistence_unavailable'
    });

    const serverErrorFetch = vi.fn().mockResolvedValue(jsonResponse({ status: 'ok' }, 500));
    await expect(appendWaitlistToSheet(ENTRY, CONFIG, serverErrorFetch)).resolves.toEqual({
      ok: false,
      reason: 'persistence_unavailable'
    });

    const invalidJsonFetch = vi.fn().mockResolvedValue(
      new Response('<html>nope</html>', { status: 200, headers: { 'Content-Type': 'text/html' } })
    );
    await expect(appendWaitlistToSheet(ENTRY, CONFIG, invalidJsonFetch)).resolves.toEqual({
      ok: false,
      reason: 'persistence_unavailable'
    });

    const unknownStatusFetch = vi.fn().mockResolvedValue(jsonResponse({ status: 'weird' }));
    await expect(appendWaitlistToSheet(ENTRY, CONFIG, unknownStatusFetch)).resolves.toEqual({
      ok: false,
      reason: 'persistence_unavailable'
    });
  });

  it('reads occupied via POST action occupied', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ occupied: 1 }));

    await expect(fetchWaitlistOccupied(CONFIG, fetchImpl)).resolves.toBe(1);

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ secret: CONFIG.secret, action: 'occupied' });
  });
});
