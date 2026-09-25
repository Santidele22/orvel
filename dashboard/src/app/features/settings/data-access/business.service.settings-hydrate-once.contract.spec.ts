// @vitest-environment jsdom

import '@angular/compiler';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../services/auth.service';
import {
  getBranchContextService,
  resetBranchContextSession
} from '../../../core/branches/branch-context.service';
import { BusinessService } from './business.service';

const USER_ID = 'user-1';
const BUSINESS_ID = 'business-owned';

function supabaseDouble(options?: { gateSettingsAndProfiles?: boolean }) {
  let releaseGate = () => {};
  const gate = options?.gateSettingsAndProfiles
    ? new Promise<void>((resolve) => {
        releaseGate = resolve;
      })
    : Promise.resolve();

  const owned = [{
    id: BUSINESS_ID,
    owner_id: USER_ID,
    slug: 'studio',
    name: 'Studio'
  }];

  const hydrateGets = {
    business_settings: 0,
    profiles: 0
  };

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
      update: () => typeof query;
      upsert: () => Promise<{ data: null; error: null }>;
      then: (
        onFulfilled?: (value: { data: null; error: null }) => unknown,
        onRejected?: (reason: unknown) => unknown
      ) => Promise<unknown>;
    } = {
      select: () => query,
      eq: () => query,
      order: () => Promise.resolve(listResult),
      maybeSingle: async () => {
        if (table === 'business_settings' || table === 'profiles') {
          hydrateGets[table] += 1;
          await gate;
        }
        return { data: singleData, error: null };
      },
      update: () => query,
      upsert: () => Promise.resolve({ data: null, error: null }),
      then: (onFulfilled, onRejected) =>
        Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected)
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
    hydrateGets,
    releaseGate
  };
}

function tableCalls(client: ReturnType<typeof supabaseDouble>, table: string): number {
  return client.from.mock.calls.filter((call) => call[0] === table).length;
}

describe('BusinessService hydrates settings and profile once per session', () => {
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

  async function warmIdentity(client: ReturnType<typeof supabaseDouble>): Promise<void> {
    getBranchContextService().rememberSessionBusinessIdentity({
      ownerId: USER_ID,
      businessId: BUSINESS_ID,
      slug: 'studio',
      name: 'Studio'
    });
    void client;
  }

  it('coalesces overlapping loadFromSupabase before the snapshot exists into one settings GET and one profiles GET', async () => {
    const client = supabaseDouble({ gateSettingsAndProfiles: true });
    const service = createService(client);
    await warmIdentity(client);

    const first = service.loadFromSupabase(BUSINESS_ID);
    const second = service.loadFromSupabase(USER_ID);
    client.releaseGate();
    await Promise.all([first, second]);

    expect(tableCalls(client, 'business_settings')).toBe(1);
    expect(tableCalls(client, 'profiles')).toBe(1);
    expect(service.hasHydratedSnapshot(USER_ID)).toBe(true);
    expect(service.getSnapshot()?.firstName).toBe('Ada');
  });

  it('skips settings and profile GETs after a successful hydrate (Inicio then Config remount)', async () => {
    const client = supabaseDouble();
    const service = createService(client);
    await warmIdentity(client);

    await service.loadFromSupabase(USER_ID);
    expect(tableCalls(client, 'business_settings')).toBe(1);
    expect(tableCalls(client, 'profiles')).toBe(1);

    await service.loadFromSupabase(BUSINESS_ID);
    await service.loadFromSupabase(USER_ID);

    expect(tableCalls(client, 'business_settings')).toBe(1);
    expect(tableCalls(client, 'profiles')).toBe(1);
    expect(service.getSnapshot()?.businessName).toBe('Studio');
  });

  it('refetches settings and profile after clearCache, invalidate, and clearHydration', async () => {
    const client = supabaseDouble();
    const service = createService(client);
    await warmIdentity(client);

    await service.loadFromSupabase(BUSINESS_ID);
    expect(tableCalls(client, 'business_settings')).toBe(1);
    expect(tableCalls(client, 'profiles')).toBe(1);

    service.clearCache();
    await service.loadFromSupabase(BUSINESS_ID);
    expect(tableCalls(client, 'business_settings')).toBe(2);
    expect(tableCalls(client, 'profiles')).toBe(2);

    service.invalidate();
    await service.loadFromSupabase(BUSINESS_ID);
    expect(tableCalls(client, 'business_settings')).toBe(3);
    expect(tableCalls(client, 'profiles')).toBe(3);

    service.clearHydration();
    await service.loadFromSupabase(BUSINESS_ID);
    expect(tableCalls(client, 'business_settings')).toBe(4);
    expect(tableCalls(client, 'profiles')).toBe(4);
  });

  it('saveToSupabase invalidates and refetches settings and profile once', async () => {
    const client = supabaseDouble();
    const service = createService(client);
    await warmIdentity(client);

    await service.loadFromSupabase(BUSINESS_ID);
    expect(tableCalls(client, 'business_settings')).toBe(1);
    expect(tableCalls(client, 'profiles')).toBe(1);

    await service.saveToSupabase(BUSINESS_ID, {
      businessName: 'Studio',
      firstName: 'Ada',
      lastName: 'Lovelace',
      phone: ''
    });

    expect(client.hydrateGets.business_settings).toBe(2);
    expect(client.hydrateGets.profiles).toBe(2);
    expect(service.hasHydratedSnapshot(USER_ID)).toBe(true);
  });
});
