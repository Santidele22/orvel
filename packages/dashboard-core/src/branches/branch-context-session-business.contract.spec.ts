import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BranchContextService } from './branch-context.service';
import { ACTIVE_BUSINESS_STORAGE_KEY } from '../storage/browser-storage-keys';

/**
 * Fase 1 of #1098: the double is the branch-context port, so these tests state
 * the session/ownership rules without simulating a Supabase query builder.
 */
const USER_ID = 'user-1';
const SESSION_BUSINESS_ID = 'business-session';
const STORED_BUSINESS_ID = 'business-stored';
const OWNED_BUSINESS_ID = 'business-owned';
const SESSION_BRANCH_ID = 'branch-session';
const STORED_BRANCH_ID = 'branch-stored';
const OWNED_BRANCH_ID = 'branch-owned';

type SourceDouble = {
  readSession: ReturnType<typeof vi.fn>;
  listDashboardBranches: ReturnType<typeof vi.fn>;
  listOwnedBusinesses: ReturnType<typeof vi.fn>;
};

function sourceDouble(options: {
  sessionBusinessId?: string | null;
  ownedBusinessIds?: string[];
} = {}): SourceDouble {
  const sessionBusinessId = options.sessionBusinessId ?? null;
  const ownedBusinessIds = options.ownedBusinessIds ?? (sessionBusinessId ? [sessionBusinessId] : []);

  return {
    readSession: vi.fn(() => Promise.resolve({
      userId: USER_ID,
      userMetadata: sessionBusinessId ? { business_id: sessionBusinessId } : {}
    })),
    listDashboardBranches: vi.fn((businessId: string) => {
      const branches = businessId === SESSION_BUSINESS_ID
        ? [{ id: SESSION_BRANCH_ID, name: 'Principal', business_id: SESSION_BUSINESS_ID, is_active: true }]
        : businessId === STORED_BUSINESS_ID
          ? [{ id: STORED_BRANCH_ID, name: 'Vieja', business_id: STORED_BUSINESS_ID, is_active: true }]
          : businessId === OWNED_BUSINESS_ID
            ? [{ id: OWNED_BRANCH_ID, name: 'Principal', business_id: OWNED_BUSINESS_ID, is_active: true }]
            : [];
      return Promise.resolve(branches);
    }),
    listOwnedBusinesses: vi.fn(() => Promise.resolve(ownedBusinessIds.map((id) => ({ id }))))
  };
}

function attachSource(service: BranchContextService, source: SourceDouble): void {
  (service as unknown as { source: SourceDouble }).source = source;
}

describe('BranchContext session business wins over stale storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('uses the signed-in business_id even if localStorage still has another business', async () => {
    window.localStorage.setItem(ACTIVE_BUSINESS_STORAGE_KEY, STORED_BUSINESS_ID);
    const branchContext = new BranchContextService();
    attachSource(branchContext, sourceDouble({ sessionBusinessId: SESSION_BUSINESS_ID }));

    await branchContext.refresh();

    expect(branchContext.activeBranchId()).toBe(SESSION_BRANCH_ID);
    expect(window.localStorage.getItem(ACTIVE_BUSINESS_STORAGE_KEY)).toBe(SESSION_BUSINESS_ID);
  });

  it('uses the owned business when metadata is missing and localStorage is from another account', async () => {
    window.localStorage.setItem(ACTIVE_BUSINESS_STORAGE_KEY, STORED_BUSINESS_ID);
    const branchContext = new BranchContextService();
    attachSource(branchContext, sourceDouble({
      sessionBusinessId: null,
      ownedBusinessIds: [OWNED_BUSINESS_ID]
    }));

    await branchContext.refresh();

    expect(branchContext.activeBranchId()).toBe(OWNED_BRANCH_ID);
    expect(window.localStorage.getItem(ACTIVE_BUSINESS_STORAGE_KEY)).toBe(OWNED_BUSINESS_ID);
  });

  it('ignores metadata that is the auth user id when the owned business is a different uuid', async () => {
    window.localStorage.setItem(ACTIVE_BUSINESS_STORAGE_KEY, USER_ID);
    const branchContext = new BranchContextService();
    attachSource(branchContext, sourceDouble({
      sessionBusinessId: USER_ID,
      ownedBusinessIds: [OWNED_BUSINESS_ID]
    }));

    await branchContext.refresh();

    expect(branchContext.activeBranchId()).toBe(OWNED_BRANCH_ID);
    expect(window.localStorage.getItem(ACTIVE_BUSINESS_STORAGE_KEY)).toBe(OWNED_BUSINESS_ID);
  });

  it('overlapping ensureLoaded callers wait until refresh sets the active branch', async () => {
    const branchContext = new BranchContextService();
    let releaseBranches!: (value: unknown) => void;
    const branchGate = new Promise((resolve) => {
      releaseBranches = resolve;
    });
    const source = sourceDouble({ sessionBusinessId: SESSION_BUSINESS_ID });
    source.listDashboardBranches = vi.fn(() =>
      branchGate.then(() => [
        { id: SESSION_BRANCH_ID, name: 'Principal', business_id: SESSION_BUSINESS_ID, is_active: true }
      ])
    );
    attachSource(branchContext, source);

    let secondSawBranch: string | null = null;
    const first = branchContext.ensureLoaded();
    const second = branchContext.ensureLoaded().then(() => {
      secondSawBranch = branchContext.getActiveBranchId();
    });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(branchContext.getActiveBranchId()).toBeNull();

    releaseBranches(undefined);
    await Promise.all([first, second]);

    expect(secondSawBranch).toBe(SESSION_BRANCH_ID);
    expect(branchContext.getActiveBranchId()).toBe(SESSION_BRANCH_ID);
  });
});
