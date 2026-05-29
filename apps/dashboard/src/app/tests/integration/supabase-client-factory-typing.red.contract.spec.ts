import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('supabase client factory typing contract', () => {
  it('does not lock createClient to full SupabaseClient return type', () => {
    const filePath = join(process.cwd(), 'src/app/core/runtime/supabase-client.factory.ts');
    const source = readFileSync(filePath, 'utf8');

    expect(source.includes('type DashboardCreateClient = (url: string, anonKey: string) => SupabaseClient;')).toBe(false);
  });
});
