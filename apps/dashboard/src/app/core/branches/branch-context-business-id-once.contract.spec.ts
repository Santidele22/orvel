import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BranchContextService,
  getBranchContextService,
  resetBranchContextSession
} from './branch-context.service';
import { ACTIVE_BUSINESS_STORAGE_KEY } from '../storage/browser-storage-keys';

/**
 * Fase 1 of #1098: the double is the branch-context port, so "resolved once"
 * is counted on `listOwnedBusinesses` instead of on a simulated
 * `from('businesses')` query builder.
 */
const USER_ID = 'user-1';
const BUSINESS_ID = 'business-owned';
const BRANCH_ID = 'branch-owned';

type SourceDouble = {
  readSession: ReturnType<typeof vi.fn>;
  listDashboardBranches: ReturnType<typeof vi.fn>;
  listOwnedBusinesses: ReturnType<typeof vi.fn>;
};

function sourceDouble(options: {
  ownedBusinessIds?: string[];
  delayMs?: number;
} = {}): SourceDouble {
  const ownedBusinessIds = options.ownedBusinessIds ?? [BUSINESS_ID];
  const delayMs = options.delayMs ?? 0;

  return {
    readSession: vi.fn(() => Promise.resolve({
      userId: USER_ID,
      userMetadata: { business_id: ownedBusinessIds[0] }
    })),
    listDashboardBranches: vi.fn(() =>
      Promise.resolve([{ id: BRANCH_ID, name: 'Principal', business_id: BUSINESS_ID, is_active: true }])
    ),
    listOwnedBusinesses: vi.fn(() => {
      const rows = ownedBusinessIds.map((id) => ({
        id,
        owner_id: USER_ID,
        slug: 'studio',
        name: 'Studio'
      }));
      if (delayMs <= 0) {
        return Promise.resolve(rows);
      }
      return new Promise((resolve) => {
        setTimeout(() => resolve(rows), delayMs);
      });
    })
  };
}

function attachSource(service: BranchContextService, source: SourceDouble): void {
  (service as unknown as { source: SourceDouble }).source = source;
}

describe('BranchContext session business identity is resolved once', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetBranchContextSession();
  });

  it('second getActiveBusinessId and ensureLoaded do not query businesses again', async () => {
    const branchContext = new BranchContextService();
    const source = sourceDouble();
    attachSource(branchContext, source);

    const firstId = await branchContext.getActiveBusinessId();
    expect(firstId).toBe(BUSINESS_ID);
    expect(source.listOwnedBusinesses).toHaveBeenCalledTimes(1);
    expect(source.listOwnedBusinesses).toHaveBeenCalledWith(USER_ID);

    await branchContext.ensureLoaded();
    const secondId = await branchContext.getActiveBusinessId();
    await branchContext.ensureLoaded();

    expect(secondId).toBe(BUSINESS_ID);
    expect(source.listOwnedBusinesses).toHaveBeenCalledTimes(1);
  });

  it('ensureLoaded skips businesses entirely when already initialized for the same business', async () => {
    const branchContext = new BranchContextService();
    const source = sourceDouble();
    attachSource(branchContext, source);

    await branchContext.ensureLoaded();
    expect(source.listOwnedBusinesses).toHaveBeenCalledWith(USER_ID);
    expect(source.listOwnedBusinesses).toHaveBeenCalledTimes(1);

    await branchContext.ensureLoaded();
    expect(source.listOwnedBusinesses).toHaveBeenCalledTimes(1);
  });

  it('resetSession and resetBranchContextSession clear the holder so the next resolve queries businesses', async () => {
    const singleton = getBranchContextService();
    const source = sourceDouble();
    attachSource(singleton, source);

    await singleton.getActiveBusinessId();
    expect(source.listOwnedBusinesses).toHaveBeenCalledTimes(1);

    singleton.resetSession();
    attachSource(singleton, source);
    await singleton.getActiveBusinessId();
    expect(source.listOwnedBusinesses).toHaveBeenCalledTimes(2);

    resetBranchContextSession();
    const next = getBranchContextService();
    attachSource(next, source);
    window.localStorage.setItem(ACTIVE_BUSINESS_STORAGE_KEY, BUSINESS_ID);
    await next.getActiveBusinessId();
    expect(source.listOwnedBusinesses).toHaveBeenCalledTimes(3);
  });

  it('concurrent getActiveBusinessId and ensureLoaded on a cold service share one businesses GET', async () => {
    const branchContext = new BranchContextService();
    const source = sourceDouble({ delayMs: 40 });
    attachSource(branchContext, source);

    const [activeId] = await Promise.all([
      branchContext.getActiveBusinessId(),
      branchContext.ensureLoaded()
    ]);

    expect(activeId).toBe(BUSINESS_ID);
    expect(source.listOwnedBusinesses).toHaveBeenCalledTimes(1);
    expect(source.listOwnedBusinesses).toHaveBeenCalledWith(USER_ID);
  });

  it('concurrent triple getActiveBusinessId shares one businesses GET', async () => {
    const branchContext = new BranchContextService();
    const source = sourceDouble({ delayMs: 40 });
    attachSource(branchContext, source);

    const [first, second, third] = await Promise.all([
      branchContext.getActiveBusinessId(),
      branchContext.getActiveBusinessId(),
      branchContext.getActiveBusinessId()
    ]);

    expect(first).toBe(BUSINESS_ID);
    expect(second).toBe(BUSINESS_ID);
    expect(third).toBe(BUSINESS_ID);
    expect(source.listOwnedBusinesses).toHaveBeenCalledTimes(1);
  });

  it('resetSession after a coalesced resolve clears in-flight so the next resolve queries again', async () => {
    const branchContext = new BranchContextService();
    const source = sourceDouble({ delayMs: 40 });
    attachSource(branchContext, source);

    await Promise.all([
      branchContext.getActiveBusinessId(),
      branchContext.getActiveBusinessId()
    ]);
    expect(source.listOwnedBusinesses).toHaveBeenCalledTimes(1);

    branchContext.resetSession();
    attachSource(branchContext, source);
    const nextId = await branchContext.getActiveBusinessId();

    expect(nextId).toBe(BUSINESS_ID);
    expect(source.listOwnedBusinesses).toHaveBeenCalledTimes(2);
  });
});
