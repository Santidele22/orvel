import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = resolve(process.cwd(), 'src/app');

function listSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];

  return readdirSync(dir).flatMap((entry) => {
    const fullPath = resolve(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      if (entry === 'tests') return [];
      return listSourceFiles(fullPath);
    }

    if (/\.(ts|html)$/.test(entry) && !/\.spec\.ts$/.test(entry)) {
      return [fullPath];
    }

    return [];
  });
}

function appSource(): string {
  return listSourceFiles(SRC_ROOT)
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
}

describe('RED contract: active branch UX fails closed for multi-branch dashboard runtime', () => {
  it('auto-selects the only available branch or explicitly persists a validated activeBranchId', () => {
    const source = appSource();

    expect(
      source,
      'A single-branch tenant should not get stuck without branch context; load branches and persist the only validated activeBranchId.'
    ).toMatch(/branches[\s\S]{0,800}(length\s*===\s*1|singleBranch|onlyBranch|auto-?select)[\s\S]{0,800}(activeBranchId|setActiveBranch|localStorage\.setItem\(['"]activeBranchId['"])/i);
  });

  it('requires explicit branch selection with helpful copy when multiple branches exist', () => {
    const source = appSource();

    expect(
      source,
      'Multi-branch tenants must see an explicit branch selector instead of falling through to empty lists or generic RPC failures.'
    ).toMatch(/(branch|sucursal)[\s\S]{0,600}(selector|select|seleccion)[\s\S]{0,600}(Seleccioná una sucursal|elegí una sucursal|sucursal activa requerida|ACTIVE_BRANCH_REQUIRED)/i);
  });
});
