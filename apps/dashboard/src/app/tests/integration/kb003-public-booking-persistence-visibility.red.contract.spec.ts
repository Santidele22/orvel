import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readSource(relativePath: string): string {
  const absolutePath = resolve(process.cwd(), relativePath);
  if (existsSync(absolutePath)) return readFileSync(absolutePath, 'utf-8');

  const monorepoPath = resolve(process.cwd(), '..', '..', relativePath);
  return existsSync(monorepoPath) ? readFileSync(monorepoPath, 'utf-8') : '';
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
      data: {
        booking_id: 'booking-qa-001',
        branch_id: 'branch-qa-001',
        db_atomic_visibility_notifications: true
      },
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

  it('public booking success is atomic with canonical branch visibility, bell notification, and confirmation email outbox', () => {
    const migrationSql = readSource('supabase/migrations/20260629234000_atomic_public_booking_visibility_notifications.sql');

    expect(migrationSql).toMatch(/create\s+or\s+replace\s+function\s+public\.create_public_booking/i);
    expect(migrationSql).toMatch(/if\s+v_branch_id\s+is\s+null/i);
    expect(migrationSql).not.toMatch(/insert\s+into\s+public\.branches/i);
    expect(migrationSql).toMatch(/br\.active\s+is\s+true[\s\S]*coalesce\(br\.is_active,\s*true\)\s*=\s*true/i);
    expect(migrationSql).toMatch(/insert\s+into\s+public\.bookings[\s\S]*v_branch_id/i);
    expect(migrationSql).toMatch(/insert\s+into\s+public\.dashboard_notifications/i);
    expect(migrationSql).toMatch(/template_key,\s*payload\)[\s\S]*'appointment_confirmation'/i);
    expect(migrationSql).toMatch(/template_key,\s*payload\)[\s\S]*'appointment_created_business'/i);
    expect(migrationSql).toMatch(/update\s+public\.bookings[\s\S]*set\s+branch_id\s*=\s*pb\.branch_id/i);
    expect(migrationSql).toMatch(/not\s+exists[\s\S]*dashboard_notifications[\s\S]*appointment\.created/i);
    expect(migrationSql).toMatch(/'db_atomic_visibility_notifications',\s*true/i);
  });

  it('browser public create fails closed unless RPC response proves DB-owned atomic side effects are active', async () => {
    const rpcSpy = vi.fn(async () => ({
      data: { booking_id: 'booking-qa-legacy' },
      error: null
    }));

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: vi.fn(() => ({ rpc: rpcSpy }))
    }));

    vi.doMock('../../core/runtime/dashboard-env', () => ({
      loadDashboardRuntimeEnv: () => ({
        NEXT_PUBLIC_SUPABASE_URL: 'https://qa.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key'
      })
    }));

    const { realSupabaseGateway } = await import('../../core/api/supabase-booking/real-gateway');

    await expect(
      realSupabaseGateway.createPublicBooking({
        businessSlug: 'studio-roma',
        serviceId: 'svc-001',
        startsAtIso: '2026-05-10T16:00:00.000Z',
        client: {
          fullName: 'QA Contract',
          email: 'qa.contract@example.com'
        }
      })
    ).resolves.toEqual({
      status: 503,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Booking database contract is not available. Please try again later.'
      }
    });
  });

  it('browser public create does not queue success email or bell notification outside the booking RPC', () => {
    const gatewaySource = readSource('src/app/core/api/supabase-booking/real-gateway.ts');
    const createPublicBookingBody = gatewaySource.match(/async createPublicBooking\(payload\) \{([\s\S]*?)\n    \} catch \(err\) \{/m)?.[1] ?? '';

    expect(createPublicBookingBody).toMatch(/rpc\('create_public_booking'/);
    expect(createPublicBookingBody).not.toMatch(/notification_email_outbox/i);
    expect(createPublicBookingBody).not.toMatch(/create_dashboard_notification_for_appointment_created/i);
    expect(createPublicBookingBody).not.toMatch(/get_booking_notification_context/i);
  });

  it('appointments/home pipelines must resolve tenant business_id and avoid direct auth uid filtering', () => {
    const turnoServiceSource = readSource('src/app/features/booking/data-access/turno.service.ts');
    const clienteServiceSource = readSource('src/app/features/clientes/data-access/cliente.service.ts');

    expect(turnoServiceSource).toMatch(/(resolve|load|get)\w*business\w*id/i);
    expect(clienteServiceSource).toMatch(/(resolve|load|get)\w*business\w*id/i);

    expect(turnoServiceSource).not.toMatch(/authService\.user\(\)\?\.id/);
    expect(clienteServiceSource).not.toMatch(/authService\.user\(\)\?\.id/);
  });
});
