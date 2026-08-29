import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

const createClientMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

const { POST } = await import('../pages/api/signup/create-account-business');

const CREATE_SUBSCRIPTION_AUTH_HELPER_PATH = new URL('../../../../supabase/functions/_shared/create-subscription-auth.ts', import.meta.url);

function validPayload(plan = 'FREE') {
  return {
    email: 'ada@example.test',
    password: 'correct-horse-battery-staple',
    nombre: 'Ada',
    apellido: 'Lovelace',
    negocioNombre: 'Ada Studio',
    rubro: 'peluqueria',
    telefono: '+5491100000000',
    plan,
  };
}

function requestWithBody(body: unknown): Request {
  return new Request('https://orvel.test/api/signup/create-account-business', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': crypto.randomUUID() },
    body: JSON.stringify(body),
  });
}

async function postCreateAccountBusiness(body: unknown): Promise<Response> {
  return POST({ request: requestWithBody(body) } as Parameters<typeof POST>[0]);
}

function createChain(result: { data: unknown; error: unknown } = { data: { id: 'row-1', business_id: 'biz-1' }, error: null }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.insert = vi.fn(self);
  chain.upsert = vi.fn(self);
  chain.update = vi.fn(self);
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.is = vi.fn(self);
  chain.gt = vi.fn(self);
  chain.limit = vi.fn(self);
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.single = vi.fn().mockResolvedValue(result);
  return chain;
}

function createFreeSignupSupabaseMock() {
  const authCreateUser = vi.fn().mockResolvedValue({ data: { user: { id: 'auth-user-123' } }, error: null });
  const updateUserById = vi.fn().mockResolvedValue({ data: { user: { id: 'auth-user-123' } }, error: null });
  const confirmationInsert = vi.fn().mockResolvedValue({ error: null });
  const confirmationOutboxInsert = vi.fn().mockResolvedValue({ error: null });
  const rpc = vi.fn(async (name: string) => {
    if (name === 'provision_default_services_for_business') {
      return { data: 1, error: null };
    }
    return { data: false, error: null };
  });
  const tableCalls: string[] = [];
  const emptyMaybeSingleChain = () => {
    const chain = {
      eq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      gt: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    return chain;
  };
  const from = vi.fn((table: string) => {
    tableCalls.push(table);
    if (table === 'signup_email_confirmations') {
      return {
        insert: confirmationInsert,
        select: vi.fn(() => emptyMaybeSingleChain()),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis() }),
      };
    }
    if (table === 'notification_email_outbox') {
      return { insert: confirmationOutboxInsert };
    }
    return createChain();
  });

  const client = {
    auth: {
      admin: {
        createUser: authCreateUser,
        updateUserById,
      },
    },
    from,
    rpc,
  };

  return { client, from, tableCalls, authCreateUser, updateUserById, confirmationInsert, confirmationOutboxInsert, rpc };
}

