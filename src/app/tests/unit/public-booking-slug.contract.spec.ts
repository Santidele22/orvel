import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isValidPublicBookingSlug, normalizePublicBookingSlug } from '../../core/api/supabase-booking/public-booking-slug';

const PUBLIC_BOOKING_SLUG_MIGRATION = resolve(
  process.cwd(),
  'supabase/migrations/20260529001000_public_booking_slug_resolver.sql'
);

function readPublicBookingSlugMigration(): string {
  return readFileSync(PUBLIC_BOOKING_SLUG_MIGRATION, 'utf-8');
}

describe('public booking slug canonicalization', () => {
  it('normalizes equivalent public booking slugs to one canonical form', () => {
    expect(normalizePublicBookingSlug('  Peluquería   Ñandú Central  ')).toBe('peluqueria-nandu-central');
    expect(normalizePublicBookingSlug('Peluqueria___Nandu---Central')).toBe('peluqueria-nandu-central');
  });

  it('rejects empty or malformed canonical slugs', () => {
    expect(isValidPublicBookingSlug('')).toBe(false);
    expect(isValidPublicBookingSlug(' --- ')).toBe(false);
    expect(isValidPublicBookingSlug('valid-slug-123')).toBe(true);
  });

  it('keeps slug_canonical synchronized by database trigger for future slug writes', () => {
    const migration = readPublicBookingSlugMigration();

    expect(migration).toMatch(/create\s+or\s+replace\s+function\s+public\.set_business_slug_canonical\s*\(\s*\)/i);
    expect(migration).toMatch(/new\.slug_canonical\s*:=\s*case[\s\S]*public\.canonical_booking_slug\(new\.slug\)/i);
    expect(migration).toMatch(
      /create\s+trigger\s+businesses_slug_canonical_sync[\s\S]*before\s+insert\s+or\s+update\s+of\s+slug\s+on\s+public\.businesses[\s\S]*execute\s+function\s+public\.set_business_slug_canonical\s*\(\s*\)/i
    );
  });

  it('fails migration on existing canonical duplicates before creating unique index', () => {
    const migration = readPublicBookingSlugMigration();
    const duplicateAbort = migration.indexOf("raise exception 'DUPLICATE_BUSINESS_SLUG_CANONICAL'");
    const uniqueIndex = migration.indexOf('create unique index if not exists businesses_slug_canonical_unique');

    expect(duplicateAbort).toBeGreaterThan(-1);
    expect(uniqueIndex).toBeGreaterThan(-1);
    expect(duplicateAbort).toBeLessThan(uniqueIndex);
    expect(migration).not.toMatch(/if\s+not\s+exists\s*\([\s\S]*having\s+count\(\*\)\s*>\s*1[\s\S]*create\s+unique\s+index/i);
  });

  it('prevents future canonical collisions with DB uniqueness after migration succeeds', () => {
    const migration = readPublicBookingSlugMigration();

    expect(migration).toMatch(
      /create\s+unique\s+index\s+if\s+not\s+exists\s+businesses_slug_canonical_unique\s+on\s+public\.businesses\s*\(\s*slug_canonical\s*\)\s*where\s+slug_canonical\s+is\s+not\s+null/i
    );
  });

  it('hardens security definer RPCs with explicit public search_path and fails closed', () => {
    const migration = readPublicBookingSlugMigration();

    expect(migration).toMatch(
      /create\s+or\s+replace\s+function\s+public\.resolve_business_by_slug\s*\([\s\S]*?security\s+definer[\s\S]*?set\s+search_path\s*=\s*public\s*,\s*pg_temp[\s\S]*?as\s+\$\$/i
    );
    expect(migration).toMatch(/if\s+v_count\s+<>\s+1\s+then[\s\S]*raise\s+exception\s+'BUSINESS_NOT_FOUND'/i);
  });
});
