import { describe, expect, it, vi } from 'vitest';

import { createFreeAccountBusiness } from '../../features/auth/create-account-business.client';
import type { CreateAccountBusinessPayload } from '../../features/auth/in-app-signup-wizard';

const GENERIC_MESSAGE = 'No pudimos crear la cuenta. Reintentá en unos segundos.';

const payload: CreateAccountBusinessPayload = {
  email: 'ada@example.test',
  password: 'correct-horse-battery-staple',
  nombre: 'Ada',
  apellido: 'Lovelace',
  negocioNombre: 'Ada Studio',
  rubro: 'peluqueria',
  selected_business_types: ['peluqueria'],
  plan: 'FREE'
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('createFreeAccountBusiness', () => {
  it('treats 200 + signup_ready as success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, status: 'signup_ready' }));

    const result = await createFreeAccountBusiness(payload, fetchImpl);

    expect(result.ok).toBe(true);
    expect(result.status).toBe('signup_ready');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('treats 202 + signup_confirmation_requested as failure, not success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(202, { ok: true, status: 'signup_confirmation_requested' })
    );

    const result = await createFreeAccountBusiness(payload, fetchImpl);

    expect(result.ok).toBe(false);
    expect(result.status).toBe('signup_confirmation_requested');
    expect(result.message).toBe(GENERIC_MESSAGE);
  });

  it('treats 200 with missing or wrong status as failure', async () => {
    const missing = await createFreeAccountBusiness(
      payload,
      vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }))
    );
    const wrong = await createFreeAccountBusiness(
      payload,
      vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, status: 'signup_confirmation_requested' }))
    );

    expect(missing.ok).toBe(false);
    expect(missing.message).toBe(GENERIC_MESSAGE);
    expect(wrong.ok).toBe(false);
    expect(wrong.message).toBe(GENERIC_MESSAGE);
  });

  it('treats 503 as failure and keeps the API message when present', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(503, {
        error: 'signup_confirmation_retry',
        message: 'No pudimos preparar la confirmación. Reintentá en unos segundos.'
      })
    );

    const result = await createFreeAccountBusiness(payload, fetchImpl);

    expect(result.ok).toBe(false);
    expect(result.message).toBe('No pudimos preparar la confirmación. Reintentá en unos segundos.');
  });
});
