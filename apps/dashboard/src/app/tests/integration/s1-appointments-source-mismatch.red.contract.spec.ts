import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readSource(relativePath: string): string {
  const absolutePath = resolve(process.cwd(), relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf-8') : '';
}

function extractFirstTableRef(source: string): string | null {
  const match = source.match(/\.from\('([^']+)'\)/);
  return match?.[1] ?? null;
}

describe('S1 RED - Appointments must read from same source as public booking writes', () => {
  it('write/read source contract: public flow writes into public.bookings, appointments must read same qualified source', () => {
    const migrationSql = readSource('supabase/migrations/20260428110000_fix_public_booking_customers.sql');
    const turnoServiceSource = readSource('src/app/features/booking/data-access/turno.service.ts');

    const writeTargetIsPublicBookings = /insert\s+into\s+public\.bookings/i.test(migrationSql);
    const readTarget = extractFirstTableRef(turnoServiceSource);

    expect(writeTargetIsPublicBookings).toBe(true);
    expect(readTarget).toBe('bookings');
  });

  it('regression contract: appointments dataset refresh path must read from public.bookings after booking.created', () => {
    const turnosListSource = readSource('src/app/features/booking/pages/turnos-list.page.ts');
    const turnoServiceSource = readSource('src/app/features/booking/data-access/turno.service.ts');

    expect(turnosListSource).toMatch(/window\.addEventListener\('booking\.created'/);
    expect(turnosListSource).toMatch(/refreshTurnosFromSource\(\)/);
    expect(turnoServiceSource).toMatch(/\.schema\('public'\)\.from\('bookings'\)|\.from\('public\.bookings'\)/);
  });
});