describe('legacy create-account-business boundary', () => {
  beforeEach(() => {
    createClientMock.mockReset();
    vi.stubEnv('SUPABASE_URL', 'https://supabase.example.test');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    vi.stubEnv('PENDING_SIGNUP_ENCRYPTION_KEY_B64', 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=');
    vi.stubEnv('PENDING_SIGNUP_HMAC_KEY_B64', 'YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODk=');
  });

  it.each(['STARTER', 'GROWTH', 'PRO', 'BASIC', 'MEDIUM', 'STARTED'])(
    'completes the FREE path for paid picker plan %s without checkout',
    async (plan) => {
      const supabase = createFreeSignupSupabaseMock();
      createClientMock.mockReturnValue(supabase.client);

      const response = await postCreateAccountBusiness(validPayload(plan));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ ok: true, status: 'signup_ready' });
      expect(supabase.authCreateUser).toHaveBeenCalledWith(expect.objectContaining({
        email: 'ada@example.test',
        email_confirm: true,
      }));
      expect(supabase.tableCalls).toEqual(expect.arrayContaining(['profiles', 'businesses', 'business_settings', 'business_onboarding_state', 'business_subscriptions']));
      expect(JSON.stringify(body)).not.toMatch(/checkout|mercadopago|preapproval/i);
    },
  );

  it('FREE signup creates a confirmed Auth user, provisions the tenant, enqueues confirmation mail, and returns signup_ready', async () => {
    const supabase = createFreeSignupSupabaseMock();
    createClientMock.mockReturnValue(supabase.client);

    const response = await postCreateAccountBusiness(validPayload('FREE'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, status: 'signup_ready' });
    expect(supabase.authCreateUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'ada@example.test',
      password: 'correct-horse-battery-staple',
      email_confirm: true,
    }));
    expect(supabase.tableCalls).toEqual(expect.arrayContaining([
      'profiles',
      'businesses',
      'business_settings',
      'business_onboarding_state',
      'business_subscriptions',
      'signup_email_confirmations',
      'notification_email_outbox',
    ]));
    expect(supabase.rpc).toHaveBeenCalledWith('provision_default_services_for_business', expect.objectContaining({
      p_business_id: expect.any(String),
      p_business_types: expect.arrayContaining(['peluqueria']),
    }));
    expect(supabase.confirmationInsert).toHaveBeenCalledWith(expect.objectContaining({
      purpose: 'free_signup',
      plan_code: 'FREE',
      token_hash: expect.any(String),
      email_hmac: expect.any(String),
      protected_metadata: expect.objectContaining({ business_type: 'peluqueria', created_user_id: 'auth-user-123' }),
    }));
    expect(supabase.confirmationInsert).not.toHaveBeenCalledWith(expect.objectContaining({
      password: expect.anything(),
      protected_metadata: expect.objectContaining({ password: expect.anything() }),
    }));
    expect(supabase.confirmationOutboxInsert).toHaveBeenCalledWith({
      business_id: expect.any(String),
      to_email: 'ada@example.test',
      template_key: 'signup_email_confirmation',
      payload: {
        confirmation_url: expect.stringContaining('/api/signup/confirm-email?token='),
        business_name: 'Ada Studio',
        owner_name: 'Ada',
        plan_code: 'FREE',
      },
    });
  });

  it('passes signup email into provisionFreeSignupTenant and persists live settings defaults', async () => {
    const source = await readFile(new URL('../pages/api/signup/create-account-business.ts', import.meta.url), 'utf8');
    const provisionCall = source.match(/provisionFreeSignupTenant\s*\([\s\S]*?\}\s*\)/)?.[0] ?? '';
    const supabase = createFreeSignupSupabaseMock();
    createClientMock.mockReturnValue(supabase.client);

    const response = await postCreateAccountBusiness(validPayload('FREE'));
    const settingsUpserts = supabase.from.mock.calls
      .map((call, index) => ({ table: call[0], result: supabase.from.mock.results[index]?.value }))
      .filter((entry) => entry.table === 'business_settings')
      .flatMap((entry) => entry.result?.upsert?.mock?.calls ?? []);

    expect(provisionCall, 'create-account-business must pass alta email into provision').toMatch(/\bemail\s*,/);
    expect(response.status).toBe(200);
    expect(settingsUpserts[0]?.[0]).toEqual(expect.objectContaining({
      support_email: 'ada@example.test',
      support_phone: '+5491100000000',
      buffer_minutes: 15,
      min_notice_minutes: 120,
      slot_interval_minutes: 30,
      working_hours: expect.objectContaining({
        monday: expect.objectContaining({ enabled: true, start: '09:00', end: '18:00' }),
        friday: expect.objectContaining({ enabled: true, start: '09:00', end: '18:00' }),
        saturday: expect.objectContaining({ enabled: true, start: '10:00', end: '14:00' }),
        sunday: expect.objectContaining({ enabled: false }),
      }),
    }));
  });

  it('rejects invalid required fields without creating an auth user or provisioning a tenant', async () => {
    const supabase = createFreeSignupSupabaseMock();
    createClientMock.mockReturnValue(supabase.client);

    const response = await postCreateAccountBusiness({
      ...validPayload('FREE'),
      email: '',
      negocioNombre: '',
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual(expect.objectContaining({ error: 'signup_required_fields' }));
    expect(createClientMock).not.toHaveBeenCalled();
    expect(supabase.authCreateUser).not.toHaveBeenCalled();
    expect(supabase.tableCalls).toEqual([]);
  });

  it('accepts in-app Free signup without apellido or phone', async () => {
    const supabase = createFreeSignupSupabaseMock();
    createClientMock.mockReturnValue(supabase.client);

    const { apellido: _apellido, telefono: _telefono, ...withoutApellido } = validPayload('FREE');
    const response = await postCreateAccountBusiness(withoutApellido);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, status: 'signup_ready' });
    expect(supabase.authCreateUser).toHaveBeenCalled();
  });

  it('allows CORS preflight and POST from dashboard origins', async () => {
    const source = await readFile(new URL('../pages/api/signup/create-account-business.ts', import.meta.url), 'utf8');

    expect(source).toMatch(/export const OPTIONS/);
    expect(source).toContain('https://dashboard.orvel.pro');
    expect(source).toContain('Access-Control-Allow-Origin');
    expect(source).toMatch(/localhost:4200|localhost:3000/);
  });

  it('subscription auth helper no longer treats legacy account-first signup as a payment-first path', async () => {
    const source = await readFile(CREATE_SUBSCRIPTION_AUTH_HELPER_PATH, 'utf8');

    expect(source).toContain('requestBody.mode === "pending_signup_intent"');
    expect(source).not.toContain('account_first_signup');
    expect(source).not.toContain('account_first_intent_id');
    expect(source).not.toContain('account_first_session');
  });

  it('rate-limit RPC errors return 503 signup_confirmation_retry, while data true still returns 202', async () => {
    const source = await readFile(new URL('../pages/api/signup/create-account-business.ts', import.meta.url), 'utf8');
    const rateLimitFunction = /async\s+function\s+isRateLimited[\s\S]*?^}/m.exec(source)?.[0] ?? '';

    expect(rateLimitFunction, 'rate guard helper must be inspectable').toMatch(/isRateLimited/);
    expect(rateLimitFunction).not.toMatch(/if\s*\(\s*error\s*\)\s*return\s+true/);
    expect(rateLimitFunction).toMatch(/data\s*===\s*true/);
    expect(source).toMatch(/guard_signup_request_rate_limit[\s\S]{0,1200}signup_confirmation_retry/);
    expect(source).toMatch(/status:\s*["']signup_confirmation_requested["'][\s\S]{0,80}202/);

    const rpcError = createFreeSignupSupabaseMock();
    rpcError.rpc.mockImplementation(async (name: string) => {
      if (name === 'guard_signup_request_rate_limit') {
        return { data: null, error: { message: 'rpc failed' } };
      }
      if (name === 'provision_default_services_for_business') {
        return { data: 1, error: null };
      }
      return { data: false, error: null };
    });
    createClientMock.mockReturnValue(rpcError.client);

    const retryResponse = await postCreateAccountBusiness(validPayload('FREE'));
    const retryBody = await retryResponse.json();

    expect(retryResponse.status).toBe(503);
    expect(retryBody).toEqual({
      error: 'signup_confirmation_retry',
      message: 'No pudimos preparar la confirmación. Reintentá en unos segundos.',
    });
    expect(rpcError.authCreateUser).not.toHaveBeenCalled();

    const limited = createFreeSignupSupabaseMock();
    limited.rpc.mockImplementation(async (name: string) => {
      if (name === 'guard_signup_request_rate_limit') {
        return { data: true, error: null };
      }
      return { data: false, error: null };
    });
    createClientMock.mockReturnValue(limited.client);

    const limitedResponse = await postCreateAccountBusiness(validPayload('FREE'));
    const limitedBody = await limitedResponse.json();

    expect(limitedResponse.status).toBe(202);
    expect(limitedBody).toEqual({ ok: true, status: 'signup_confirmation_requested' });
    expect(limited.authCreateUser).not.toHaveBeenCalled();
  });
});
