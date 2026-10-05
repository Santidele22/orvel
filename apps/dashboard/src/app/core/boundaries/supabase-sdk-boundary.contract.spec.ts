import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RpcClient } from '../api/rpc.port';
import {
  DEV_DASHBOARD_REFERENCE_CATALOG_FIXTURE,
  normalizeDashboardReferenceCatalog
} from '../catalog/reference-catalog';
import { createDashboardReferenceCatalogGateway } from '../catalog/reference-catalog.gateway';

/**
 * Fase 1 of #1098 — the Supabase SDK boundary of the shared core.
 *
 * The core has to run without the SDK (Node tests today, the native target
 * later), so `core/*` depends on ports that speak the app's own vocabulary and
 * the SDK lives behind adapters. This spec walks the real tree and fails when a
 * core file imports `@supabase/supabase-js` directly.
 *
 * `PENDING_MIGRATION` is a ratchet, not a home: it lists the files that still
 * cross the boundary, with the cut that removes each one. It must end up empty
 * before Fase 1 is done, and equality is asserted so it cannot grow silently.
 */
const PENDING_MIGRATION = [
  // Cut 3b: move these three client modules into core/adapters/supabase/.
  'auth/supabase-auth.client.ts',
  'runtime/supabase-client.ts',
  'runtime/supabase-client.factory.ts',
  // Cut 3c: branch-context queries behind a port, like entitlements and catalog.
  'branches/branch-context.service.ts'
] as const;

const CORE_DIR = resolve(process.cwd(), 'src/app/core');
const SDK_IMPORT = /(?:from|import)\s*\(?\s*['"]@supabase\/supabase-js['"]/;

function productionFiles(dir: string = CORE_DIR): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...productionFiles(absolute));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      files.push(absolute);
    }
  }

  return files;
}

/** Comments may name the SDK; only code counts. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function sdkImporters(): string[] {
  return productionFiles()
    .filter((file) => SDK_IMPORT.test(stripComments(readFileSync(file, 'utf8'))))
    .map((file) => relative(CORE_DIR, file).split('\\').join('/'))
    .sort();
}

describe('core Supabase SDK boundary contract', () => {
  it('imports the Supabase SDK only from the files still listed as pending migration', () => {
    expect(sdkImporters()).toEqual([...PENDING_MIGRATION].sort());
  });

  it('drives core code from a plain fake rpc client, with the SDK nowhere in sight', async () => {
    const calls: string[] = [];
    const fakeRpc: RpcClient = {
      async rpc(name: string) {
        calls.push(name);
        return { data: DEV_DASHBOARD_REFERENCE_CATALOG_FIXTURE, error: null };
      }
    };

    const catalog = await createDashboardReferenceCatalogGateway(fakeRpc).getDashboardReferenceCatalog();

    expect(calls).toEqual(['get_dashboard_reference_catalog']);
    expect(catalog).toEqual(normalizeDashboardReferenceCatalog(DEV_DASHBOARD_REFERENCE_CATALOG_FIXTURE));
  });

  it('surfaces an rpc failure through the port without leaking SDK error objects', async () => {
    const fakeRpc: RpcClient = {
      async rpc() {
        return { data: null, error: { message: 'CATALOG_DOWN' } };
      }
    };

    await expect(
      createDashboardReferenceCatalogGateway(fakeRpc).getDashboardReferenceCatalog()
    ).rejects.toThrow('CATALOG_DOWN');
  });
});
