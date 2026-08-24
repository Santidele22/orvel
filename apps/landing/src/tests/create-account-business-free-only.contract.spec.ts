import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

const createClientMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

const { POST } = await import('../pages/api/signup/create-account-business');

const ACCOUNT_CONTROLLER_PATH = new URL('../lib/signup-account-page-controller.ts', import.meta.url);
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

  it('paid signup account controller does not call the legacy create-account-business endpoint', async () => {
    const source = await readFile(ACCOUNT_CONTROLLER_PATH, 'utf8');
    const paidBranch = source.slice(source.indexOf('try {', source.indexOf('if (!isPaidPlan)')), source.lastIndexOf('});'));

    expect(source).toContain('/api/signup/create-account-business');
    expect(source).toContain('/api/signup/pending-intent/protect');
    expect(paidBranch).toContain('createProtectedPendingSignupIntent({');
    expect(paidBranch).toContain('SIGNUP_STORAGE_KEYS.pendingSignupIntent');
    expect(paidBranch).not.toContain('createAccountAndBusiness(accountBusinessPayload)');
    expect(paidBranch).not.toContain('account_first_intent_id');
    expect(paidBranch).not.toContain('account_first_session');
  });

  it('subscription auth helper no longer treats legacy account-first signup as a payment-first path', async () => {
    const source = await readFile(CREATE_SUBSCRIPTION_AUTH_HELPER_PATH, 'utf8');

    expect(source).toContain('requestBody.mode === "pending_signup_intent"');
    expect(source).not.toContain('account_first_signup');
    expect(source).not.toContain('account_first_intent_id');
    expect(source).not.toContain('account_first_session');
  });
});
