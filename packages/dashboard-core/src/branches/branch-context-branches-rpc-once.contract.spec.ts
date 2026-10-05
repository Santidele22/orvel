import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BranchContextService,
  getBranchContextService,
  resetBranchContextSession
} from './branch-context.service';

/**
 * Fase 1 of #1098: the service depends on `BranchContextSource`, not on the
 * Supabase client, so the double here is three plain methods — no query-builder
 * simulation.
 */
const USER_ID = 'user-1';
const BUSINESS_ID = 'business-owned';
const BRANCH_ID = 'branch-owned';

type SourceDouble = {
  readSession: ReturnType<typeof vi.fn>;
  listDashboardBranches: ReturnType<typeof vi.fn>;
  listOwnedBusinesses: ReturnType<typeof vi.fn>;
};

function sourceDouble(): SourceDouble {
  return {
    readSession: vi.fn(() =>
      Promise.resolve({ userId: USER_ID, userMetadata: { business_id: BUSINESS_ID } })
    ),
    listDashboardBranches: vi.fn((businessId: string) => {
      expect(businessId).toBe(BUSINESS_ID);
      return Promise.resolve([{ id: BRANCH_ID, name: 'Principal', business_id: BUSINESS_ID, is_active: true }]);
    }),
    listOwnedBusinesses: vi.fn(() =>
      Promise.resolve([{ id: BUSINESS_ID, owner_id: USER_ID, slug: 'studio', name: 'Studio' }])
    )
  };
}

function attachSource(service: BranchContextService, source: SourceDouble): void {
  (service as unknown as { source: SourceDouble }).source = source;
}

function branchListCount(source: SourceDouble): number {
  return source.listDashboardBranches.mock.calls.length;
}

describe('BranchContext skips get_dashboard_branches when the branch id is warm', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetBranchContextSession();
  });

  it('two ensureLoaded calls on a 1-branch tenant issue exactly one get_dashboard_branches RPC', async () => {
    const branchContext = new BranchContextService();
    const source = sourceDouble();
    attachSource(branchContext, source);

    await branchContext.ensureLoaded();
    await branchContext.ensureLoaded();

    expect(branchContext.activeBranchId()).toBe(BRANCH_ID);
    expect(branchListCount(source)).toBe(1);
  });

  it('further ensureLoaded does not RPC after activeBranchId is set even if getActiveBusinessId is also called', async () => {
    const branchContext = new BranchContextService();
    const source = sourceDouble();
    attachSource(branchContext, source);

    await branchContext.ensureLoaded();
    expect(branchContext.activeBranchId()).toBe(BRANCH_ID);
    expect(branchListCount(source)).toBe(1);

    await branchContext.getActiveBusinessId();
    await branchContext.ensureLoaded();

    expect(branchListCount(source)).toBe(1);
  });

  it('resetSession and resetBranchContextSession make the next ensureLoaded RPC again', async () => {
    const singleton = getBranchContextService();
    const source = sourceDouble();
    attachSource(singleton, source);

    await singleton.ensureLoaded();
    expect(branchListCount(source)).toBe(1);

    singleton.resetSession();
    attachSource(singleton, source);
    await singleton.ensureLoaded();
    expect(branchListCount(source)).toBe(2);

    resetBranchContextSession();
    const next = getBranchContextService();
    attachSource(next, source);
    await next.ensureLoaded();
    expect(branchListCount(source)).toBe(3);
  });
});
