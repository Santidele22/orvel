import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

function readRuntimeInitSource(): string {
  const runtimeInitPath = resolve(process.cwd(), 'src/app/core/runtime/supabase-booking.runtime-init.ts');
  const clientFactoryPath = resolve(process.cwd(), 'src/app/core/runtime/supabase-client.factory.ts');

  return `${readFileSync(runtimeInitPath, 'utf-8')}\n${readFileSync(clientFactoryPath, 'utf-8')}`;
}

describe('Supabase runtime hardening RED contract (official client path)', () => {
  it('keeps runtime init delegated to bootstrap wiring contracts', async () => {
    vi.resetModules();

    const bootstrapResult = { status: 'ok', provider: 'supabase' } as const;
    const bootstrapDashboardBookingGateway = vi.fn(() => bootstrapResult);
    const loadDashboardRuntimeEnv = vi.fn(() => ({
      SUPABASE_URL: 'https://qa-runtime.supabase.co',
      SUPABASE_ANON_KEY: 'qa-anon-key'
    }));
    const createSupabaseBookingGateway = vi.fn(() => ({
      resolveBusinessBySlug: vi.fn(),
      createPublicBooking: vi.fn(),
      manageBookingByToken: vi.fn(),
      createAdminManualBooking: vi.fn(),
      createAdminBlockedTime: vi.fn()
    }));
    const setSupabaseBookingGateway = vi.fn();

    vi.doMock('../../core/runtime/supabase-booking.bootstrap', () => ({
      bootstrapDashboardBookingGateway
    }));
    vi.doMock('../../core/runtime/dashboard-env', () => ({
      loadDashboardRuntimeEnv
    }));
    vi.doMock('../../core/api/supabase-booking.gateway', () => ({
      createSupabaseBookingGateway
    }));
    vi.doMock('../../core/api/supabase-booking.api', () => ({
      setSupabaseBookingGateway
    }));

    const runtimeInit = await import('../../core/runtime/supabase-booking.runtime-init');
    const result = runtimeInit.initializeDashboardSupabaseBookingGateway();

    expect(result).toEqual(bootstrapResult);
    expect(bootstrapDashboardBookingGateway).toHaveBeenCalledTimes(1);

    const deps = bootstrapDashboardBookingGateway.mock.calls[0]?.[0];
    expect(deps).toEqual(
      expect.objectContaining({
        loadDashboardRuntimeEnv,
        createSupabaseBookingGateway,
        setSupabaseBookingGateway,
        createDashboardSupabaseClient: expect.any(Function)
      })
    );
  });

  it('builds runtime client from official @supabase/supabase-js path', () => {
    // TODO(Magnus): wire runtime client creation through createClient from @supabase/supabase-js.
    const source = readRuntimeInitSource();

    expect(source).toMatch(/from\s+['"]@supabase\/supabase-js['"]/);
    expect(source).toMatch(/\bcreateClient\s*\(/);
  });
});
