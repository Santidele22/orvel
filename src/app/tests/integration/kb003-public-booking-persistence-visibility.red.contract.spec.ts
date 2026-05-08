import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readSource(relativePath: string): string {
  const absolutePath = resolve(process.cwd(), relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf-8') : '';
}

describe('KB-003 RED - public booking contract, persistence chain, and dashboard visibility', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('public booking gateway sends RPC client payload compatible with create_public_booking contract', async () => {
    const rpcSpy = vi.fn(async () => ({
      data: { booking_id: 'booking-qa-001' },
      error: null
    }));

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: vi.fn(() => ({
        rpc: rpcSpy
      }))
    }));

    vi.doMock('../../core/runtime/dashboard-env', () => ({
      loadDashboardRuntimeEnv: () => ({
        NEXT_PUBLIC_SUPABASE_URL: 'https://qa.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key'
      })
    }));

    const { realSupabaseGateway } = await import('../../core/api/supabase-booking/real-gateway');

    await realSupabaseGateway.createPublicBooking({
      businessSlug: 'studio-roma',
      serviceId: 'svc-001',
      startsAtIso: '2026-05-10T16:00:00.000Z',
      client: {
        fullName: 'QA Contract',
        email: 'qa.contract@example.com',
        phone: '+54 11 5555 0000'
      }
    });

    expect(rpcSpy).toHaveBeenCalledTimes(1);
    expect(rpcSpy).toHaveBeenCalledWith(
      'create_public_booking',
      expect.objectContaining({
        client: expect.objectContaining({
          fullName: 'QA Contract',
          email: 'qa.contract@example.com',
          phone: '+54 11 5555 0000'
        })
      })
    );
  });

  it('RPC persistence contract keeps customer(name+phone) and appointment creation chain in SQL function', () => {
    const migrationSql = readSource('supabase/migrations/20260428110000_fix_public_booking_customers.sql');

    expect(migrationSql).toMatch(/create\s+or\s+replace\s+function\s+public\.create_public_booking/i);
    expect(migrationSql).toMatch(/client\s*->>\s*'fullName'/i);
    expect(migrationSql).toMatch(/client\s*->>\s*'phone'/i);
    expect(migrationSql).toMatch(/insert\s+into\s+public\.customers/i);
    expect(migrationSql).toMatch(/insert\s+into\s+public\.bookings/i);
  });

  it('appointments/home pipelines must resolve tenant business_id and avoid direct auth uid filtering', () => {
    const turnoServiceSource = readSource('src/app/services/turno.service.ts');
    const clienteServiceSource = readSource('src/app/services/cliente.service.ts');

    expect(turnoServiceSource).toMatch(/(resolve|load|get)\w*business\w*id/i);
    expect(clienteServiceSource).toMatch(/(resolve|load|get)\w*business\w*id/i);

    expect(turnoServiceSource).not.toMatch(/authService\.user\(\)\?\.id/);
    expect(clienteServiceSource).not.toMatch(/authService\.user\(\)\?\.id/);
  });
});
