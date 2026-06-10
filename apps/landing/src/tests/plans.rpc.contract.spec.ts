import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createClientMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args)
}));

async function loadPlansModule() {
  vi.resetModules();
  return import('../lib/plans');
}

function rpcPlansFixture() {
  return [
    {
      id: 'rpc-starter',
      code: 'STARTER',
      name: 'Starter',
      description: 'desc',
      price: 12,
      currency: 'ARS',
      billing_frequency: 1,
      billing_frequency_type: 'months',
      duration_days: 30,
      is_active: true,
      is_featured: true,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    }
  ];
}

function rpcMessyLaunchPlansFixture() {
  const base = rpcPlansFixture()[0]!;
  return [
    { ...base, id: 'old-simple', code: 'SIMPLE', name: 'Simple', price: 9900, is_featured: false },
    { ...base, id: 'starter-monthly', code: 'STARTER_MONTHLY', name: 'Plan Starter Mensual', price: 12, is_featured: false },
    { ...base, id: 'growth-monthly', code: 'GROWTH_MONTHLY', name: 'Plan Growth Mensual', price: 22, is_featured: false },
    { ...base, id: 'starter-quarterly', code: 'STARTER_QUARTERLY', name: 'Plan Starter Trimestral', price: 34, is_featured: false },
    { ...base, id: 'old-crece', code: 'CRECE', name: 'Crece', price: 24900, is_featured: false },
    { ...base, id: 'old-escala', code: 'ESCALA', name: 'Escala', price: 44900, is_featured: false },
    { ...base, id: 'canonical-starter', code: 'STARTER', name: 'Starter', price: 12000, is_featured: true },
    { ...base, id: 'canonical-growth', code: 'GROWTH', name: 'Growth', price: 22000, is_featured: false },
    { ...base, id: 'canonical-pro', code: 'PRO', name: 'Pro', price: 39000, is_featured: false }
  ];
}

