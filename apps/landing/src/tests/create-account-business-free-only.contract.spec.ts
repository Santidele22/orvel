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

function createFreeSignupSupabaseMock() {
  const createUser = vi.fn().mockResolvedValue({ data: { user: { id: 'user-free-1' } }, error: null });
  const deleteUser = vi.fn();
  const welcomeOutboxMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const welcomeOutboxInsert = vi.fn().mockResolvedValue({ error: null });
  const tableCalls: string[] = [];
  const from = vi.fn((table: string) => {
    tableCalls.push(table);
    if (table === 'notification_email_outbox') {
      const selectQuery = {
        eq: vi.fn(() => selectQuery),
        maybeSingle: welcomeOutboxMaybeSingle,
      };
      return {
        select: vi.fn(() => selectQuery),
        insert: welcomeOutboxInsert,
        delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
      };
    }
    if (table === 'businesses') {
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
        delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
      };
    }
    if (table === 'account_first_intents') {
      return {
        insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { id: 'unexpected-paid-intent' }, error: null }) })) })),
        delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
      };
    }
    return {
      upsert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
    };
  });

  const client = {
    auth: { admin: { createUser, deleteUser } },
    from,
  };

  return { client, createUser, from, tableCalls, welcomeOutboxInsert, welcomeOutboxMaybeSingle };
}

describe('legacy create-account-business boundary', () => {
  beforeEach(() => {
    createClientMock.mockReset();
    vi.stubEnv('SUPABASE_URL', 'https://supabase.example.test');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
  });

  it.each(['STARTER', 'GROWTH', 'PRO', 'BASIC', 'MEDIUM', 'STARTED'])(
    'rejects paid plan %s before creating auth, business, subscription, or account-first intent state',
    async (plan) => {
      const supabase = createFreeSignupSupabaseMock();
      createClientMock.mockReturnValue(supabase.client);

      const response = await postCreateAccountBusiness(validPayload(plan));
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body).toEqual({
        ok: false,
        error: 'paid_signup_requires_payment_first',
        message: 'Los planes pagos deben iniciar por pending-intent y pago antes de crear la cuenta.',
      });
      expect(createClientMock).not.toHaveBeenCalled();
      expect(supabase.createUser).not.toHaveBeenCalled();
      expect(supabase.from).not.toHaveBeenCalled();
      expect(supabase.tableCalls).not.toEqual(expect.arrayContaining(['businesses', 'business_subscriptions', 'account_first_intents']));
    },
  );

  it('preserves FREE immediate account and business creation without account-first intent state', async () => {
    const supabase = createFreeSignupSupabaseMock();
    createClientMock.mockReturnValue(supabase.client);

    const response = await postCreateAccountBusiness(validPayload('FREE'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, business_type: 'peluqueria', plan: 'FREE', subscription_status: 'active' });
    expect(supabase.createUser).toHaveBeenCalledTimes(1);
    expect(supabase.tableCalls).toEqual(expect.arrayContaining(['profiles', 'businesses', 'business_settings', 'business_onboarding_state', 'business_subscriptions', 'notification_email_outbox']));
    expect(supabase.tableCalls).not.toContain('account_first_intents');
    expect(supabase.welcomeOutboxMaybeSingle).toHaveBeenCalledTimes(1);
    expect(supabase.welcomeOutboxInsert).toHaveBeenCalledWith({
      business_id: expect.any(String),
      to_email: 'ada@example.test',
      template_key: 'business_welcome',
      payload: {
        business_name: 'Ada Studio',
        owner_name: 'Ada',
      },
    });
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
