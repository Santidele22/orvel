import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('create_admin_manual_booking bookings columns contract', () => {
  it('latest function insert matches bookings columns (no created_by, uuid service_id)', () => {
    const migrationsDir = resolve(process.cwd(), '../../supabase/migrations');
    const sql = readdirSync(migrationsDir)
      .filter((name) => name.endsWith('.sql'))
      .sort()
      .map((name) => readFileSync(join(migrationsDir, name), 'utf8'))
      .join('\n');

    const matches = [
      ...sql.matchAll(
        /CREATE OR REPLACE FUNCTION public\.create_admin_manual_booking[\s\S]*?\$\$;/gi
      )
    ];
    const latest = matches.at(-1)?.[0] ?? '';

    expect(latest).toMatch(/INSERT INTO public\.bookings/i);
    expect(latest).not.toMatch(/created_by/);
    expect(latest).not.toMatch(/v_service_id\s*::\s*text/i);
  });
});
