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
const createClientMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
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
    createClientMock.mockReset();
    createClientMock.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    });
    vi.stubEnv('SUPABASE_URL', 'https://supabase.example.test');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
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
    const adminClient = createClientMock.mock.results[0]?.value as { rpc: ReturnType<typeof vi.fn> };
    expect(adminClient.rpc).toHaveBeenCalledWith('guard_signup_request_rate_limit', expect.objectContaining({
      p_bucket_hash: expect.any(String),
      p_email_hmac: expect.any(String),
      p_max_requests: 5,
    }));
  });

  it('returns 503 signup_confirmation_retry without signing up when the rate guard RPC errors', async () => {
    createClientMock.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'schema cache lookup failed' } }),
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const response = await postFinalize(validBody('FREE'));
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body).toEqual({ ok: false, error: 'signup_confirmation_retry' });
      expect(JSON.stringify(body)).not.toContain('PGRST202');
      expect(signup).not.toHaveBeenCalled();
      expect(createSupabaseSignupAdapter).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('returns the generic success body without signing up when the rate guard reports limited', async () => {
    createClientMock.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    });

    const response = await postFinalize(validBody('FREE'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, email: 'ada@example.test' });
    expect(signup).not.toHaveBeenCalled();
    expect(createSupabaseSignupAdapter).not.toHaveBeenCalled();
  });

  it('returns 403 forbidden_origin without signing up for a disallowed Origin', async () => {
    const request = new Request('https://orvel.test/api/signup/pending-intent/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify(validBody('FREE')),
    });

    const response = await POST({ request } as Parameters<typeof POST>[0]);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ ok: false, error: 'forbidden_origin' });
    expect(createClientMock).not.toHaveBeenCalled();
    expect(signup).not.toHaveBeenCalled();
  });
});
