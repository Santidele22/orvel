import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

const GUARD_HELPER = new URL('../lib/server/public-endpoint-guard.ts', import.meta.url);
const WAITLIST_API = new URL('../pages/api/waitlist.ts', import.meta.url);
const PROTECT_API = new URL('../pages/api/signup/pending-intent/protect.ts', import.meta.url);
const FINALIZE_API = new URL('../pages/api/signup/pending-intent/finalize.ts', import.meta.url);

const createClientMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

const appendWaitlistToSheetMock = vi.fn();

vi.mock('../lib/waitlist-sheet', () => ({
  appendWaitlistToSheet: (...args: unknown[]) => appendWaitlistToSheetMock(...args),
}));

const createPendingSignupHandoffMock = vi.fn();

vi.mock('../lib/server/pending-signup-handoff', () => ({
  createPendingSignupHandoff: (...args: unknown[]) => createPendingSignupHandoffMock(...args),
}));

const { POST: postWaitlist } = await import('../pages/api/waitlist');
const { POST: postProtect } = await import('../pages/api/signup/pending-intent/protect');

function mockRateGuardRpc(result: { data: unknown; error: unknown }): ReturnType<typeof vi.fn> {
  const rpc = vi.fn().mockResolvedValue(result);
  createClientMock.mockReturnValue({ rpc });
  return rpc;
}

function waitlistBody(): Record<string, unknown> {
  return { name: 'Ada Lovelace', email: 'ada@example.test', whatsapp: '+54 9 11 1234-5678', rubro: 'peluqueria' };
}

function protectBody(): Record<string, unknown> {
  return {
    email: 'ada@example.test',
    first_name: 'Ada',
    last_name: 'Lovelace',
    business_name: 'Ada Studio',
    phone: '+5491100000000',
    business_type: 'peluqueria',
    plan_code: 'PREMIUM',
    billing_period: 'monthly',
  };
}

