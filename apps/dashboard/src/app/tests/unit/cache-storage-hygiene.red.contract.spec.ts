import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_ROOT = resolve(process.cwd(), 'src/app');
const STORAGE_KEYS_PATH = resolve(APP_ROOT, 'core/storage/browser-storage-keys.ts');
const TURNO_SERVICE_PATH = resolve(APP_ROOT, 'features/booking/data-access/turno.service.ts');
const CLIENTE_SERVICE_PATH = resolve(APP_ROOT, 'features/clientes/data-access/cliente.service.ts');
const SERVICIO_SERVICE_PATH = resolve(APP_ROOT, 'features/servicios/data-access/servicio.service.ts');

function listProductionFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];

  return readdirSync(dir).flatMap((entry) => {
    const fullPath = resolve(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (/^(tests?|fixtures?|__fixtures__)$/.test(entry)) return [];
      return listProductionFiles(fullPath);
    }

    if (!/\.(ts|html)$/.test(entry)) return [];
    if (/(\.spec|\.test|\.contract)\.ts$/.test(entry)) return [];
    return [fullPath];
  });
}

function readProductionSources(): Array<{ path: string; source: string }> {
  return listProductionFiles(APP_ROOT).map((path) => ({
    path: relative(process.cwd(), path),
    source: readFileSync(path, 'utf8')
  }));
}

function methodBody(source: string, methodName: string): string {
  const signature = new RegExp(`\\n\\s{2}(?:private\\s+|public\\s+)?(?:async\\s+)?${methodName}\\s*\\(`).exec(source);
  if (!signature?.index) return '';

  const start = source.indexOf('{\n', signature.index);
  if (start === -1) return '';

  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return source.slice(signature.index, index + 1);
  }

  return '';
}

describe('RED contract: dashboard cache and browser storage hygiene', () => {
  it('production dashboard code never clears all browser storage', () => {
    const offenders = readProductionSources()
      .filter(({ source }) => /(?:localStorage|sessionStorage)\.clear\s*\(/.test(source))
      .map(({ path }) => path);

    expect(offenders, 'Clear specific keys only; localStorage.clear()/sessionStorage.clear() can erase auth, tenant, or onboarding state.').toEqual([]);
  });

  it('exports canonical storage key constants for active branch and degraded local fallbacks', () => {
    expect(existsSync(STORAGE_KEYS_PATH), 'Expected src/app/core/storage/browser-storage-keys.ts as the canonical dashboard storage key registry.').toBe(true);

    const source = existsSync(STORAGE_KEYS_PATH) ? readFileSync(STORAGE_KEYS_PATH, 'utf8') : '';
    expect(source).toMatch(/export\s+const\s+ACTIVE_BRANCH_STORAGE_KEY\s*=\s*['"]activeBranchId['"]/);
    expect(source).toMatch(/export\s+const\s+CLIENTES_FALLBACK_STORAGE_KEY\s*=\s*['"]clientes:fallback['"]/);
    expect(source).toMatch(/export\s+const\s+SERVICIOS_FALLBACK_STORAGE_KEY\s*=\s*['"]servicios:fallback['"]/);
    expect(source).toMatch(/export\s+const\s+ONBOARDING_[A-Z0-9_]+_STORAGE_KEY/);
  });

  it('invalidates admin availability cache after every admin booking/blocking mutation that can change slots', () => {
    const source = readFileSync(TURNO_SERVICE_PATH, 'utf8');
    const mutationMethods = [
      'create',
      'update',
      'updateEstado',
      'cancelByAdmin',
      'rescheduleByAdmin',
      'createBlockedTime',
      'delete'
    ];

    const missingInvalidation = mutationMethods.filter((methodName) => {
      const body = methodBody(source, methodName);
      return !/invalidateAdminAvailability(?:ForLoadAvailability)?\s*\(/.test(body);
    });

    expect(missingInvalidation, 'Slot-affecting mutations must not leave stale admin availability cache entries.').toEqual([]);
  });

  it('keeps clientes and servicios fallback storage as degraded mode only and safely ignores corrupt JSON', () => {
    const clientesSource = readFileSync(CLIENTE_SERVICE_PATH, 'utf8');
    const serviciosSource = readFileSync(SERVICIO_SERVICE_PATH, 'utf8');

    expect(clientesSource).toContain('clientes:fallback');
    expect(serviciosSource).toContain('servicios:fallback');
    expect(clientesSource).toMatch(/try\s*{[\s\S]*JSON\.parse[\s\S]*}\s*catch\s*{[\s\S]*return\s+\[\]/);
    expect(serviciosSource).toMatch(/try\s*{[\s\S]*JSON\.parse[\s\S]*}\s*catch\s*{[\s\S]*return\s+\[\]/);

    expect(clientesSource, 'Fallback reads are allowed only when Supabase is unavailable or a temporary schema bootstrap error occurs.').toMatch(/!supabaseClient|!supabase|isSupabaseSchemaUnavailableError/);
    expect(serviciosSource, 'Fallback reads are allowed only when Supabase is unavailable or a temporary schema bootstrap error occurs.').toMatch(/!supabaseClient|!supabase|isSupabaseSchemaUnavailableError/);
    expect(`${clientesSource}\n${serviciosSource}`, 'Fallback local data must not be documented or treated as the source of truth.').not.toMatch(/source\s+of\s+truth|fuente\s+de\s+verdad/i);
  });
});
