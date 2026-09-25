import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readSql(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf-8');
}

describe('Orvel capacity booking RED contracts', () => {
  it('DB schema defines business.capacity as INT with min value 1', () => {
    const bookingCore = readSql('supabase/migrations/20260420121000_booking_core_schema.sql');
    const businessSettings = readSql('supabase/migrations/20260426210000_update_business_settings_schema.sql');
    const merged = `${bookingCore}\n${businessSettings}`.toLowerCase();

    expect(merged).toMatch(/\bcapacity\b\s+integer|\bcapacity\b\s+int\b/);
    expect(merged).toMatch(/\bcapacity\b[^,;]*check\s*\(\s*capacity\s*>=\s*1\s*\)/);
  });

  it("DB schema constrains appointment states to 'booked' | 'cancelled'", () => {
    const bookingCore = readSql('supabase/migrations/20260420121000_booking_core_schema.sql').toLowerCase();
    const bookingRpcs = readSql('supabase/migrations/20260420122000_booking_rpcs.sql').toLowerCase();
    const merged = `${bookingCore}\n${bookingRpcs}`;

    expect(merged).toMatch(/status\s+text\s+not\s+null\s+default\s+'booked'/);
    expect(merged).toMatch(/check\s*\(\s*status\s+in\s*\(\s*'booked'\s*,\s*'cancelled'\s*\)\s*\)\s*\)/);
  });

  it('create_appointment is atomic for last capacity under concurrent attempts', () => {
    const bookingRpcs = readSql('supabase/migrations/20260420122000_booking_rpcs.sql').toLowerCase();

    expect(bookingRpcs).toMatch(/create\s+(or\s+replace\s+)?function\s+public\.create_appointment\s*\(/);
    expect(bookingRpcs).toMatch(/for\s+update/);
    expect(bookingRpcs).toMatch(/insert\s+into\s+public\.bookings/);
    expect(bookingRpcs).toMatch(/where\s+.*capacity.*>\s*.*occupied|remaining_capacity\s*>\s*0/);
  });

  it('create_appointment contract serializes overlapping ranges (10:00-11:00 vs 10:30-11:30) for same business', () => {
    const bookingRpcs = readSql('supabase/migrations/20260420122000_booking_rpcs.sql').toLowerCase();

    expect(bookingRpcs).toMatch(/create\s+(or\s+replace\s+)?function\s+public\.create_appointment\s*\(/);
    expect(bookingRpcs).toMatch(/pg_advisory_xact_lock/);

    // RED contract: lock scope must be overlap-safe, not exact [start,end] key.
    // We require canonical bucket/window lock derivation over the interval.
    expect(bookingRpcs).toMatch(/generate_series\s*\(.*p_start_time.*p_end_time.*interval\s+'30\s+minutes'/);
    expect(bookingRpcs).toMatch(/hashtextextended\s*\(\s*p_business_id::text\s*\|\|\s*':slot:'/);
  });

  it('create_appointment validates null/missing required inputs with deterministic BOOKING_VALIDATION_ERROR', () => {
    const bookingRpcs = readSql('supabase/migrations/20260420122000_booking_rpcs.sql').toLowerCase();

    expect(bookingRpcs).toMatch(/create\s+(or\s+replace\s+)?function\s+public\.create_appointment\s*\(/);
    expect(bookingRpcs).toMatch(/if\s+p_business_id\s+is\s+null\s+then\s+raise\s+exception\s+using\s+errcode\s*=\s*'p0001'\s*,\s*message\s*=\s*'booking_validation_error'/);
    expect(bookingRpcs).toMatch(/if\s+p_start_time\s+is\s+null\s+then\s+raise\s+exception\s+using\s+errcode\s*=\s*'p0001'\s*,\s*message\s*=\s*'booking_validation_error'/);
    expect(bookingRpcs).toMatch(/if\s+p_end_time\s+is\s+null\s+then\s+raise\s+exception\s+using\s+errcode\s*=\s*'p0001'\s*,\s*message\s*=\s*'booking_validation_error'/);
  });

  it('create_appointment enforces explicit auth + membership guard for p_business_id', () => {
    const bookingRpcs = readSql('supabase/migrations/20260420122000_booking_rpcs.sql').toLowerCase();
    const createAppointmentFn = bookingRpcs.match(
      /create\s+(or\s+replace\s+)?function\s+public\.create_appointment\s*\([\s\S]*?\)\s*returns\s+jsonb\s+language\s+plpgsql\s+as\s+\$\$([\s\S]*?)\$\$\s*;/,
    );

    expect(createAppointmentFn).not.toBeNull();

    // Strip SQL comments so guard contracts only match executable code.
    const functionBody = (createAppointmentFn?.[2] ?? '').replace(/--.*$/gm, '');

    expect(bookingRpcs).toMatch(/create\s+(or\s+replace\s+)?function\s+public\.create_appointment\s*\(/);
    expect(functionBody).toMatch(/auth\.uid\s*\(\s*\)/);
    expect(functionBody).toMatch(/if\s+auth\.uid\s*\(\s*\)\s+is\s+null\s+then\s+raise\s+exception\s+using\s+errcode\s*=\s*'p0001'\s*,\s*message\s*=\s*'unauthorized'/);

    // Executable membership/ownership guard (not comment placeholder):
    // requires EXISTS predicate linked to requester uid and business scope.
    expect(functionBody).toMatch(/exists\s*\(\s*select\s+1\s+from\s+public\.(business_members|usuarios_negocios)\b[\s\S]*?business_id\s*=\s*p_business_id[\s\S]*?(user_id|usuario_id)\s*=\s*(v_requester|auth\.uid\s*\(\s*\))/);
  });

  it('availability RPC uses overlap occupancy, 30-min slots, and America/Argentina/Buenos_Aires timezone', () => {
    const availabilityMigration = readSql('supabase/migrations/20260426220000_improve_availability_rpc.sql').toLowerCase();
    const coreBookingRpc = readSql('supabase/migrations/20260420122000_booking_rpcs.sql').toLowerCase();
    const merged = `${availabilityMigration}\n${coreBookingRpc}`;

    expect(merged).toMatch(/america\/argentina\/buenos_aires/);
    expect(merged).toMatch(/slot_interval_minutes[^\n]*30|interval\s+'30\s+minutes'/);
    expect(merged).toMatch(/tstzrange\s*\(.*\)\s*&&\s*tstzrange\s*\(/);
    expect(merged).toMatch(/status\s*(=|in)\s*\(?\s*'booked'|'cancelled'/);
  });

  it("frontend availability contract includes remaining capacity payload for 'Quedan X lugares'", () => {
    const gateway = readFileSync(resolve(process.cwd(), 'src/app/core/api/supabase-booking.gateway.ts'), 'utf-8');
    const bookingPage = readFileSync(resolve(process.cwd(), 'src/app/features/booking/pages/public/public-booking.page.ts'), 'utf-8');
    const bookingHtml = readFileSync(resolve(process.cwd(), 'src/app/features/booking/pages/public/public-booking.page.html'), 'utf-8');
    const merged = `${gateway}\n${bookingPage}\n${bookingHtml}`;

    expect(merged).toMatch(/remainingCapacity|remaining_capacity/);
    expect(merged).toMatch(/Quedan\s*\{?\{?\s*\w+\s*\}?\}?\s+lugares|Quedan\s+\$\{.*\}\s+lugares/);
  });

  it('frontend preserves zero remaining capacity from the canonical availability API', () => {
    const gateway = readFileSync(resolve(process.cwd(), 'src/app/core/api/supabase-booking.gateway.ts'), 'utf-8');

    expect(gateway).toMatch(/remainingCapacity\s*:\s*Number\(row\.remaining_capacity\s*\?\?\s*row\.remainingCapacity\s*\?\?\s*0\)/);
    expect(gateway).not.toMatch(/remainingCapacity\s*:\s*Math\.max\(\s*1\s*,\s*Number\(/);
  });

  it('bookings status constraint remains centralized as bookings_status_check with only booked/cancelled', () => {
    const businessSettingsMigration = readSql('supabase/migrations/20260426210000_update_business_settings_schema.sql').toLowerCase();

    expect(businessSettingsMigration).toMatch(/conname\s*=\s*'bookings_status_check'/);
    expect(businessSettingsMigration).toMatch(/add\s+constraint\s+bookings_status_check\s+check\s*\(\s*status\s+in\s*\(\s*'booked'\s*,\s*'cancelled'\s*\)\s*\)/);
  });

  it('adapter contract validates admin status updates against canonical lifecycle values', () => {
    const gateway = readFileSync(resolve(process.cwd(), 'src/app/core/api/supabase-booking.gateway.ts'), 'utf-8');

    expect(gateway).toMatch(/const\s+ALLOWED_BOOKING_STATUSES\s*=\s*\[[^\]]*'booked'[^\]]*'confirmed'[^\]]*'completed'[^\]]*'cancelled'[^\]]*\]/);
    expect(gateway).toMatch(/if\s*\(\s*!ALLOWED_BOOKING_STATUSES\.includes\(payload\.status\)\s*\)/);
    expect(gateway).toMatch(/return\s*\{\s*status\s*:\s*422[\s\S]*VALIDATION_ERROR/);
  });
});
