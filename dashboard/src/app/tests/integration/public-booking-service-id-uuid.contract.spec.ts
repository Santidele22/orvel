import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('create_public_booking service_id column contract', () => {
  it('latest 7-arg function inserts uuid service_id, not text', () => {
    const migrationsDir = resolve(process.cwd(), '../../supabase/migrations');
    const sql = readdirSync(migrationsDir)
      .filter((name) => name.endsWith('.sql'))
      .sort()
      .map((name) => readFileSync(join(migrationsDir, name), 'utf8'))
      .join('\n');

    const matches = [
      ...sql.matchAll(
        /CREATE OR REPLACE FUNCTION public\.create_public_booking\s*\(\s*business_slug text,\s*service_id text,\s*starts_at_iso text,\s*client jsonb,\s*notes text DEFAULT NULL,\s*professional_id text DEFAULT NULL,\s*branch_id text DEFAULT NULL\s*\)[\s\S]*?\$\$;/gi
      )
    ];
    const latest = matches.at(-1)?.[0] ?? '';

    expect(latest).toMatch(/INSERT INTO public\.bookings/i);
    expect(latest).not.toMatch(/v_service_id\s*::\s*text/i);
  });
});