describe('Contract: landing plans fetching is RPC-first with static fallback', () => {
  beforeEach(() => {
    createClientMock.mockReset();
    vi.stubEnv('PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('getActivePlans uses get_active_plans RPC in main flow and never depends on .from("plans")', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: rpcPlansFixture(), error: null });
    const from = vi.fn().mockImplementation(() => {
      throw new Error('Unexpected direct table read in main flow');
    });

    createClientMock.mockReturnValue({ rpc, from });

    const { getActivePlans } = await loadPlansModule();
    const plans = await getActivePlans();

    expect(rpc).toHaveBeenCalledWith('get_active_plans');
    expect(from).not.toHaveBeenCalled();
    expect(plans[0]?.id).toBe('rpc-starter');
  });

  it('normalizes Supabase catalog rows to one canonical landing card per plan and filters billing variants', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: rpcMessyLaunchPlansFixture(), error: null });
    const from = vi.fn();
    createClientMock.mockReturnValue({ rpc, from });

    const { getActivePlans, normalizeActivePlansForLanding } = await loadPlansModule();
    const plans = await getActivePlans();
    const normalizedDirect = normalizeActivePlansForLanding(rpcMessyLaunchPlansFixture());

    expect(rpc).toHaveBeenCalledWith('get_active_plans');
    expect(from).not.toHaveBeenCalled();
    expect(plans.map((plan) => plan.code)).toEqual(['STARTER', 'GROWTH', 'PRO']);
    expect(normalizedDirect.map((plan) => plan.name)).toEqual(['Starter', 'Growth', 'Pro']);
    expect(plans.map((plan) => plan.id)).toEqual(['canonical-starter', 'canonical-growth', 'canonical-pro']);
    expect(plans.map((plan) => `${plan.code} ${plan.name}`).join(' ')).not.toMatch(/MENSUAL|TRIMESTRAL|ANUAL|SIMPLE|CRECE|ESCALA/i);
  });

  it('getActivePlans falls back to static plans when RPC fails', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'rpc fail' } });
    const from = vi.fn();
    createClientMock.mockReturnValue({ rpc, from });

    const { getActivePlans } = await loadPlansModule();
    const plans = await getActivePlans();

    expect(rpc).toHaveBeenCalledWith('get_active_plans');
    expect(from).not.toHaveBeenCalled();
    expect(plans.length).toBeGreaterThan(0);
    expect(plans.some((plan) => plan.code === 'FREE')).toBe(true);
  });

  it('getActivePlans falls back to static plans when RPC returns empty list', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const from = vi.fn();
    createClientMock.mockReturnValue({ rpc, from });

    const { getActivePlans } = await loadPlansModule();
    const plans = await getActivePlans();

    expect(rpc).toHaveBeenCalledWith('get_active_plans');
    expect(from).not.toHaveBeenCalled();
    expect(plans.some((plan) => plan.code === 'STARTER')).toBe(true);
  });

  it.each([
    ['missing public Supabase URL', undefined, 'anon-key'],
    ['blank public Supabase URL', '   ', 'anon-key'],
    ['missing public Supabase anon key', 'https://example.supabase.co', undefined],
    ['blank public Supabase anon key', 'https://example.supabase.co', '   ']
  ])('getActivePlans fails soft with static plans and does not construct Supabase when %s', async (_case, url, anonKey) => {
    vi.stubEnv('PUBLIC_SUPABASE_URL', url);
    vi.stubEnv('PUBLIC_SUPABASE_ANON_KEY', anonKey);

    const { getActivePlans } = await loadPlansModule();
    const plans = await getActivePlans();

    expect(createClientMock).not.toHaveBeenCalled();
    expect(plans.length).toBeGreaterThan(0);
    expect(plans.some((plan) => plan.code === 'FREE')).toBe(true);
    expect(plans.some((plan) => plan.code === 'STARTER')).toBe(true);
  });

  it('getPlanByCode uses get_plan_by_code RPC and avoids .from("plans")', async () => {
    const rpcPlan = rpcPlansFixture()[0];
    const rpc = vi.fn().mockResolvedValue({ data: rpcPlan, error: null });
    const from = vi.fn();
    createClientMock.mockReturnValue({ rpc, from });

    const { getPlanByCode } = await loadPlansModule();
    const plan = await getPlanByCode('STARTER');

    expect(rpc).toHaveBeenCalledWith('get_plan_by_code', { p_code: 'STARTER' });
    expect(from).not.toHaveBeenCalled();
    expect(plan?.code).toBe('STARTER');
  });

  it('getPlanByCode falls back to static contract when RPC fails or returns empty', async () => {
    const from = vi.fn();
    const { getPlanByCode } = await loadPlansModule();

    createClientMock.mockReturnValueOnce({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
      from
    });
    const failed = await getPlanByCode('PRO');

    createClientMock.mockReturnValueOnce({
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      from
    });
    const empty = await getPlanByCode('FREE');

    expect(from).not.toHaveBeenCalled();
    expect(failed?.code).toBe('PRO');
    expect(empty?.code).toBe('FREE');
  });

  it.each([
    ['missing public Supabase URL', undefined, 'anon-key'],
    ['blank public Supabase URL', '   ', 'anon-key'],
    ['missing public Supabase anon key', 'https://example.supabase.co', undefined],
    ['blank public Supabase anon key', 'https://example.supabase.co', '   ']
  ])('getPlanByCode fails soft with static plan and does not construct Supabase when %s', async (_case, url, anonKey) => {
    vi.stubEnv('PUBLIC_SUPABASE_URL', url);
    vi.stubEnv('PUBLIC_SUPABASE_ANON_KEY', anonKey);

    const { getPlanByCode } = await loadPlansModule();
    const plan = await getPlanByCode('PRO');

    expect(createClientMock).not.toHaveBeenCalled();
    expect(plan?.code).toBe('PRO');
  });
});
