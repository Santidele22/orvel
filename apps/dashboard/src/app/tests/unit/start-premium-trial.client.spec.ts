import { describe, expect, it, vi } from 'vitest';

import { startPremiumTrialForCurrentBusiness } from '../../features/auth/start-premium-trial.client';

describe('startPremiumTrialForCurrentBusiness', () => {
  it('calls start_premium_trial for the current business and treats started as success', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ outcome: 'started', plan_code: 'PREMIUM', status: 'trialing' }],
      error: null
    });

    const result = await startPremiumTrialForCurrentBusiness('biz-1', { rpc });

    expect(rpc).toHaveBeenCalledWith('start_premium_trial', { p_business_id: 'biz-1' });
    expect(result).toEqual({ ok: true, outcome: 'started' });
  });

  it('treats already_premium and already_trialing as success no-ops', async () => {
    const premium = await startPremiumTrialForCurrentBusiness('biz-1', {
      rpc: vi.fn().mockResolvedValue({ data: { outcome: 'already_premium' }, error: null })
    });
    const trialing = await startPremiumTrialForCurrentBusiness('biz-1', {
      rpc: vi.fn().mockResolvedValue({ data: { outcome: 'already_trialing' }, error: null })
    });

    expect(premium).toEqual({ ok: true, outcome: 'already_premium' });
    expect(trialing).toEqual({ ok: true, outcome: 'already_trialing' });
  });

  it('maps trial_already_used to a typed failure the wizard can show', async () => {
    const result = await startPremiumTrialForCurrentBusiness('biz-1', {
      rpc: vi.fn().mockResolvedValue({ data: { outcome: 'trial_already_used' }, error: null })
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.outcome).toBe('trial_already_used');
    expect(result.message).toContain('prueba');
  });
});
