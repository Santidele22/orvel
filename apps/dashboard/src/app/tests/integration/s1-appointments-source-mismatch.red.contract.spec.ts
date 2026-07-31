import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readSource(relativePath: string): string {
  const absolutePath = resolve(process.cwd(), relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf-8') : '';
}

function directBookingsReadPattern(): RegExp {
  return /\.from\(\s*['"](?:public\.)?bookings['"]\s*\)[\s\S]{0,500}\.select\s*\(/i;
}

describe('S1 RED - Appointments must read from same source as public booking writes', () => {
  it('write/read source contract: public flow writes behind RPC and appointments list through least-privilege RPC', () => {
    const migrationSql = readSource('supabase/migrations/_legacy/20260428110000_fix_public_booking_customers.sql');
    const turnoServiceSource = readSource('src/app/features/booking/data-access/turno.service.ts');

    const writeTargetIsPublicBookings = /insert\s+into\s+public\.bookings/i.test(migrationSql);

    expect(writeTargetIsPublicBookings).toBe(true);
    expect(turnoServiceSource).toMatch(/\.rpc\(\s*['"]list_admin_bookings['"]/i);
    expect(turnoServiceSource).toMatch(/list_admin_bookings[\s\S]{0,240}p_branch_id/i);
    expect(turnoServiceSource, 'dashboard must not read public.bookings directly after direct SELECT grants are removed').not.toMatch(
      directBookingsReadPattern()
    );
  });

  it('regression contract: appointments dataset refresh path must refresh via list_admin_bookings after booking.created', () => {
    const turnosListSource = readSource('src/app/features/booking/pages/turnos-list.page.ts');
    const turnoServiceSource = readSource('src/app/features/booking/data-access/turno.service.ts');

    expect(turnosListSource).toMatch(/window\.addEventListener\('booking\.created'/);
    expect(turnosListSource).toMatch(/refreshTurnosFromSource\(\)/);
    expect(turnoServiceSource).toMatch(/\.rpc\(\s*['"]list_admin_bookings['"]/i);
    expect(turnoServiceSource, 'refresh must not depend on direct public.bookings reads').not.toMatch(directBookingsReadPattern());
  });
});
