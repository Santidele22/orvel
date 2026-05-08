import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('supabase-config env access contract', () => {
  it('does not rely on import.meta.env in Angular runtime modules', () => {
    const filePath = join(process.cwd(), 'src/app/core/auth/supabase-config.ts');
    const source = readFileSync(filePath, 'utf8');

    expect(source.includes('import.meta.env')).toBe(false);
  });
});
