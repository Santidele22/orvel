import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const MIGRATION_SOURCE = readFileSync(
  new URL('../../../../../../supabase/migrations/20260609120000_m7_admin_rpc_branch_ownership.sql', import.meta.url),
  'utf8'
);

function extractFunctionSource(functionName: string): string {
  const match = MIGRATION_SOURCE.match(
    new RegExp(`CREATE OR REPLACE FUNCTION public\\.${functionName}\\([\\s\\S]*?\\n\\$\\$;`, 'i')
  );

  return match?.[0] ?? '';
}

describe('M7 Supabase admin RPC branch ownership contract', () => {
  it.each(['create_admin_manual_booking', 'create_admin_blocked_time'])(
    '%s validates branch_id ownership before writing tenant-scoped data',
    (functionName) => {
      const functionSource = extractFunctionSource(functionName);

      expect(functionSource).toContain('branch_id uuid DEFAULT NULL');
      expect(functionSource).toMatch(new RegExp(`${functionName}\\.branch_id\\s+IS NOT NULL`, 'i'));
      expect(functionSource).toMatch(/FROM public\.branches br/i);
      expect(functionSource).toMatch(new RegExp(`br\\.id\\s*=\\s*${functionName}\\.branch_id`, 'i'));
      expect(functionSource).toMatch(new RegExp(`br\\.business_id\\s*=\\s*${functionName}\\.business_id`, 'i'));
      expect(functionSource).toMatch(/BRANCH_NOT_FOUND|BRANCH_TENANT_MISMATCH/);
    }
  );
});
