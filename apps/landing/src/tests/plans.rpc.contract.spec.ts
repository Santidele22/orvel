import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('Contract: landing plans fetching is RPC-first with static fallback', () => {
  beforeEach(() => {
    createClientMock.mockReset();
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
});
