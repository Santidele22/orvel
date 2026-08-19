import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../../../../../../packages/booking/src/infrastructure/supabase/admin-booking.repository.ts', import.meta.url), 'utf8');

describe('TurnoService Core Slice 4 admin booking lifecycle RED contract', () => {
  it('forbids direct bookings table lifecycle mutations from TurnoService', () => {
    const rawBookingsLifecycleMutation = /\.from\(['"]bookings['"]\)[\s\S]{0,300}\.(?:update|insert|delete)\s*\(/;

    expect(source).not.toMatch(rawBookingsLifecycleMutation);
  });

  it('keeps admin update, cancel, reschedule, and status changes behind canonical backend RPCs or gateway methods', () => {
    const requiredBackendLifecycleMethods = [
      'update_admin_booking',
      'cancel_admin_booking',
      'reschedule_admin_booking',
      'update_booking_status'
    ];

    for (const rpcName of requiredBackendLifecycleMethods) {
      expect(source).toContain(rpcName);
    }
  });

  it('does not decide terminal-state cancel/reschedule/status transitions before the backend responds', () => {
    const frontendTransitionAuthority = source;

    expect(frontendTransitionAuthority).not.toMatch(/existing\.estado\s*===\s*['"](?:cancelado|completado|no-asistio)['"]/);
    expect(frontendTransitionAuthority).not.toMatch(/turno\.estado\s*===\s*['"](?:cancelado|completado|no-asistio)['"]/);
    expect(frontendTransitionAuthority).not.toMatch(/existing\.estado\s*===\s*estado/);
    expect(frontendTransitionAuthority).not.toMatch(/TURNO_INVALID_STATUS_TRANSITION[\s\S]{0,120}(?:throw|return)/);
  });

  it('limits pre-RPC validation to payload shape, not booking business policy', () => {
    const preRpcRescheduleSegment = source.split('rescheduleAdminBooking')[0];
    const preRpcStatusSegment = source.split('updateBookingStatus')[0];

    expect(preRpcRescheduleSegment).not.toMatch(/TURNO_INVALID_STATUS_TRANSITION|TURNO_SLOT_COLLISION|SLOT_CONFLICT/);
    expect(preRpcStatusSegment).not.toMatch(/TURNO_INVALID_STATUS_TRANSITION|existing\.estado\s*===\s*estado/);
  });
});
