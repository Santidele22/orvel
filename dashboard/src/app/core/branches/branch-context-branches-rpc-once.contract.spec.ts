import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BranchContextService,
  getBranchContextService,
  resetBranchContextSession
} from './branch-context.service';

const USER_ID = 'user-1';
const BUSINESS_ID = 'business-owned';
const BRANCH_ID = 'branch-owned';

function supabaseDouble() {
  return {
    auth: {
      getSession: () => Promise.resolve({
        data: {
          session: {
            user: {
              id: USER_ID,
              user_metadata: { business_id: BUSINESS_ID }
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
              data: [{
                id: BUSINESS_ID,
                owner_id: USER_ID,
                slug: 'studio',
                name: 'Studio'
              }],
              error: null
            })
          })
        })
      };
    }),
    rpc: vi.fn((fn: string, args?: Record<string, unknown>) => {
      if (fn !== 'get_dashboard_branches') {
        throw new Error(`unexpected rpc ${fn}`);
      }

      expect(args?.['p_business_id']).toBe(BUSINESS_ID);
      return Promise.resolve({
        data: [{ id: BRANCH_ID, name: 'Principal', business_id: BUSINESS_ID, is_active: true }],
        error: null
      });
    })
  };
}

function attachClient(service: BranchContextService, client: ReturnType<typeof supabaseDouble>): void {
  (service as unknown as { supabaseClient: unknown }).supabaseClient = client;
}

function branchRpcCount(client: ReturnType<typeof supabaseDouble>): number {
  return client.rpc.mock.calls.filter((call) => call[0] === 'get_dashboard_branches').length;
}

describe('BranchContext skips get_dashboard_branches when the branch id is warm', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetBranchContextSession();
  });

  it('two ensureLoaded calls on a 1-branch tenant issue exactly one get_dashboard_branches RPC', async () => {
    const branchContext = new BranchContextService();
    const client = supabaseDouble();
    attachClient(branchContext, client);

    await branchContext.ensureLoaded();
    await branchContext.ensureLoaded();

    expect(branchContext.activeBranchId()).toBe(BRANCH_ID);
    expect(branchRpcCount(client)).toBe(1);
  });

  it('further ensureLoaded does not RPC after activeBranchId is set even if getActiveBusinessId is also called', async () => {
    const branchContext = new BranchContextService();
    const client = supabaseDouble();
    attachClient(branchContext, client);

    await branchContext.ensureLoaded();
    expect(branchContext.activeBranchId()).toBe(BRANCH_ID);
    expect(branchRpcCount(client)).toBe(1);

    await branchContext.getActiveBusinessId();
    await branchContext.ensureLoaded();

    expect(branchRpcCount(client)).toBe(1);
  });

  it('resetSession and resetBranchContextSession make the next ensureLoaded RPC again', async () => {
    const singleton = getBranchContextService();
    const client = supabaseDouble();
    attachClient(singleton, client);

    await singleton.ensureLoaded();
    expect(branchRpcCount(client)).toBe(1);

    singleton.resetSession();
    attachClient(singleton, client);
    await singleton.ensureLoaded();
    expect(branchRpcCount(client)).toBe(2);

    resetBranchContextSession();
    const next = getBranchContextService();
    attachClient(next, client);
    await next.ensureLoaded();
    expect(branchRpcCount(client)).toBe(3);
  });
});
