import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SHELL_TS = 'src/app/shared/dashboard-shell/dashboard-shell.component.ts';

function fromRoot(relativePath: string): string {
  return join(process.cwd(), relativePath);
}

describe('Integration contract: dashboard shell uses selectedBusinessTypes from session', () => {
  it('wires selectedBusinessTypes from auth session into dashboard resolver', async () => {
    const shellTs = await readFile(fromRoot(SHELL_TS), 'utf-8');

    // Stable contract (not tied to visual markup):
    // dashboard shell must read session-backed selection and feed business rules.
    expect(shellTs).toMatch(/resolveDashboardConfigFromSession|readSelectedBusinessTypesFromSession|selectedBusinessTypesFromSession/);
    expect(shellTs).toMatch(/selectedBusinessTypes/);
  });
});
