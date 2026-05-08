import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type DashboardRuntimeEnv = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

type DashboardEnvModule = {
  REQUIRED_DASHBOARD_ENV_KEYS: readonly ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  OPTIONAL_SERVER_ENV_KEYS: readonly ['SUPABASE_SERVICE_ROLE_KEY'];
  loadDashboardRuntimeEnv: (source?: Record<string, string | undefined>) => DashboardRuntimeEnv;
};

type SupabaseClientFactoryModule = {
  createDashboardSupabaseClient: (deps: {
    env: DashboardRuntimeEnv;
    createClient: (url: string, anonKey: string) => unknown;
  }) => unknown;
};

const ROOT = process.cwd();
const APP_SRC = path.join(ROOT, 'src', 'app');
const RUNTIME_ENV_FILE = path.join(APP_SRC, 'core', 'runtime', 'dashboard-env.ts');

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'] as const;
const OPTIONAL_SERVER_ENV = ['SUPABASE_SERVICE_ROLE_KEY'] as const;

function walkTsFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const files: string[] = [];
  const stack = [dirPath];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);

      if (entry.isDirectory()) {
        stack.push(absolute);
        continue;
      }

      if (!entry.isFile() || !absolute.endsWith('.ts') || absolute.endsWith('.spec.ts')) {
        continue;
      }

      files.push(absolute);
    }
  }

  return files.sort();
}

async function loadDashboardEnvModule(): Promise<DashboardEnvModule> {
  try {
    const mod = await import('../../core/runtime/dashboard-env');
    return mod as DashboardEnvModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add src/app/core/runtime/dashboard-env.ts exporting loadDashboardRuntimeEnv(source?) plus REQUIRED_DASHBOARD_ENV_KEYS and OPTIONAL_SERVER_ENV_KEYS'
    );
  }
}

async function loadSupabaseClientFactoryModule(): Promise<SupabaseClientFactoryModule> {
  try {
    const mod = await import('../../core/runtime/supabase-client.factory');
    return mod as SupabaseClientFactoryModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add src/app/core/runtime/supabase-client.factory.ts exporting createDashboardSupabaseClient({ env, createClient })'
    );
  }
}

describe('Dashboard runtime env RED contracts (single source + deterministic config)', () => {
  it('defines exact required/optional Supabase env names in one source module', async () => {
    const envModule = await loadDashboardEnvModule();

    expect(envModule.REQUIRED_DASHBOARD_ENV_KEYS).toEqual(REQUIRED_ENV);
    expect(envModule.OPTIONAL_SERVER_ENV_KEYS).toEqual(OPTIONAL_SERVER_ENV);
  });

  it('loads runtime env from provided source object (no hidden process reads)', async () => {
    const envModule = await loadDashboardEnvModule();

    const env = envModule.loadDashboardRuntimeEnv({
      SUPABASE_URL: 'https://qa-project.supabase.co',
      SUPABASE_ANON_KEY: 'qa-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'qa-service-role-key'
    });

    expect(env).toEqual({
      SUPABASE_URL: 'https://qa-project.supabase.co',
      SUPABASE_ANON_KEY: 'qa-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'qa-service-role-key'
    });
  });

  it('forbids hardcoded Supabase URL/keys in app source (must come from env)', () => {
    const tsFiles = walkTsFiles(APP_SRC);

    const offenders = tsFiles.filter((filePath) => {
      const content = fs.readFileSync(filePath, 'utf8');
      return /(https?:\/\/[\w.-]+\.supabase\.co)|(eyJ[a-z0-9_\-]{20,}\.[a-z0-9_\-]{20,})/i.test(content);
    });

    expect(offenders, 'Supabase credentials/config must never be hardcoded in app source.').toEqual([]);
  });

  it('fails with deterministic actionable message when required env vars are missing', async () => {
    const envModule = await loadDashboardEnvModule();

    expect(() =>
      envModule.loadDashboardRuntimeEnv({
        SUPABASE_URL: undefined,
        SUPABASE_ANON_KEY: ''
      })
    ).toThrowError(
      '[dashboard-env] Missing required env vars: SUPABASE_URL, SUPABASE_ANON_KEY. Add them to .env and restart dashboard runtime.'
    );
  });

  it('enforces single source of truth for env key references (outside tests)', () => {
    const tsFiles = walkTsFiles(APP_SRC).filter((filePath) => filePath !== RUNTIME_ENV_FILE);

    const offenders = tsFiles.filter((filePath) => {
      const content = fs.readFileSync(filePath, 'utf8');
      return /SUPABASE_URL|SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY/.test(content);
    });

    expect(
      offenders,
      `Supabase env keys must only be referenced from ${path.relative(ROOT, RUNTIME_ENV_FILE)}. Move key reads to single source module.`
    ).toEqual([]);
  });
});

describe('Supabase client factory RED contract (created from env values)', () => {
  it('creates Supabase client using URL + anon key from runtime env', async () => {
    const factoryModule = await loadSupabaseClientFactoryModule();

    const fakeClient = { rpc: vi.fn() };
    const createClientSpy = vi.fn(() => fakeClient);

    const client = factoryModule.createDashboardSupabaseClient({
      env: {
        SUPABASE_URL: 'https://qa-project.supabase.co',
        SUPABASE_ANON_KEY: 'qa-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'server-only-not-used-here'
      },
      createClient: createClientSpy
    });

    expect(createClientSpy).toHaveBeenCalledTimes(1);
    expect(createClientSpy).toHaveBeenCalledWith('https://qa-project.supabase.co', 'qa-anon-key');
    expect(client).toBe(fakeClient);
  });

  it('does not require service role key for dashboard/browser runtime client', async () => {
    const factoryModule = await loadSupabaseClientFactoryModule();

    const createClientSpy = vi.fn(() => ({ rpc: vi.fn() }));

    expect(() =>
      factoryModule.createDashboardSupabaseClient({
        env: {
          SUPABASE_URL: 'https://qa-project.supabase.co',
          SUPABASE_ANON_KEY: 'qa-anon-key'
        },
        createClient: createClientSpy
      })
    ).not.toThrow();
  });
});
