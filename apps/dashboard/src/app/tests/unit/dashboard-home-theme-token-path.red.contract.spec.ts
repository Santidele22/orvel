import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Dashboard home theme token path contract (RED)', () => {
  it('does not use removed nested tokens.colors.* path', () => {
    const dashboardHomePath = resolve(
      __dirname,
      '..',
      '..',
      'pages',
      'dashboard',
      'home',
      'dashboard-home.page.ts'
    );

    const source = readFileSync(dashboardHomePath, 'utf8');

    expect(source).not.toMatch(/tokens\.colors\./);
  });
});
