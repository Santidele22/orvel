import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseEnvFile, resolveKey } from '../../../../scripts/generate-dashboard-env.mjs';

describe('TDD contract: generate-dashboard-env.mjs env resolution', () => {
  it('prefers the canonical PUBLIC_ key and falls back to the NEXT_PUBLIC_ alias', () => {
    expect(
      resolveKey(
        { PUBLIC_SUPABASE_URL: 'canonical', NEXT_PUBLIC_SUPABASE_URL: 'legacy' },
        'PUBLIC_SUPABASE_URL'
      )
    ).toBe('canonical');

    expect(resolveKey({ NEXT_PUBLIC_SUPABASE_URL: 'legacy' }, 'PUBLIC_SUPABASE_URL')).toBe('legacy');
    expect(resolveKey({}, 'PUBLIC_SUPABASE_URL')).toBe('');
    expect(resolveKey({ PUBLIC_SUPABASE_URL: '   ' }, 'PUBLIC_SUPABASE_URL')).toBe('');
  });

  it('parses quoted, exported and commented lines from an env file', () => {
    const path = join(tmpdir(), `orvel-dashboard-env-${process.pid}.env`);

    writeFileSync(
      path,
      [
        '# comment',
        'PUBLIC_SUPABASE_URL="https://quoted.example"',
        "export PUBLIC_SUPABASE_ANON_KEY='single-quoted'",
        'BLANK=',
        'not a pair'
      ].join('\n')
    );

    try {
      const parsed = parseEnvFile(path);

      expect(parsed.PUBLIC_SUPABASE_URL).toBe('https://quoted.example');
      expect(parsed.PUBLIC_SUPABASE_ANON_KEY).toBe('single-quoted');
      expect(parsed.BLANK).toBe('');
      expect(parsed['not a pair']).toBeUndefined();
    } finally {
      rmSync(path, { force: true });
    }
  });

  it('returns an empty object for a missing env file', () => {
    expect(parseEnvFile(join(tmpdir(), 'orvel-dashboard-env-missing.env'))).toEqual({});
  });
});
