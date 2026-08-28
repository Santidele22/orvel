import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BranchContextService,
  getBranchContextService,
  resetBranchContextSession
} from './branch-context.service';
import { ACTIVE_BUSINESS_STORAGE_KEY } from '../storage/browser-storage-keys';

const USER_ID = 'user-1';
const BUSINESS_ID = 'business-owned';
const BRANCH_ID = 'branch-owned';

function supabaseDouble(options: {
  ownedBusinessIds?: string[];
} = {}) {
  const ownedBusinessIds = options.ownedBusinessIds ?? [BUSINESS_ID];

  return {
    auth: {
      getSession: () => Promise.resolve({
        data: {
          session: {
            user: {
              id: USER_ID,
              user_metadata: { business_id: ownedBusinessIds[0] }
            }
          }
        },
        error: null
      })
    },
    from: vi.fn((table: string) => {
      if (table !== 'businesses') {
        throw new Error(`unexpected table ${table}`);
      }

      return {
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({
              data: ownedBusinessIds.map((id) => ({
                id,
                owner_id: USER_ID,
                slug: 'studio',
                name: 'Studio'
              })),
              error: null
            })
          })
        })
      };
    }),
    rpc: vi.fn(() => Promise.resolve({
      data: [{ id: BRANCH_ID, name: 'Principal', business_id: BUSINESS_ID, is_active: true }],
      error: null
    }))
  };
}

function attachClient(service: BranchContextService, client: ReturnType<typeof supabaseDouble>): void {
  (service as unknown as { supabaseClient: unknown }).supabaseClient = client;
}

describe('BranchContext session business identity is resolved once', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetBranchContextSession();
  });

  it('second getActiveBusinessId and ensureLoaded do not query businesses again', async () => {
    const branchContext = new BranchContextService();
    const client = supabaseDouble();
    attachClient(branchContext, client);

    const firstId = await branchContext.getActiveBusinessId();
    expect(firstId).toBe(BUSINESS_ID);
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(client.from).toHaveBeenCalledWith('businesses');

    await branchContext.ensureLoaded();
    const secondId = await branchContext.getActiveBusinessId();
    await branchContext.ensureLoaded();

    expect(secondId).toBe(BUSINESS_ID);
    expect(client.from).toHaveBeenCalledTimes(1);
  });

  it('ensureLoaded skips businesses entirely when already initialized for the same business', async () => {
    const branchContext = new BranchContextService();
    const client = supabaseDouble();
    attachClient(branchContext, client);

    await branchContext.ensureLoaded();
    expect(client.from).toHaveBeenCalledWith('businesses');
    const queriesAfterFirst = client.from.mock.calls.filter((call) => call[0] === 'businesses').length;
    expect(queriesAfterFirst).toBe(1);

    await branchContext.ensureLoaded();
    const queriesAfterSecond = client.from.mock.calls.filter((call) => call[0] === 'businesses').length;
    expect(queriesAfterSecond).toBe(1);
  });

  it('resetSession and resetBranchContextSession clear the holder so the next resolve queries businesses', async () => {
    const singleton = getBranchContextService();
    const client = supabaseDouble();
    attachClient(singleton, client);

    await singleton.getActiveBusinessId();
    expect(client.from).toHaveBeenCalledTimes(1);

    singleton.resetSession();
    attachClient(singleton, client);
    await singleton.getActiveBusinessId();
    expect(client.from).toHaveBeenCalledTimes(2);

    resetBranchContextSession();
    const next = getBranchContextService();
    attachClient(next, client);
    window.localStorage.setItem(ACTIVE_BUSINESS_STORAGE_KEY, BUSINESS_ID);
    await next.getActiveBusinessId();
    expect(client.from).toHaveBeenCalledTimes(3);
  });
});
