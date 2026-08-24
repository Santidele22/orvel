import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BranchContextService } from './branch-context.service';
import { ACTIVE_BUSINESS_STORAGE_KEY } from '../storage/browser-storage-keys';

const SESSION_BUSINESS_ID = 'business-session';
const STORED_BUSINESS_ID = 'business-stored';
const SESSION_BRANCH_ID = 'branch-session';
const STORED_BRANCH_ID = 'branch-stored';

function supabaseDouble(sessionBusinessId: string | null) {
  return {
    auth: {
      getSession: () => Promise.resolve({
        data: {
          session: {
            user: {
              id: 'user-1',
              user_metadata: sessionBusinessId ? { business_id: sessionBusinessId } : {}
            }
          }
        },
        error: null
      })
    },
    rpc: vi.fn((_fn: string, args?: Record<string, unknown>) => {
      const requested = typeof args?.['p_business_id'] === 'string' ? args['p_business_id'] : null;
      const branches = requested === SESSION_BUSINESS_ID
        ? [{ id: SESSION_BRANCH_ID, name: 'Principal', business_id: SESSION_BUSINESS_ID, is_active: true }]
        : requested === STORED_BUSINESS_ID
          ? [{ id: STORED_BRANCH_ID, name: 'Vieja', business_id: STORED_BUSINESS_ID, is_active: true }]
          : [];
      return Promise.resolve({ data: branches, error: null });
    })
  };
}

describe('BranchContext session business wins over stale storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('uses the signed-in business_id even if localStorage still has another business', async () => {
    window.localStorage.setItem(ACTIVE_BUSINESS_STORAGE_KEY, STORED_BUSINESS_ID);
    const branchContext = new BranchContextService();
    (branchContext as unknown as { supabaseClient: unknown }).supabaseClient = supabaseDouble(SESSION_BUSINESS_ID);

    await branchContext.refresh();

    expect(branchContext.activeBranchId()).toBe(SESSION_BRANCH_ID);
    expect(window.localStorage.getItem(ACTIVE_BUSINESS_STORAGE_KEY)).toBe(SESSION_BUSINESS_ID);
  });
});
