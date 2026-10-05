// @vitest-environment jsdom

import '@angular/compiler';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '@orvel/dashboard-core/auth/auth.service';
import {
  BranchContextService,
  getBranchContextService,
  resetBranchContextSession
} from '@orvel/dashboard-core/branches/branch-context.service';
import { ACTIVE_BUSINESS_STORAGE_KEY } from '@orvel/dashboard-core/storage/browser-storage-keys';
import { BusinessService } from './business.service';

const USER_ID = 'user-1';
const BUSINESS_ID = 'business-owned';
const BRANCH_ID = 'branch-owned';

function supabaseDouble(options: { delayMs?: number } = {}) {
  const delayMs = options.delayMs ?? 0;
  const owned = [{
    id: BUSINESS_ID,
    owner_id: USER_ID,
    slug: 'studio',
    name: 'Studio'
  }];

  const from = vi.fn((table: string) => {
    const listResult = table === 'businesses'
      ? { data: owned, error: null }
      : table === 'business_settings'
        ? { data: [{ business_id: BUSINESS_ID, buffer_minutes: 15 }], error: null }
        : table === 'profiles'
          ? { data: [{ first_name: 'Ada', last_name: 'Lovelace', phone: '' }], error: null }
          : (() => { throw new Error(`unexpected table ${table}`); })();

    const singleData = table === 'businesses'
      ? owned[0]
      : table === 'business_settings'
        ? { business_id: BUSINESS_ID, buffer_minutes: 15 }
        : { first_name: 'Ada', last_name: 'Lovelace', phone: '' };

    const query: {
      select: () => typeof query;
      eq: () => typeof query;
      order: () => Promise<{ data: unknown; error: null }>;
      maybeSingle: () => Promise<{ data: unknown; error: null }>;
    } = {
      select: () => query,
      eq: () => query,
      order: () => {
        if (delayMs <= 0 || table !== 'businesses') {
          return Promise.resolve(listResult);
        }
        return new Promise((resolve) => {
          setTimeout(() => resolve(listResult), delayMs);
        });
      },
      maybeSingle: () => Promise.resolve({ data: singleData, error: null })
    };
    return query;
  });

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
    from,
    rpc: vi.fn(() => Promise.resolve({
      data: [{ id: BRANCH_ID, name: 'Principal', business_id: BUSINESS_ID, is_active: true }],
      error: null
    }))
  };
}

function businessesCalls(client: ReturnType<typeof supabaseDouble>): number {
  return client.from.mock.calls.filter((call) => call[0] === 'businesses').length;
}

/**
 * Fase 1 of #1098: the branch context reads through its own port, so the same
 * SDK double is exposed to it as a port double — `businessesCalls` still counts
 * the one `from('businesses')` that actually happens.
 */
type BranchSourceDouble = {
  readSession: ReturnType<typeof vi.fn>;
  listDashboardBranches: ReturnType<typeof vi.fn>;
  listOwnedBusinesses: ReturnType<typeof vi.fn>;
};

function branchSourceDouble(client: ReturnType<typeof supabaseDouble>): BranchSourceDouble {
  return {
    readSession: vi.fn(async () => {
      const { data } = await client.auth.getSession();
      const user = data.session?.user;
      return user ? { userId: user.id, userMetadata: user.user_metadata } : null;
    }),
    listDashboardBranches: vi.fn(() =>
      Promise.resolve([{ id: BRANCH_ID, name: 'Principal', business_id: BUSINESS_ID, is_active: true }])
    ),
    listOwnedBusinesses: vi.fn(async () => {
      const query = client.from('businesses') as unknown as {
        select: () => { eq: () => { order: () => Promise<{ data: unknown }> } };
      };
      const result = await query.select().eq().order();
      return (result.data ?? []) as Array<{ id: string }>;
    })
  };
}

function attachBranchSource(service: BranchContextService, source: BranchSourceDouble): void {
  (service as unknown as { source: BranchSourceDouble }).source = source;
}

describe('BusinessService shares BranchContext session business identity', () => {
  beforeAll(() => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  });

  beforeEach(() => {
    window.localStorage.clear();
    resetBranchContextSession();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    resetBranchContextSession();
  });

  function createService(client: ReturnType<typeof supabaseDouble>): BusinessService {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        BusinessService,
        { provide: AuthService, useValue: { user: () => ({ id: USER_ID, plan: 'free' }) } }
      ]
    });
    const service = TestBed.inject(BusinessService);
    (service as unknown as { supabaseClient: unknown }).supabaseClient = client;
    return service;
  }

  it('two getActiveBusinessId calls in one session issue one businesses query total', async () => {
    const client = supabaseDouble();
    const service = createService(client);

    const first = await service.getActiveBusinessId();
    const second = await service.getActiveBusinessId();

    expect(first).toBe(BUSINESS_ID);
    expect(second).toBe(BUSINESS_ID);
    expect(businessesCalls(client)).toBe(1);
  });

  it('loadFromSupabase after identity is warm does not query businesses again', async () => {
    const client = supabaseDouble();
    const branchContext = getBranchContextService();
    attachBranchSource(branchContext, branchSourceDouble(client));
    const service = createService(client);

    await branchContext.ensureLoaded();
    const activeId = await branchContext.getActiveBusinessId();
    expect(activeId).toBe(BUSINESS_ID);
    expect(businessesCalls(client)).toBe(1);

    await service.getActiveBusinessId();
    await service.loadFromSupabase(BUSINESS_ID);

    expect(businessesCalls(client)).toBe(1);
    expect(service.getSnapshot()?.businessName).toBe('Studio');
    expect(service.getSnapshot()?.slug).toBe('studio');
  });

  it('stale localStorage still requires a first owned businesses lookup', async () => {
    window.localStorage.setItem(ACTIVE_BUSINESS_STORAGE_KEY, 'business-stale');
    const client = supabaseDouble();
    const service = createService(client);

    const id = await service.getActiveBusinessId('business-stale');

    expect(id).toBe(BUSINESS_ID);
    expect(businessesCalls(client)).toBe(1);
    expect(window.localStorage.getItem(ACTIVE_BUSINESS_STORAGE_KEY)).toBe(BUSINESS_ID);
  });

  it('cold concurrent BranchContext and BusinessService getActiveBusinessId share one businesses GET', async () => {
    const client = supabaseDouble({ delayMs: 40 });
    const branchContext = getBranchContextService();
    attachBranchSource(branchContext, branchSourceDouble(client));
    const service = createService(client);

    const [fromBranch, fromService] = await Promise.all([
      branchContext.getActiveBusinessId(),
      service.getActiveBusinessId()
    ]);

    expect(fromBranch).toBe(BUSINESS_ID);
    expect(fromService).toBe(BUSINESS_ID);
    expect(businessesCalls(client)).toBe(1);
  });
});
