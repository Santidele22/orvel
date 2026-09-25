import { beforeEach, describe, expect, it, vi } from 'vitest';

const signup = vi.fn();
const createSupabaseSignupAdapter = vi.fn(() => signup);
const unprotectPendingSignupPii = vi.fn(async () => ({
  first_name: 'Ada',
  last_name: 'Lovelace',
  business_name: 'Ada Studio',
  phone: '+5491100000000',
  email: 'ada@example.test',
}));

vi.mock('../lib/supabase-auth-adapter', () => ({
  createSupabaseSignupAdapter,
}));

vi.mock('../lib/server/pending-signup-pii-protection', () => ({
  unprotectPendingSignupPii,
}));

const { POST } = await import('../pages/api/signup/pending-intent/finalize');

function requestWithBody(body: unknown): Request {
  return new Request('https://orvel.test/api/signup/pending-intent/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function postFinalize(body: unknown): Promise<Response> {
  return POST({ request: requestWithBody(body) } as Parameters<typeof POST>[0]);
}

function validBody(planCode: string): Record<string, unknown> {
  return {
    pending_signup_intent: { protected_pending_signup_intent: true },
    password: 'correct-horse-battery-staple',
    business_type: 'peluqueria',
    plan_code: planCode,
    return_to: '/auth/login',
  };
}

describe('pending signup finalize plan boundary', () => {
  beforeEach(() => {
    signup.mockReset();
    signup.mockResolvedValue({ ok: true, user: { email: 'ada@example.test' } });
    createSupabaseSignupAdapter.mockClear();
    unprotectPendingSignupPii.mockClear();
  });

  it.each(['STARTED', 'STARTER', 'GROWTH', 'PRO', 'BASIC', 'MEDIUM'])(
    'rejects non-FREE plan_code %s before Supabase signup',
    async (planCode) => {
      const response = await postFinalize(validBody(planCode));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body).toEqual({ ok: false, error: 'pending_signup_finalize_free_plan_only' });
      expect(createSupabaseSignupAdapter).not.toHaveBeenCalled();
      expect(signup).not.toHaveBeenCalled();
      expect(unprotectPendingSignupPii).not.toHaveBeenCalled();
    },
  );

  it('uses server-owned FREE plan when finalizing a FREE pending signup intent', async () => {
    const response = await postFinalize(validBody('free'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, email: 'ada@example.test' });
    expect(createSupabaseSignupAdapter).toHaveBeenCalledTimes(1);
    expect(signup).toHaveBeenCalledWith(expect.objectContaining({ plan: 'FREE' }));
  });
});
