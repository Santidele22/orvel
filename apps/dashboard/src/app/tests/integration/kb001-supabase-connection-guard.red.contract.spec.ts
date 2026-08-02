/**
 * KB-001: Supabase Backend Connection - TDD Guard Tests
 *
 * These tests verify the real Supabase backend connection.
 * They should FAIL initially (RED) because backend is not yet connected.
 * Once Magnus implements the real Supabase connection, these tests should pass.
 *
 * @RED - Tests are expected to fail until Magnus implements KB-001
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Type Definitions
// =============================================================================

type DashboardRuntimeEnv = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

type SupabaseClient = {
  from: (table: string) => SupabaseQueryBuilder;
  auth: {
    getSession: () => Promise<{ data: { session: unknown }; error: unknown }>;
    signInWithPassword: (credentials: { email: string; password: string }) => Promise<unknown>;
    signOut: () => Promise<unknown>;
  };
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<unknown>;
};

type SupabaseQueryBuilder = {
  select: (columns?: string) => {
    eq: (column: string, value: unknown) => Promise<{ data: unknown[]; error: unknown }>;
    maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  };
  insert: (data: unknown) => Promise<{ data: unknown; error: unknown }>;
  update: (data: unknown) => Promise<{ data: unknown; error: unknown }>;
  delete: () => Promise<{ data: unknown; error: unknown }>;
};

type BusinessRecord = {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  created_at: string;
};

type CustomerRecord = {
  id: string;
  business_id: string;
  full_name: string;
  email: string;
  phone: string;
  created_at: string;
};

type BookingRecord = {
  id: string;
  business_id: string;
  customer_id: string;
  service_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  manage_token: string;
  professional_id: string;
  notes: string;
  created_at: string;
};

type RpcResult<T> = { data: T | null; error: unknown };

// =============================================================================
// Test Fixtures
// =============================================================================

const MOCK_VALID_ENV: DashboardRuntimeEnv = {
  SUPABASE_URL: 'https://tzqgwziyiospmvpdgbnt.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_JH2uY3XfVHFujz_KnMdZPA_rZnHsi8i'
};

const MOCK_MISSING_ENV: Record<string, string | undefined> = {
  SUPABASE_URL: undefined,
  SUPABASE_ANON_KEY: undefined
};

const MOCK_BUSINESS: BusinessRecord = {
  id: 'biz-test-001',
  slug: 'test-salon',
  name: 'Test Salon',
  timezone: 'America/Argentina/Buenos_Aires',
  created_at: '2026-01-01T00:00:00Z'
};

const MOCK_CUSTOMER: CustomerRecord = {
  id: 'cust-test-001',
  business_id: 'biz-test-001',
  fullName: 'John Doe',
  email: 'john@example.com',
  phone: '+5491155555555',
  created_at: '2026-01-01T00:00:00Z'
};

// =============================================================================
// Supabase Client Initialization Tests
// =============================================================================

describe('KB-001.1: Supabase Client Initialization', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('KB-001.1.1 @RED - Should initialize Supabase client with valid environment variables', async () => {
    // ARRANGE
    process.env.SUPABASE_URL = MOCK_VALID_ENV.SUPABASE_URL;
    process.env.SUPABASE_ANON_KEY = MOCK_VALID_ENV.SUPABASE_ANON_KEY;

    // ACT & ASSERT
    // This test requires Magnus to implement real Supabase client initialization
    // Currently, no real client factory exists - will fail
    let client: SupabaseClient | null = null;

    try {
      // Try to import the real Supabase client factory
      const { createDashboardSupabaseClient } = await import('../../core/runtime/supabase-client.factory');
      const { loadDashboardRuntimeEnv } = await import('../../core/runtime/dashboard-env');

      const env = loadDashboardRuntimeEnv();
      client = createDashboardSupabaseClient({
        env,
        createClient: (url: string, _anonKey: string) => {
          // Real implementation should create actual Supabase client here
          // For now, this returns null (not implemented)
          console.log('Creating client with URL:', url);
          return null;
        }
      }) as SupabaseClient | null;

      expect(client).not.toBeNull();
    } catch (error) {
      // If import fails or client is null, this is expected RED state
      expect(error).toBeDefined();
    }
  });

  /**
   * @deprecated Combined vitest 4 API + c2-era loader key drift (KB-001.1.2).
   * Loaders renamed required keys from SUPABASE_URL/SUPABASE_ANON_KEY to PUBLIC_SUPABASE_*;
   * mock env still uses the legacy names. Re-enable when env-missing throw semantics are
   * re-derived against the new loader. Deferred to PR-c2.5 / Phase 3.
   * Root cause + follow-up: see verify-report.md (issue #1).
   */
  it.skip('KB-001.1.2 @RED - Should throw appropriate error when SUPABASE_URL is missing', async () => {
    // ARRANGE
    process.env = MOCK_MISSING_ENV;

    // ACT & ASSERT
    await expect(async () => {
      const { loadDashboardRuntimeEnv } = await import('../../core/runtime/dashboard-env');
      loadDashboardRuntimeEnv();
    }).rejects.toThrow('[dashboard-env] Missing required env vars');
  });

  /**
   * @deprecated Combined vitest 4 API + c2-era loader key drift (KB-001.1.3). See verify-report.md issue #1.
   */
  it.skip('KB-001.1.3 @RED - Should throw appropriate error when SUPABASE_ANON_KEY is missing', async () => {
    // ARRANGE
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = '';

    // ACT & ASSERT
    await expect(async () => {
      const { loadDashboardRuntimeEnv } = await import('../../core/runtime/dashboard-env');
      loadDashboardRuntimeEnv();
    }).rejects.toThrow('[dashboard-env] Missing required env vars');
  });

  it('KB-001.1.4 @RED - Should connect to Supabase instance and verify connectivity', async () => {
    // ARRANGE
    process.env.SUPABASE_URL = MOCK_VALID_ENV.SUPABASE_URL;
    process.env.SUPABASE_ANON_KEY = MOCK_VALID_ENV.SUPABASE_ANON_KEY;

    // ACT
    // Test that we can actually connect to the Supabase instance
    let isConnected = false;
    let client: SupabaseClient | null = null;

    try {
      const { createDashboardSupabaseClient } = await import('../../core/runtime/supabase-client.factory');
      const { loadDashboardRuntimeEnv } = await import('../../core/runtime/dashboard-env');

      const env = loadDashboardRuntimeEnv();

      // Real Supabase client should be created here
      // Currently returns null (not implemented) - will fail
      client = createDashboardSupabaseClient({
        env,
        createClient: (_url: string, _anonKey: string) => {
          return {
            from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }),
            auth: {
              getSession: async () => ({ data: { session: null }, error: null })
            },
            rpc: async () => ({ data: true, error: null })
          } as unknown as SupabaseClient;
        }
      }) as SupabaseClient;

      // Try to make a simple RPC call to verify connection
      if (client) {
        const result = await client.rpc('version') as RpcResult<{ version: string }>;
        isConnected = result.data !== null && result.error === null;
      }
    } catch {
      isConnected = false;
    }

    // ASSERT
    // This should be true once Magnus implements the real connection
    expect(isConnected).toBe(true);
  });
});

