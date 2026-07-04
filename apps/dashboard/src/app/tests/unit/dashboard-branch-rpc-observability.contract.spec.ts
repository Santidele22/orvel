// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveVerifiedDashboardBranches } from '../../core/business/verified-dashboard-business-context';
import {
  clearDashboardOperationalEventSubscribersForTests,
  DASHBOARD_OPERATIONAL_EVENT,
  emitDashboardBranchRpcFailure,
  subscribeDashboardOperationalEvents,
  type DashboardOperationalEvent,
} from '../../core/observability/dashboard-operational-events';

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('dashboard branch RPC observability', () => {
  afterEach(() => {
    clearDashboardOperationalEventSubscribersForTests();
    vi.restoreAllMocks();
  });

  it('emits a sanitized subscriber and browser event when get_dashboard_branches fails', async () => {
    const observed: DashboardOperationalEvent[] = [];
    const unsubscribe = subscribeDashboardOperationalEvents((event) => observed.push(event));
    vi.spyOn(window, 'dispatchEvent');
    const supabase = {
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'user-secret-token-123' } } }, error: null }) },
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: 'PGRST202',
          message: 'Could not find the function public.get_dashboard_branches(token=secret-session raw stack) in the schema cache',
          details: 'raw details with bearer abc.def.ghi',
          hint: 'reload schema',
        },
      }),
    };

    await expect(resolveVerifiedDashboardBranches(supabase as never, 'branch-context')).rejects.toMatchObject({
      code: 'DASHBOARD_BRANCH_RPC_FAILED',
    });
    await flushPromises();
    unsubscribe();

    expect(observed).toEqual<DashboardOperationalEvent[]>([{
      event: 'get_dashboard_branches.rpc_failed',
      feature: 'dashboard-context',
      source: 'branch-context',
      rpc: 'get_dashboard_branches',
      errorCode: 'PGRST202',
      errorCategory: 'RPC_SCHEMA_CACHE_MISS',
    }]);
    expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: DASHBOARD_OPERATIONAL_EVENT,
      detail: observed[0],
    }));
    expect(JSON.stringify(observed[0])).not.toMatch(/secret|token|bearer|abc\.def|raw stack|details/i);
  });

  it('records source-specific events for branch context, notifications, and calendar paths without raw error data', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const rawError = {
      code: 'PGRST202; bearer-token',
      message: 'Could not find the function public.get_dashboard_branches with session token xyz',
      session: { access_token: 'do-not-emit' },
    };

    const events = [
      emitDashboardBranchRpcFailure({ source: 'branch-context', error: rawError }),
      emitDashboardBranchRpcFailure({ source: 'notifications', error: rawError }),
      emitDashboardBranchRpcFailure({ source: 'calendar', error: rawError }),
    ];

    expect(events.map((event) => event.source)).toEqual(['branch-context', 'notifications', 'calendar']);
    expect(events.every((event) => event.event === 'get_dashboard_branches.rpc_failed')).toBe(true);
    expect(JSON.stringify(events)).not.toMatch(/do-not-emit|access_token|session token xyz|bearer-token/i);
  });
});
