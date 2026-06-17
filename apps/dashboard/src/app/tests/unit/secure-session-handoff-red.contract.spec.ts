import { describe, expect, it, vi } from 'vitest';

import * as routeProtection from '../../core/auth/route-protection';

describe('RED Contract: dashboard redeems opaque landing session handoff', () => {
  it('redeems the opaque handoff with POST, calls Supabase setSession, strips the URL param, then allows guard flow to continue', async () => {
    const replaceState = vi.fn();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          href: 'https://dashboard.orvel.pro/dashboard/inicio?handoff=handoff_opaque_123&from=login',
          origin: 'https://dashboard.orvel.pro',
          pathname: '/dashboard/inicio',
          search: '?handoff=handoff_opaque_123&from=login',
          hash: ''
        },
        history: { replaceState }
      }
    });

    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'redeemed.access.jwt',
        refresh_token: 'redeemed.refresh.jwt'
      })
    });
    const setSession = vi.fn().mockResolvedValue({ data: { session: { user: { user_metadata: {} } } }, error: null });

    const result = await routeProtection.redeemDashboardSessionHandoff({
      functionUrl: 'https://project.supabase.co/functions/v1/redeem-session-handoff',
      fetch,
      auth: { setSession }
    });

    expect(fetch).toHaveBeenCalledWith(
      'https://project.supabase.co/functions/v1/redeem-session-handoff',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ handoff: 'handoff_opaque_123' })
      })
    );
    expect(setSession).toHaveBeenCalledWith({
      access_token: 'redeemed.access.jwt',
      refresh_token: 'redeemed.refresh.jwt'
    });
    expect(replaceState).toHaveBeenCalledWith(null, '', '/dashboard/inicio?from=login');
    expect(result).toEqual({ redeemed: true });
  });

  it('never accepts raw credentials in dashboard URLs as a handoff mechanism', async () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          href: 'https://dashboard.orvel.pro/dashboard/inicio?access_token=bad&refresh_token=bad',
          origin: 'https://dashboard.orvel.pro',
          pathname: '/dashboard/inicio',
          search: '?access_token=bad&refresh_token=bad',
          hash: ''
        },
        history: { replaceState: vi.fn() }
      }
    });

    await expect(
      routeProtection.redeemDashboardSessionHandoff({
        functionUrl: 'https://project.supabase.co/functions/v1/redeem-session-handoff',
        fetch: vi.fn(),
        auth: { setSession: vi.fn() }
      })
    ).resolves.toEqual({ redeemed: false });
  });
});