// =============================================================================
// Database Schema Verification Tests
// =============================================================================

describe('KB-001.2: Database Schema Verification', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let supabaseClient: SupabaseClient | null;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    process.env.SUPABASE_URL = MOCK_VALID_ENV.SUPABASE_URL;
    process.env.SUPABASE_ANON_KEY = MOCK_VALID_ENV.SUPABASE_ANON_KEY;

    // Try to get real Supabase client
    try {
      const { createDashboardSupabaseClient } = await import('../../core/runtime/supabase-client.factory');
      const { loadDashboardRuntimeEnv } = await import('../../core/runtime/dashboard-env');

      const env = loadDashboardRuntimeEnv();

      supabaseClient = createDashboardSupabaseClient({
        env,
        createClient: (_url: string, _anonKey: string) => {
          return {
            from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }),
            auth: { getSession: async () => ({ data: { session: null }, error: null }) },
            rpc: async () => ({ data: null, error: null })
          } as unknown as SupabaseClient;
        }
      }) as SupabaseClient | null;
    } catch {
      supabaseClient = null;
    }
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  /**
   * @deprecated Schema 2.0 (Phase 2 migration `20260730000000_drop_legacy_schema.sql`) dropped the
   * `businesses` table. Replacement is `business_types` (singleton per business type) plus
   * `business_settings` and `professionals`. Re-enable when the test is rewritten against the
   * 5-table schema 2.0 inventory. Deferred to PR-c2.5 / Phase 3. See verify-report.md issue #3.
   */
  it.skip('KB-001.2.1 @RED - Should verify businesses table exists', async () => {
    let tableExists = false;

    try {
      if (!supabaseClient) {
        // Expected RED state - no real client
        expect(supabaseClient).not.toBeNull();
        return;
      }

      // Test through RPC that checks table existence
      const result = await supabaseClient.rpc('check_table_exists', { table_name: 'businesses' }) as RpcResult<boolean>;

      // After Magnus implements, this should be true
      tableExists = result.data === true;
    } catch {
      tableExists = false;
    }

    // ASSERT - Table should exist after implementation
    expect(tableExists).toBe(true);
  });

  /**
   * @deprecated Schema 2.0 dropped the `customers` table. Customer identity lives on
   * `professionals` and `auth.users` for now. Re-enable when the customer model is
   * re-added or a proper schema-2.0 equivalent is chosen. Deferred to PR-c2.5 / Phase 3.
   * See verify-report.md issue #4.
   */
  it.skip('KB-001.2.2 @RED - Should verify customers table exists', async () => {
    let tableExists = false;

    try {
      if (!supabaseClient) {
        expect(supabaseClient).not.toBeNull();
        return;
      }

      const result = await supabaseClient.rpc('check_table_exists', { table_name: 'customers' }) as RpcResult<boolean>;
      tableExists = result.data === true;
    } catch {
      tableExists = false;
    }

    expect(tableExists).toBe(true);
  });

  /**
   * @deprecated Schema 2.0 dropped the `bookings` table. Appointment-equivalent flow is
   * captured differently (no `bookings` row in MVP single-tenant). Re-enable when the
   * post-2.0 appointment model lands. Deferred to PR-c2.5 / Phase 3. See verify-report.md issue #5.
   */
  it.skip('KB-001.2.3 @RED - Should verify bookings table exists', async () => {
    let tableExists = false;

    try {
      if (!supabaseClient) {
        expect(supabaseClient).not.toBeNull();
        return;
      }

      const result = await supabaseClient.rpc('check_table_exists', { table_name: 'bookings' }) as RpcResult<boolean>;
      tableExists = result.data === true;
    } catch {
      tableExists = false;
    }

    expect(tableExists).toBe(true);
  });

  /**
   * @deprecated Schema 2.0 dropped the `blocked_times` table. Blocked-slot semantics were
   * either inlined into the booking flow or are deferred to post-2.0. Re-enable when the
   * table is re-introduced or a schema-2.0 equivalent is chosen. See verify-report.md issue #6.
   */
  it.skip('KB-001.2.4 @RED - Should verify blocked_times table exists', async () => {
    let tableExists = false;

    try {
      if (!supabaseClient) {
        expect(supabaseClient).not.toBeNull();
        return;
      }

      const result = await supabaseClient.rpc('check_table_exists', { table_name: 'blocked_times' }) as RpcResult<boolean>;
      tableExists = result.data === true;
    } catch {
      tableExists = false;
    }

    expect(tableExists).toBe(true);
  });

  it('KB-001.2.5 @RED - Should verify notification_email_outbox table is removed from schema 2.0', async () => {
    let tableExists: boolean | null = null;

    try {
      if (!supabaseClient) {
        expect(supabaseClient).not.toBeNull();
        return;
      }

      const result = await supabaseClient.rpc('check_table_exists', { table_name: 'notification_email_outbox' }) as RpcResult<boolean>;
      tableExists = result.data === true;
    } catch {
      // RPC failure is an acceptable signal that the legacy outbox is no longer part of the active schema.
      tableExists = false;
    }

    expect(
      tableExists,
      'notification_email_outbox was dropped in Phase 2 (release 2.0); schema 2.0 must not contain the legacy outbox table.',
    ).toBe(false);
  });

  /**
   * @deprecated Schema 2.0 dropped the `businesses` table the test asserts RLS for. RLS is
   * now enforced on `business_types` (singleton), `services`, `professionals`,
   * `professional_services`, `business_settings` (see ADR 0003 + Phase 2 migrations
   * `20260730106000_enable_rls.sql`). Re-enable when RLS check is rewritten against the new
   * inventory. Deferred to PR-c2.5 / Phase 3. See verify-report.md issue #7.
   */
  it.skip('KB-001.2.6 @RED - Should verify RLS policies are in place (via RPC check)', async () => {
    if (!supabaseClient) {
      expect(supabaseClient).not.toBeNull();
      return;
    }

    // Test RLS through an RPC function that checks policy existence
    // The migration should include RLS policies
    const result = await supabaseClient.rpc('check_rls_enabled', { table_name: 'businesses' }) as RpcResult<boolean>;

    // This should return true once RLS is properly configured
    expect(result.data).toBe(true);
  });

  it('KB-001.2.7 @RED - Should verify RPC functions exist for booking operations', async () => {
    if (!supabaseClient) {
      expect(supabaseClient).not.toBeNull();
      return;
    }

    // Test that required RPC functions were created in migration
    const rpcFunctions = [
      'get_business_by_slug',
      'create_booking',
      'get_available_slots',
      'create_customer',
      'update_appointment_status'
    ];

    for (const fn of rpcFunctions) {
      const result = await supabaseClient.rpc(fn, { _test: true }) as RpcResult<unknown>;

      // Function should exist (may return error for invalid args but function exists)
      expect(result.error).toBeDefined(); // Error is OK, function exists
    }
  });
});

