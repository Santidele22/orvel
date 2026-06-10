import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type DashboardRuntimeEnv = {
  PUBLIC_SUPABASE_URL: string;
  PUBLIC_SUPABASE_ANON_KEY: string;
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
};

type DashboardEnvModule = {
  REQUIRED_DASHBOARD_ENV_KEYS: readonly ['PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_ANON_KEY'];
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

const REQUIRED_ENV = ['PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_ANON_KEY'] as const;

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
      'TODO(Magnus): add src/app/core/runtime/dashboard-env.ts exporting loadDashboardRuntimeEnv(source?) plus REQUIRED_DASHBOARD_ENV_KEYS'
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
  it('defines exact required public Supabase env names in one source module', async () => {
    const envModule = await loadDashboardEnvModule();

    expect(envModule.REQUIRED_DASHBOARD_ENV_KEYS).toEqual(REQUIRED_ENV);
    expect('OPTIONAL_SERVER_ENV_KEYS' in envModule).toBe(false);
  });

  it('loads runtime env from provided source object (no hidden process reads)', async () => {
    const envModule = await loadDashboardEnvModule();

    const env = envModule.loadDashboardRuntimeEnv({
      PUBLIC_SUPABASE_URL: 'https://qa-project.supabase.co',
      PUBLIC_SUPABASE_ANON_KEY: 'qa-anon-key'
    });

    expect(env).toEqual({
      PUBLIC_SUPABASE_URL: 'https://qa-project.supabase.co',
      PUBLIC_SUPABASE_ANON_KEY: 'qa-anon-key',
      NEXT_PUBLIC_SUPABASE_URL: 'https://qa-project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'qa-anon-key'
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
        PUBLIC_SUPABASE_URL: undefined,
        PUBLIC_SUPABASE_ANON_KEY: ''
      })
    ).toThrowError(
      '[dashboard-env] Missing required env vars: PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY. Add them to .env and restart dashboard runtime.'
    );
  });

  it('does not copy server-only Supabase env names into dashboard/browser source', () => {
    const tsFiles = walkTsFiles(APP_SRC);

    const offenders = tsFiles.filter((filePath) => {
      const content = fs.readFileSync(filePath, 'utf8');
      return /SUPABASE_SERVICE_ROLE_KEY/.test(content);
    });

    expect(
      offenders,
      `Dashboard/browser source must not mention server-only Supabase env names.`
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
        PUBLIC_SUPABASE_URL: 'https://qa-project.supabase.co',
        PUBLIC_SUPABASE_ANON_KEY: 'qa-anon-key',
        NEXT_PUBLIC_SUPABASE_URL: 'https://qa-project.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'qa-anon-key'
      },
      createClient: createClientSpy
    });

    expect(createClientSpy).toHaveBeenCalledTimes(1);
    expect(createClientSpy).toHaveBeenCalledWith('https://qa-project.supabase.co', 'qa-anon-key');
    expect(client).toBe(fakeClient);
  });

  it('creates the dashboard/browser runtime client from public env only', async () => {
    const factoryModule = await loadSupabaseClientFactoryModule();

    const createClientSpy = vi.fn(() => ({ rpc: vi.fn() }));

    expect(() =>
      factoryModule.createDashboardSupabaseClient({
        env: {
          PUBLIC_SUPABASE_URL: 'https://qa-project.supabase.co',
          PUBLIC_SUPABASE_ANON_KEY: 'qa-anon-key',
          NEXT_PUBLIC_SUPABASE_URL: 'https://qa-project.supabase.co',
          NEXT_PUBLIC_SUPABASE_ANON_KEY: 'qa-anon-key'
        },
        createClient: createClientSpy
      })
    ).not.toThrow();
  });
});
