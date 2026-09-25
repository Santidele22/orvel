import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function migrationsDir(): string {
  return resolve(process.cwd(), '../../supabase/migrations');
}

function concatenatedMigrations(): string {
  const dir = migrationsDir();
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(join(dir, name), 'utf8'))
    .join('\n');
}

function latestCreatePublicBooking7Arg(sql: string): string {
  const matches = [
    ...sql.matchAll(
      /CREATE OR REPLACE FUNCTION public\.create_public_booking\s*\(\s*business_slug text,\s*service_id text,\s*starts_at_iso text,\s*client jsonb,\s*notes text DEFAULT NULL,\s*professional_id text DEFAULT NULL,\s*branch_id text DEFAULT NULL\s*\)[\s\S]*?\$\$;/gi
    )
  ];
  return matches.at(-1)?.[0] ?? '';
}

function latestFunctionBody(sql: string, functionName: string): string {
  const matches = [
    ...sql.matchAll(
      new RegExp(
        `create\\s+or\\s+replace\\s+function\\s+(?:public\\.)?${functionName}\\s*\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`,
        'gi'
      )
    )
  ];
  return matches.at(-1)?.[1] ?? '';
}

describe('Issue #495 - politicas y logistica enforcement', () => {
  it('latest 7-arg create_public_booking inserts auto_confirm status, buffers with buffer_minutes, and returns that status', () => {
    const latest = latestCreatePublicBooking7Arg(concatenatedMigrations());
    const insert = latest.match(/INSERT INTO public\.bookings[\s\S]*?RETURNING/i)?.[0] ?? '';
    const extraConflict = latest.match(
      /v_effective_start[\s\S]*?_assert_no_slot_conflict\s*\([\s\S]*?v_effective_end[\s\S]*?\)/i
    )?.[0] ?? '';

    expect(latest, 'latest 7-arg create_public_booking must exist').toMatch(/INSERT INTO public\.bookings/i);
    expect(latest).toMatch(/auto_confirm/i);
    expect(latest).toMatch(/buffer_minutes/i);
    expect(insert).toMatch(/v_status/);
    expect(insert).not.toMatch(/,\s*'confirmed'\s*,/);
    expect(extraConflict).toMatch(/buffer_minutes/i);
    expect(extraConflict).not.toMatch(/prep_buffer_minutes|post_buffer_minutes|v_prep_buffer|v_post_buffer/i);
    expect(latest).toMatch(/'status'\s*,\s*v_status/);
  });

  it('latest slot occupancy counts pending and confirmed bookings', () => {
    const sql = concatenatedMigrations();
    const queryBody = latestFunctionBody(sql, '_query_booking_slot_availability');
    const assertBody = latestFunctionBody(sql, '_assert_no_slot_conflict');

    expect(queryBody, '_query_booking_slot_availability must exist').not.toBe('');
    expect(assertBody, '_assert_no_slot_conflict must exist').not.toBe('');
    expect(queryBody).toMatch(/bk\.status\s+IN\s*\(\s*'confirmed'\s*,\s*'pending'\s*\)/i);
    expect(assertBody).toMatch(/bk\.status\s+IN\s*\(\s*'confirmed'\s*,\s*'pending'\s*\)/i);
    expect(queryBody).not.toMatch(/AND\s+bk\.status\s*=\s*'confirmed'/i);
    expect(assertBody).not.toMatch(/AND\s+bk\.status\s*=\s*'confirmed'/i);
  });
});