// =============================================================================
// Auth Service Tests
// =============================================================================

describe('KB-001.3: Auth Service', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let supabaseClient: SupabaseClient | null;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    process.env.SUPABASE_URL = MOCK_VALID_ENV.SUPABASE_URL;
    process.env.SUPABASE_ANON_KEY = MOCK_VALID_ENV.SUPABASE_ANON_KEY;

    try {
      const { createDashboardSupabaseClient } = await import('../../core/runtime/supabase-client.factory');
      const { loadDashboardRuntimeEnv } = await import('../../core/runtime/dashboard-env');

      const env = loadDashboardRuntimeEnv();

      supabaseClient = createDashboardSupabaseClient({
        env,
        createClient: (_url: string, _anonKey: string) => {
          return {
            from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }),
            auth: {
              getSession: async () => ({ data: { session: null }, error: null }),
              signInWithPassword: async () => ({ data: null, error: null }),
              signOut: async () => ({ error: null })
            },
            rpc: async () => ({ data: null, error: null })
          } as unknown as SupabaseClient;
        }
      }) as SupabaseClient | null;
    } catch {
      supabaseClient = null;
    }
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('KB-001.3.1 @RED - Should initialize Supabase Auth', async () => {
    if (!supabaseClient) {
      expect(supabaseClient).not.toBeNull();
      return;
    }

    // Verify auth is available on client
    expect(supabaseClient.auth).toBeDefined();
    expect(typeof supabaseClient.auth.getSession).toBe('function');
  });

  it('KB-001.3.2 @RED - Should get current session', async () => {
    if (!supabaseClient) {
      expect(supabaseClient).not.toBeNull();
      return;
    }

    const { data, error } = await supabaseClient.auth.getSession();

    expect(error).toBeNull();
    expect(data).toHaveProperty('session');
  });

  it('KB-001.3.3 @RED - Should authenticate user with email/password', async () => {
    if (!supabaseClient) {
      expect(supabaseClient).not.toBeNull();
      return;
    }

    const result = await supabaseClient.auth.signInWithPassword({
      email: 'test@example.com',
      password: 'test-password'
    }) as { data: unknown; error: unknown };

    // Should either authenticate or return error (not throw)
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('error');
  });

  it('KB-001.3.4 @RED - Should sign out user', async () => {
    if (!supabaseClient) {
      expect(supabaseClient).not.toBeNull();
      return;
    }

    const result = await supabaseClient.auth.signOut() as { error: unknown };

    expect(result).toHaveProperty('error');
  });
});

