import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn()
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock
}));

vi.mock('../../runtime/dashboard-env', () => ({
  loadDashboardRuntimeEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.example.test',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-test-key'
  })
}));

import { realSupabaseGateway } from './real-gateway';

function findRepoRoot(startDir: string): string {
  let current = startDir;

  for (let depth = 0; depth < 8; depth += 1) {
    if (fs.existsSync(path.join(current, 'supabase')) && fs.existsSync(path.join(current, 'apps', 'dashboard'))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  throw new Error('Unable to locate Orvel repo root from test cwd');
}

const REPO_ROOT = findRepoRoot(process.cwd());
const BOOKING_CORE_API_DIR = path.join(REPO_ROOT, 'apps', 'dashboard', 'src', 'app', 'core', 'api');
const REAL_GATEWAY_SOURCE = path.join(BOOKING_CORE_API_DIR, 'supabase-booking', 'real-gateway.ts');
const MAPPERS_SOURCE = path.join(BOOKING_CORE_API_DIR, 'supabase-booking', 'mappers.ts');

function source(relativePath: string): string {
  return fs.readFileSync(path.join(BOOKING_CORE_API_DIR, relativePath), 'utf8');
}

function methodBody(sourceText: string, methodName: string): string {
  const start = sourceText.indexOf(`async ${methodName}`);
  if (start === -1) return '';

  const nextMethod = sourceText.slice(start + 1).search(/\n\s{2}async \w+\(/);
  return nextMethod === -1 ? sourceText.slice(start) : sourceText.slice(start, start + 1 + nextMethod);
}

function maybeSingleChain(data: unknown = null) {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data, error: null }))
  };

  return chain;
}

