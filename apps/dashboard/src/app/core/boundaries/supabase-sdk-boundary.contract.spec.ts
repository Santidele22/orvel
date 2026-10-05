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
 * the SDK lives behind `core/adapters/supabase/**`. This spec walks the real
 * tree and fails when a core file outside that directory imports
 * `@supabase/supabase-js`.
 *
 * The exemption is a directory, so its contents are pinned too: a new file
 * cannot hide there, and a core file cannot quietly gain an SDK import.
 */
const ADAPTER_DIR = 'adapters/';

const SDK_ADAPTERS = [
  'adapters/supabase/branch-context.adapter.ts',
  'adapters/supabase/supabase-auth.client.ts',
  'adapters/supabase/supabase-client.factory.ts',
  'adapters/supabase/supabase-client.ts'
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
  it('confines the Supabase SDK to core/adapters/supabase', () => {
    const importers = sdkImporters();

    expect(importers.filter((id) => !id.startsWith(ADAPTER_DIR))).toEqual([]);
    expect(importers.filter((id) => id.startsWith(ADAPTER_DIR))).toEqual([...SDK_ADAPTERS].sort());
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
