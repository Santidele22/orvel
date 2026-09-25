import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BranchContextService } from './branch-context.service';
import { ACTIVE_BUSINESS_STORAGE_KEY } from '../storage/browser-storage-keys';

const USER_ID = 'user-1';
const SESSION_BUSINESS_ID = 'business-session';
const STORED_BUSINESS_ID = 'business-stored';
const OWNED_BUSINESS_ID = 'business-owned';
const SESSION_BRANCH_ID = 'branch-session';
const STORED_BRANCH_ID = 'branch-stored';
const OWNED_BRANCH_ID = 'branch-owned';

function supabaseDouble(options: {
  sessionBusinessId?: string | null;
  ownedBusinessIds?: string[];
} = {}) {
  const sessionBusinessId = options.sessionBusinessId ?? null;
  const ownedBusinessIds = options.ownedBusinessIds ?? (sessionBusinessId ? [sessionBusinessId] : []);

  return {
    auth: {
      getSession: () => Promise.resolve({
        data: {
          session: {
            user: {
              id: USER_ID,
              user_metadata: sessionBusinessId ? { business_id: sessionBusinessId } : {}
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
              data: ownedBusinessIds.map((id) => ({ id })),
              error: null
            })
          })
        })
      };
    }),
    rpc: vi.fn((_fn: string, args?: Record<string, unknown>) => {
      const requested = typeof args?.['p_business_id'] === 'string' ? args['p_business_id'] : null;
      const branches = requested === SESSION_BUSINESS_ID
        ? [{ id: SESSION_BRANCH_ID, name: 'Principal', business_id: SESSION_BUSINESS_ID, is_active: true }]
        : requested === STORED_BUSINESS_ID
          ? [{ id: STORED_BRANCH_ID, name: 'Vieja', business_id: STORED_BUSINESS_ID, is_active: true }]
          : requested === OWNED_BUSINESS_ID
            ? [{ id: OWNED_BRANCH_ID, name: 'Principal', business_id: OWNED_BUSINESS_ID, is_active: true }]
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
    (branchContext as unknown as { supabaseClient: unknown }).supabaseClient = supabaseDouble({
      sessionBusinessId: SESSION_BUSINESS_ID
    });

    await branchContext.refresh();

    expect(branchContext.activeBranchId()).toBe(SESSION_BRANCH_ID);
    expect(window.localStorage.getItem(ACTIVE_BUSINESS_STORAGE_KEY)).toBe(SESSION_BUSINESS_ID);
  });

  it('uses the owned business when metadata is missing and localStorage is from another account', async () => {
    window.localStorage.setItem(ACTIVE_BUSINESS_STORAGE_KEY, STORED_BUSINESS_ID);
    const branchContext = new BranchContextService();
    (branchContext as unknown as { supabaseClient: unknown }).supabaseClient = supabaseDouble({
      sessionBusinessId: null,
      ownedBusinessIds: [OWNED_BUSINESS_ID]
    });

    await branchContext.refresh();

    expect(branchContext.activeBranchId()).toBe(OWNED_BRANCH_ID);
    expect(window.localStorage.getItem(ACTIVE_BUSINESS_STORAGE_KEY)).toBe(OWNED_BUSINESS_ID);
  });

  it('ignores metadata that is the auth user id when the owned business is a different uuid', async () => {
    window.localStorage.setItem(ACTIVE_BUSINESS_STORAGE_KEY, USER_ID);
    const branchContext = new BranchContextService();
    (branchContext as unknown as { supabaseClient: unknown }).supabaseClient = supabaseDouble({
      sessionBusinessId: USER_ID,
      ownedBusinessIds: [OWNED_BUSINESS_ID]
    });

    await branchContext.refresh();

    expect(branchContext.activeBranchId()).toBe(OWNED_BRANCH_ID);
    expect(window.localStorage.getItem(ACTIVE_BUSINESS_STORAGE_KEY)).toBe(OWNED_BUSINESS_ID);
  });

  it('overlapping ensureLoaded callers wait until refresh sets the active branch', async () => {
    const branchContext = new BranchContextService();
    let resolveRpc!: (value: unknown) => void;
    const rpcGate = new Promise((resolve) => {
      resolveRpc = resolve;
    });
    const double = supabaseDouble({ sessionBusinessId: SESSION_BUSINESS_ID });
    double.rpc = vi.fn(() =>
      rpcGate.then(() => ({
        data: [{ id: SESSION_BRANCH_ID, name: 'Principal', business_id: SESSION_BUSINESS_ID, is_active: true }],
        error: null
      }))
    );
    (branchContext as unknown as { supabaseClient: unknown }).supabaseClient = double;

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

    resolveRpc(undefined);
    await Promise.all([first, second]);

    expect(secondSawBranch).toBe(SESSION_BRANCH_ID);
    expect(branchContext.getActiveBranchId()).toBe(SESSION_BRANCH_ID);
  });
});