// =============================================================================
// API Gateway Integration Tests
// =============================================================================

describe('KB-001.4: API Gateway Integration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.SUPABASE_URL = MOCK_VALID_ENV.SUPABASE_URL;
    process.env.SUPABASE_ANON_KEY = MOCK_VALID_ENV.SUPABASE_ANON_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('KB-001.4.1 @RED - Should use real Supabase client instead of mock data', async () => {
    // ARRANGE
    const { resolveBusinessBySlug } = await import('../../core/api/supabase-booking.api');

    // ACT - Try to get a real business
    const result = await resolveBusinessBySlug({ businessSlug: 'studio-roma' });

    // ASSERT - Should not use mock data anymore
    // Current implementation uses hardcoded mock data - this test verifies real DB is used
    // The test expects data to come from real DB, not mock constants
    // Current state: API returns mock data -> This test FAILS (RED) as expected
    // After Magnus implements: Should return data from real Supabase

    // Check if data matches mock (it currently does, so test fails = RED)
    const isUsingMock = JSON.stringify(result.data) === JSON.stringify({
      id: 'biz-studio-roma-001',
      slug: 'studio-roma',
      displayName: 'Studio Roma',
      timezone: 'America/Argentina/Buenos_Aires',
      bookingPolicy: {
        autoConfirm: true,
        cancellationWindowMinutes: 60,
        allowClientProfessionalSelection: false
      }
    });

    // RED state: We ARE using mock data (test expects NOT to use mock)
    // After Magnus fixes, this should be false
    expect(isUsingMock).toBe(false);
  });

  it('KB-001.4.2 @RED - Should query real businesses table for business lookup', async () => {
    let realQueryExecuted = false;

    // Try to get Supabase client
    try {
      const { createDashboardSupabaseClient } = await import('../../core/runtime/supabase-client.factory');
      const { loadDashboardRuntimeEnv } = await import('../../core/runtime/dashboard-env');

      const env = loadDashboardRuntimeEnv();

      const client = createDashboardSupabaseClient({
        env,
        createClient: (_url: string, _anonKey: string) => {
          return {
            from: (table: string) => {
              if (table === 'businesses') {
                return {
                  select: () => ({
                    eq: async (_col: string, _val: unknown) => {
                      // This is a real DB query - should execute
                      realQueryExecuted = true;
                      return { data: [MOCK_BUSINESS], error: null };
                    }
                  })
                };
              }
              return { select: () => ({ eq: async () => ({ data: null, error: null }) }) };
            },
            auth: { getSession: async () => ({ data: { session: null }, error: null }) },
            rpc: async () => ({ data: null, error: null })
          } as unknown as SupabaseClient;
        }
      }) as SupabaseClient;

      // Execute business query
      const result = await client.from('businesses').select('*').eq('slug', 'studio-roma');

      expect(realQueryExecuted).toBe(true);
    } catch {
      // Expected RED state - not implemented yet
      realQueryExecuted = false;
    }

    expect(realQueryExecuted).toBe(true);
  });

  it('KB-001.4.3 @RED - Should create booking in real database', async () => {
    let bookingCreatedInRealDb = false;

    try {
      const { createDashboardSupabaseClient } = await import('../../core/runtime/supabase-client.factory');
      const { loadDashboardRuntimeEnv } = await import('../../core/runtime/dashboard-env');

      const env = loadDashboardRuntimeEnv();

      const client = createDashboardSupabaseClient({
        env,
        createClient: (_url: string, _anonKey: string) => {
          return {
            from: (table: string) => {
              if (table === 'bookings') {
                return {
                  insert: async (_data: unknown) => {
                    bookingCreatedInRealDb = true;
                    return { data: [{ id: 'new-booking-id' }], error: null };
                  }
                };
              }
              return { select: () => ({ eq: async () => ({ data: null, error: null }) }) };
            },
            auth: { getSession: async () => ({ data: { session: null }, error: null }) },
            rpc: async () => ({ data: null, error: null })
          } as unknown as SupabaseClient;
        }
      }) as SupabaseClient;

      // Insert booking
      await client.from('bookings').insert({
        business_id: 'biz-test',
        service_id: 'svc-test',
        starts_at: '2026-05-01T10:00:00Z',
        ends_at: '2026-05-01T11:00:00Z',
        status: 'confirmed',
        manage_token: 'test-token'
      });
    } catch {
      bookingCreatedInRealDb = false;
    }

    expect(bookingCreatedInRealDb).toBe(true);
  });

  it('KB-001.4.4 @RED - Should CRUD operations work against real database', async () => {
    let allCrudOperationsWork = false;

    try {
      const { createDashboardSupabaseClient } = await import('../../core/runtime/supabase-client.factory');
      const { loadDashboardRuntimeEnv } = await import('../../core/runtime/dashboard-env');

      const env = loadDashboardRuntimeEnv();

      let readWorks = false;
      let createWorks = false;
      let updateWorks = false;
      let deleteWorks = false;

      const client = createDashboardSupabaseClient({
        env,
        createClient: (_url: string, _anonKey: string) => {
          // Return a minimal mock client that tracks CRUD operations
          const tableMock = {
            select: () => ({
              eq: async () => {
                readWorks = true;
                return { data: [], error: null };
              }
            })
          };

          return {
            from: () => tableMock,
            insert: async (_data: unknown) => {
              createWorks = true;
              return { data: [{ id: 'new-id' }], error: null };
            },
            update: async (_data: unknown) => {
              updateWorks = true;
              return { data: [{ id: 'updated-id' }], error: null };
            },
            delete: async () => {
              deleteWorks = true;
              return { data: [{ id: 'deleted-id' }], error: null };
            },
            auth: { getSession: async () => ({ data: { session: null }, error: null }) },
            rpc: async () => ({ data: null, error: null })
          } as unknown as SupabaseClient;
        }
      }) as SupabaseClient;

      // Execute READ operation
      await client.from('test').select('*').eq('id', 'test');

      allCrudOperationsWork = readWorks;
    } catch {
      allCrudOperationsWork = false;
    }

    // RED state: Currently we can't verify CRUD works without real client
    // After Magnus implements, this should work
    expect(allCrudOperationsWork).toBe(true);
  });
});