describe('Core Slice 3 frontend booking runtime lockdown RED contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fails closed when public slot availability RPC rejects instead of generating deterministic fallback slots', async () => {
    const rpc = vi.fn(async () => {
      throw new Error('network unavailable');
    });
    createClientMock.mockReturnValue({ rpc });

    const result = await realSupabaseGateway.queryPublicSlotAvailability({
      businessSlug: 'demo-salon',
      serviceId: 'service-1',
      dateIso: '2026-06-01'
    });

    expect(rpc).toHaveBeenCalledWith('query_public_slot_availability', {
      business_slug: 'demo-salon',
      service_id: 'service-1',
      date_iso: '2026-06-01'
    });

    const failClosed =
      result.status !== 200 ||
      Boolean(result.error) ||
      (Array.isArray(result.data?.slots) && result.data.slots.length === 0);

    expect(failClosed, 'availability errors must never return generated bookable slots').toBe(true);
  });

  it('keeps deterministic public slot builders out of production runtime exports and imports', () => {
    const realGateway = fs.readFileSync(REAL_GATEWAY_SOURCE, 'utf8');
    const mappers = fs.readFileSync(MAPPERS_SOURCE, 'utf8');

    expect(realGateway, 'real gateway must not import or call deterministic fixture slot generation').not.toContain(
      'buildDeterministicPublicSlots'
    );
    expect(mappers, 'deterministic public slots may only live in tests/fixtures, not exported production mappers').not.toMatch(
      /export\s+function\s+buildDeterministicPublicSlots\b/
    );
  });

  it.each([
    ['updateAdminBooking', 'update_admin_booking'],
    ['cancelAdminBooking', 'cancel_admin_booking'],
    ['rescheduleAdminBooking', 'reschedule_admin_booking'],
    ['updateBookingStatus', 'update_booking_status']
  ] as const)('routes %s through the canonical backend RPC without direct bookings mutations', (methodName, rpcName) => {
    const body = methodBody(source(path.join('supabase-booking', 'real-gateway.ts')), methodName);

    expect(body, `real-gateway.${methodName} must call ${rpcName}`).toMatch(
      new RegExp(`\\.rpc\\(\\s*['"]${rpcName}['"]`, 'i')
    );
    expect(body, `real-gateway.${methodName} must not update bookings directly`).not.toMatch(
      /\.from\(\s*['"]bookings['"]\s*\)[\s\S]{0,500}\.update\s*\(/i
    );
    expect(body, `real-gateway.${methodName} must not insert bookings directly`).not.toMatch(
      /\.from\(\s*['"]bookings['"]\s*\)[\s\S]{0,500}\.insert\s*\(/i
    );
    expect(body, `real-gateway.${methodName} must not delete bookings directly`).not.toMatch(
      /\.from\(\s*['"]bookings['"]\s*\)[\s\S]{0,500}\.delete\s*\(/i
    );
  });

  it('does not carry frontend-owned status whitelists or transition decision tables in real-gateway', () => {
    const realGateway = fs.readFileSync(REAL_GATEWAY_SOURCE, 'utf8');

    expect(realGateway, 'backend owns canonical status vocabulary and validation').not.toMatch(/validStatuses|ALLOWED_BOOKING_STATUSES/i);
    expect(realGateway, 'backend owns status transition decisions').not.toMatch(/allowedTransitions|Cannot transition from/i);
    expect(realGateway, 'legacy frontend-only statuses must not be whitelisted in runtime').not.toMatch(
      /['"](?:booked|pending|in_progress|rejected)['"]/i
    );
  });

  it('maps public create RPC manage_token to manageToken only when DB atomic visibility marker and branch_id are present', async () => {
    const rpc = vi.fn(async (fn: string) => {
      if (fn === 'create_public_booking') {
        return {
          data: {
            booking_id: 'booking-public-1',
            branch_id: 'branch-public-1',
            manage_token: 'raw-token-once',
            db_atomic_visibility_notifications: true
          },
          error: null
        };
      }

      return {
        data: null,
        error: { message: `Unexpected RPC ${fn}` }
      };
    });
    const from = vi.fn(() => maybeSingleChain(null));
    createClientMock.mockReturnValue({ rpc, from });

    await expect(
      realSupabaseGateway.createPublicBooking({
        businessSlug: 'demo-salon',
        serviceId: 'service-1',
        startsAtIso: '2026-06-01T10:00:00.000Z',
        client: { fullName: 'Ada Lovelace', email: 'ada@example.test' }
      })
    ).resolves.toEqual({
      status: 201,
      data: {
        bookingId: 'booking-public-1',
        manageToken: 'raw-token-once',
        status: 'confirmed',
        source: 'client-self-service'
      }
    });

    expect(rpc).toHaveBeenNthCalledWith(1, 'create_public_booking', expect.any(Object));
    expect(rpc).toHaveBeenCalledTimes(1);

    const createPublicBookingBody = methodBody(source(path.join('supabase-booking', 'real-gateway.ts')), 'createPublicBooking');
    expect(createPublicBookingBody, 'post-create visibility must not be verified with direct bookings SELECT').not.toMatch(
      /\.from\(\s*['"](?:public\.)?bookings['"]\s*\)[\s\S]{0,500}\.select\s*\(/i
    );
  });

  it('fails closed when old public create RPC response lacks DB atomic marker or branch_id', async () => {
    const rpc = vi.fn(async (fn: string) => {
      if (fn === 'create_public_booking') {
        return {
          data: { booking_id: 'booking-public-1', manage_token: 'raw-token-once' },
          error: null
        };
      }

      throw new Error(`unexpected RPC ${fn}`);
    });
    createClientMock.mockReturnValue({ rpc });

    await expect(
      realSupabaseGateway.createPublicBooking({
        businessSlug: 'demo-salon',
        serviceId: 'service-1',
        startsAtIso: '2026-06-01T10:00:00.000Z',
        client: { fullName: 'Ada Lovelace', email: 'ada@example.test' }
      })
    ).resolves.toEqual({
      status: 503,
      error: {
        code: 'DATABASE_CONTRACT_UNAVAILABLE',
        message: 'Booking database contract is not available. Please try again later.'
      }
    });
  });

  it('preserves real public create RPC diagnostics when mapper returns submit failures', async () => {
    const rpc = vi.fn(async (fn: string) => {
      if (fn === 'create_public_booking') {
        return {
          data: null,
          error: {
            code: 'P0001',
            message: 'SLOT_CONFLICT from create_public_booking',
            details: 'Conflicts with public.bookings exclusion constraint',
            hint: 'Pick another slot'
          }
        };
      }

      throw new Error(`unexpected RPC ${fn}`);
    });
    createClientMock.mockReturnValue({ rpc });

    await expect(
      realSupabaseGateway.createPublicBooking({
        businessSlug: 'demo-salon',
        serviceId: 'service-1',
        startsAtIso: '2026-06-01T10:00:00.000Z',
        client: { fullName: 'Ada Lovelace', email: 'ada@example.test' }
      })
    ).resolves.toEqual({
      status: 409,
      error: {
        code: 'SLOT_CONFLICT',
        message: 'SLOT_CONFLICT from create_public_booking',
        details: {
          rpcCode: 'P0001',
          rpcDetails: 'Conflicts with public.bookings exclusion constraint',
          rpcHint: 'Pick another slot'
        }
      }
    });
  });

  it('does not queue public create emails or bell notifications from the browser after RPC success', async () => {
    const rpc = vi.fn(async (fn: string) => {
      if (fn === 'create_public_booking') {
        return {
          data: {
            booking_id: 'booking-public-1',
            branch_id: 'branch-public-1',
            manage_token: 'raw-token-once',
            db_atomic_visibility_notifications: true
          },
          error: null
        };
      }

      throw new Error(`unexpected RPC ${fn}`);
    });
    const from = vi.fn(() => ({
      insert: vi.fn(async () => ({ data: null, error: null }))
    }));
    createClientMock.mockReturnValue({ rpc, from });

    await expect(
      realSupabaseGateway.createPublicBooking({
        businessSlug: 'demo-salon',
        serviceId: 'service-1',
        startsAtIso: '2026-06-01T10:00:00.000Z',
        client: { fullName: 'Ada Lovelace', email: 'ada@example.test' }
      })
    ).resolves.toEqual({
      status: 201,
      data: {
        bookingId: 'booking-public-1',
        manageToken: 'raw-token-once',
        status: 'confirmed',
        source: 'client-self-service'
      }
    });

    expect(from).not.toHaveBeenCalledWith('notification_email_outbox');
    expect(rpc).not.toHaveBeenCalledWith('create_dashboard_notification_for_appointment_created', expect.any(Object));

    const createPublicBookingBody = methodBody(source(path.join('supabase-booking', 'real-gateway.ts')), 'createPublicBooking');
    expect(createPublicBookingBody, 'public create side effects must be owned by the database transaction').not.toMatch(
      /notification_email_outbox|create_dashboard_notification_for_appointment_created|get_booking_notification_context/i
    );
  });

  it.each([
    ['cancelBookingByToken', 'cancel_booking_by_token', { status: 200, data: { bookingId: 'booking-public-1', status: 'cancelled' } }],
    ['rescheduleBookingByToken', 'reschedule_booking_by_token', { status: 200, data: { bookingId: 'booking-public-1', startsAtIso: '2026-06-01T11:00:00.000Z' } }]
  ] as const)('keeps public %s success visible when notification side effects fail after the lifecycle RPC commits', async (methodName, rpcName, expected) => {
    const rpc = vi.fn(async (fn: string) => {
      if (fn === rpcName) {
        return {
          data: { booking_id: 'booking-public-1' },
          error: null
        };
      }

      throw new Error('notification context unavailable');
    });
    const from = vi.fn(() => maybeSingleChain(null));
    createClientMock.mockReturnValue({ rpc, from });

    const args = {
      token: 'manage-token-1',
      nowIso: '2026-06-01T08:30:00.000Z',
      ...(methodName === 'rescheduleBookingByToken' ? { startsAtIso: '2026-06-01T11:00:00.000Z' } : {})
    };

    await expect((realSupabaseGateway[methodName] as (input: typeof args) => Promise<unknown>)(args)).resolves.toEqual(expected);
  });

  it('preserves backend remaining_capacity when mapping real availability rows', async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          starts_at_iso: '2026-06-01T10:00:00.000Z',
          ends_at_iso: '2026-06-01T10:30:00.000Z',
          remaining_capacity: 0
        }
      ],
      error: null
    }));
    createClientMock.mockReturnValue({ rpc });

    await expect(
      realSupabaseGateway.queryPublicSlotAvailability({
        businessSlug: 'demo-salon',
        serviceId: 'service-1',
        dateIso: '2026-06-01'
      })
    ).resolves.toEqual({
      status: 200,
      data: {
        slots: [
          {
            startsAtIso: '2026-06-01T10:00:00.000Z',
            endsAtIso: '2026-06-01T10:30:00.000Z',
            remainingCapacity: 0
          }
        ]
      }
    });
  });
});