function apiRequest(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`https://orvel.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': crypto.randomUUID(), ...headers },
    body: JSON.stringify(body),
  });
}

async function postWaitlistEndpoint(body: unknown, headers?: Record<string, string>): Promise<Response> {
  return postWaitlist({ request: apiRequest('/api/waitlist', body, headers) } as Parameters<typeof postWaitlist>[0]);
}

async function postProtectEndpoint(body: unknown, headers?: Record<string, string>): Promise<Response> {
  return postProtect({ request: apiRequest('/api/signup/pending-intent/protect', body, headers) } as Parameters<typeof postProtect>[0]);
}

describe('Contract: shared public endpoint guard helper', () => {
  it('exposes IP extraction, origin check, and the service-role rate-limit RPC guard', async () => {
    const helper = await readFile(GUARD_HELPER, 'utf8');
    const rateGuardFunction = /async\s+function\s+isPublicEndpointRateLimited[\s\S]*?^}/m.exec(helper)?.[0] ?? '';

    expect(helper).toMatch(/export\s+function\s+getClientIp/);
    expect(helper).toMatch(/export\s+function\s+isDisallowedOrigin/);
    expect(helper).toMatch(/export\s+async\s+function\s+isPublicEndpointRateLimited/);
    expect(helper).toMatch(/export\s+const\s+ALLOWED_DASHBOARD_ORIGINS/);

    expect(helper.indexOf('cf-connecting-ip'), 'cf-connecting-ip must be the first IP source').toBeGreaterThan(-1);
    expect(helper.indexOf('cf-connecting-ip')).toBeLessThan(helper.indexOf('x-forwarded-for'));
    expect(helper.indexOf('x-forwarded-for')).toBeLessThan(helper.indexOf('client-ip'));

    expect(rateGuardFunction).toContain('guard_signup_request_rate_limit');
    expect(rateGuardFunction).toMatch(/p_max_requests:\s*RATE_LIMIT_MAX_REQUESTS/);
    expect(helper).toMatch(/RATE_LIMIT_MAX_REQUESTS\s*=\s*5/);
    expect(rateGuardFunction, 'RPC errors must throw instead of silently blocking').not.toMatch(/if\s*\(\s*error\s*\)\s*return\s+true/);
    expect(rateGuardFunction).toMatch(/data\s*===\s*true/);

    expect(helper).toContain('https://orvel.pro');
    expect(helper).toContain('https://dashboard.orvel.pro');
    // #1133 retired the pre-release environment: qa must not linger as an allowed origin.
    expect(helper).not.toContain('https://qa.orvel.pro');
  });

  it('waitlist, pending-intent protect, and pending-intent finalize all import the shared guard and run it before the effect', async () => {
    const waitlist = await readFile(WAITLIST_API, 'utf8');
    const protect = await readFile(PROTECT_API, 'utf8');
    const finalize = await readFile(FINALIZE_API, 'utf8');

    for (const source of [waitlist, protect, finalize]) {
      expect(source).toMatch(/from\s+['"][^'"]*public-endpoint-guard['"]/);
      expect(source).toContain('isDisallowedOrigin(request)');
      expect(source).toContain('isPublicEndpointRateLimited(');
    }

    expect(waitlist.indexOf('isDisallowedOrigin(request)')).toBeLessThan(waitlist.indexOf('isPublicEndpointRateLimited('));
    expect(waitlist.indexOf('isPublicEndpointRateLimited(')).toBeLessThan(waitlist.indexOf('appendWaitlistToSheet('));

    expect(protect.indexOf('isDisallowedOrigin(request)')).toBeLessThan(protect.indexOf('isPublicEndpointRateLimited('));
    expect(protect.indexOf('isPublicEndpointRateLimited(')).toBeLessThan(protect.indexOf('createPendingSignupHandoff('));

    expect(finalize.indexOf('isDisallowedOrigin(request)')).toBeLessThan(finalize.indexOf('isPublicEndpointRateLimited('));
    expect(finalize.indexOf('isPublicEndpointRateLimited(')).toBeLessThan(finalize.indexOf('createSupabaseSignupAdapter({'));
  });

  it('each endpoint maps guard outcomes to 403 / 503 retry / generic success without revealing the rate limit', async () => {
    const waitlist = await readFile(WAITLIST_API, 'utf8');
    const protect = await readFile(PROTECT_API, 'utf8');
    const finalize = await readFile(FINALIZE_API, 'utf8');

    for (const source of [waitlist, protect, finalize]) {
      expect(source).toMatch(/forbidden_origin[\s\S]{0,240}403|403[\s\S]{0,240}forbidden_origin/);
      expect(source).toMatch(/if\s*\(\s*rateLimited\s*\)\s*\{/);
      expect(source).not.toMatch(/rate_limited|too_many_requests/i);
    }

    expect(waitlist).toMatch(/waitlist_retry[\s\S]{0,300}503/);
    expect(protect).toMatch(/signup_confirmation_retry[\s\S]{0,300}503/);
    expect(finalize).toMatch(/signup_confirmation_retry[\s\S]{0,300}503/);

    expect(waitlist).toMatch(/if\s*\(\s*rateLimited\s*\)\s*\{[\s\S]{0,200}status:\s*['"]ok['"][\s\S]{0,80}200/);
    expect(protect).toMatch(/if\s*\(\s*rateLimited\s*\)\s*\{[\s\S]{0,200}PUBLIC_SIGNUP_CONFIRMATION_REQUESTED,\s*202/);
    expect(finalize).toMatch(/if\s*\(\s*rateLimited\s*\)\s*\{[\s\S]{0,200}ok:\s*true,[\s\S]{0,40}pii\.email[\s\S]{0,40}200/);
  });
});

describe('Contract: /api/waitlist public guard runtime', () => {
  beforeEach(() => {
    createClientMock.mockReset();
    appendWaitlistToSheetMock.mockReset();
    appendWaitlistToSheetMock.mockResolvedValue({ ok: true, offer: null });
    vi.stubEnv('SUPABASE_URL', 'https://supabase.example.test');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
  });

  it('persists to the sheet after the guard reports not limited', async () => {
    const rpc = mockRateGuardRpc({ data: false, error: null });

    const response = await postWaitlistEndpoint(waitlistBody());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: 'ok', offer: null });
    expect(rpc).toHaveBeenCalledWith('guard_signup_request_rate_limit', expect.objectContaining({
      p_bucket_hash: expect.any(String),
      p_email_hmac: expect.any(String),
      p_max_requests: 5,
    }));
    expect(appendWaitlistToSheetMock).toHaveBeenCalledWith(expect.objectContaining({ email: 'ada@example.test' }), expect.anything());
  });

  it('returns 503 waitlist_retry without calling the sheet when the guard RPC errors', async () => {
    const rpc = mockRateGuardRpc({ data: null, error: { code: 'PGRST202', message: 'schema cache lookup failed' } });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const response = await postWaitlistEndpoint(waitlistBody());
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body).toEqual({ error: 'waitlist_retry', message: expect.any(String) });
      expect(JSON.stringify(body)).not.toContain('PGRST202');
      expect(appendWaitlistToSheetMock).not.toHaveBeenCalled();
      expect(rpc).toHaveBeenCalledWith('guard_signup_request_rate_limit', expect.anything());
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('returns a generic success body without calling the sheet when the guard reports limited', async () => {
    mockRateGuardRpc({ data: true, error: null });

    const response = await postWaitlistEndpoint(waitlistBody());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: 'ok', offer: null });
    expect(appendWaitlistToSheetMock).not.toHaveBeenCalled();
  });

  it('returns 403 forbidden_origin without calling the guard or the sheet for a disallowed Origin', async () => {
    const response = await postWaitlistEndpoint(waitlistBody(), { origin: 'https://evil.example' });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual(expect.objectContaining({ error: 'forbidden_origin' }));
    expect(createClientMock).not.toHaveBeenCalled();
    expect(appendWaitlistToSheetMock).not.toHaveBeenCalled();
  });

  it('still allows requests without an Origin header', async () => {
    mockRateGuardRpc({ data: false, error: null });

    const response = await postWaitlistEndpoint(waitlistBody());

    expect(response.status).toBe(200);
    expect(appendWaitlistToSheetMock).toHaveBeenCalled();
  });
});

describe('Contract: /api/signup/pending-intent/protect public guard runtime', () => {
  beforeEach(() => {
    createClientMock.mockReset();
    createPendingSignupHandoffMock.mockReset();
    createPendingSignupHandoffMock.mockResolvedValue({
      pendingSignupReference: 'psh_test',
      redirectUrl: '/billing/subscription',
      setCookie: 'orvel_paid_signup_handoff=psb_test',
    });
    vi.stubEnv('SUPABASE_URL', 'https://supabase.example.test');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
  });

  it('runs the handoff after the guard reports not limited', async () => {
    const rpc = mockRateGuardRpc({ data: false, error: null });

    const response = await postProtectEndpoint(protectBody());
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toEqual(expect.objectContaining({ ok: true, status: 'signup_confirmation_requested' }));
    expect(rpc).toHaveBeenCalledWith('guard_signup_request_rate_limit', expect.objectContaining({ p_max_requests: 5 }));
    expect(createPendingSignupHandoffMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ email: 'ada@example.test' }));
  });

  it('returns 503 signup_confirmation_retry without running the handoff when the guard RPC errors', async () => {
    const rpc = mockRateGuardRpc({ data: null, error: { code: 'PGRST202', message: 'schema cache lookup failed' } });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const response = await postProtectEndpoint(protectBody());
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body).toEqual({ error: 'signup_confirmation_retry', message: expect.any(String) });
      expect(JSON.stringify(body)).not.toContain('PGRST202');
      expect(createPendingSignupHandoffMock).not.toHaveBeenCalled();
      expect(rpc).toHaveBeenCalledWith('guard_signup_request_rate_limit', expect.anything());
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('returns the same accepted body without running the handoff when the guard reports limited', async () => {
    mockRateGuardRpc({ data: true, error: null });

    const response = await postProtectEndpoint(protectBody());
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toEqual(expect.objectContaining({ ok: true, status: 'signup_confirmation_requested' }));
    expect(createPendingSignupHandoffMock).not.toHaveBeenCalled();
  });

  it('returns 403 forbidden_origin without running the guard or the handoff for a disallowed Origin', async () => {
    const response = await postProtectEndpoint(protectBody(), { origin: 'https://evil.example' });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual(expect.objectContaining({ error: 'forbidden_origin' }));
    expect(createClientMock).not.toHaveBeenCalled();
    expect(createPendingSignupHandoffMock).not.toHaveBeenCalled();
  });
});
