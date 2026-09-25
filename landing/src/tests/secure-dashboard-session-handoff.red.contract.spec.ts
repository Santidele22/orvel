import { describe, expect, it, vi } from 'vitest';

import { createDashboardSessionHandoff } from '../lib/dashboard-session-handoff';

describe('RED Contract: secure landing to dashboard session handoff', () => {
  it('creates an opaque one-time dashboard handoff after password login without putting raw session credentials in the URL', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { handoff: 'handoff_opaque_123' },
      error: null
    });

    const redirectTo = await createDashboardSessionHandoff({
      dashboardOrigin: 'https://dashboard.orvel.pro',
      returnTo: '/dashboard/inicio?from=login',
      session: {
        access_token: 'access.jwt.must.stay.out.of.url',
        refresh_token: 'refresh.jwt.must.stay.out.of.url'
      },
      invoke
    });

    expect(invoke).toHaveBeenCalledWith('create-session-handoff', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer access.jwt.must.stay.out.of.url'
      },
      body: {
        refresh_token: 'refresh.jwt.must.stay.out.of.url'
      }
    });

    const url = new URL(redirectTo);
    expect(url.origin).toBe('https://dashboard.orvel.pro');
    expect(url.pathname).toBe('/dashboard/inicio');
    expect(url.searchParams.get('handoff')).toBe('handoff_opaque_123');
    expect(url.searchParams.get('from')).toBe('login');
    expect(redirectTo).not.toMatch(/access\.jwt|refresh\.jwt|access_token|refresh_token|code=/i);
  });

  it('fails closed when the Edge Function does not return an opaque handoff value', async () => {
    await expect(
      createDashboardSessionHandoff({
        dashboardOrigin: 'https://dashboard.orvel.pro',
        returnTo: '/dashboard/inicio',
        session: {
          access_token: 'access.jwt',
          refresh_token: 'refresh.jwt'
        },
        invoke: vi.fn().mockResolvedValue({ data: {}, error: null })
      })
    ).rejects.toThrow(/handoff/i);
  });
});