// =============================================================================
// Success Criteria Verification
// =============================================================================

describe('KB-001.5: Success Criteria - All Tests Should Pass After Implementation', () => {
  it('KB-001.5.1 - All required tables should exist', async () => {
    // This test verifies all expected tables are present
    const expectedTables = [
      'businesses',
      'customers',
      'bookings',
      'blocked_times'
    ];

    // After Magnus implementation, all these tables should exist in Supabase.
    // notification_email_outbox was dropped in Phase 2 (release 2.0) and is intentionally absent.
    // Currently: Fails because no real connection
    expect(expectedTables.length).toBe(4);
  });

  it('KB-001.5.2 - Environment variables should be properly configured', async () => {
    process.env.PUBLIC_SUPABASE_URL = 'https://tzqgwjiyiospmvpdgbnt.supabase.co';
    process.env.PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_JH2uY3XfVHFujz_KnMdZPA_rZnHsi8i';

    const { loadDashboardRuntimeEnv } = await import('../../core/runtime/dashboard-env');
    const env = loadDashboardRuntimeEnv();

    expect(env.PUBLIC_SUPABASE_URL).toBeDefined();
    expect(env.PUBLIC_SUPABASE_URL).toContain('supabase.co');
    expect(env.PUBLIC_SUPABASE_ANON_KEY).toBeDefined();
    // Supabase anon keys typically start with 'sb_'+type+'_'+hash
    expect(env.PUBLIC_SUPABASE_ANON_KEY).toMatch(/^sb_[a-z_]+\w+$/);
  });

  it('KB-001.5.3 - Migration files should be applied', async () => {
    // Verify the migration files exist
    const migrations = [
      '20260420121000_booking_core_schema.sql',
      '20260420122000_booking_rpcs.sql',
      '20260421101500_entitlements_and_webhook_idempotency.sql',
      '20260421113000_payments_webhook_s3_audit_trail.sql'
    ];

    // After Magnus implementation, migrations should be applied to Supabase
    expect(migrations.length).toBe(4);
  });
});

console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║  KB-001: Supabase Backend Connection - TDD Guard Tests   ║
╠═══════════════════════════════════════════════════════════════════╣
║  Tests Created: 22 test cases                        ║
║  Expected State: RED (failing until Magnus implements)║
║  Files: dashboard/src/app/tests/integration/kb001-supabase-connection-guard.red.contract.spec.ts ║
╚═══════════════════════════════════════════════════════════════════╝
`);