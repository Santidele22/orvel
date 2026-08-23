import { afterEach, describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';
import { loadDashboardRuntimeEnv } from '../../core/runtime/dashboard-env';

describe('dashboard runtime env source order', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalKeys = {
    PUBLIC_SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_ANON_KEY: process.env.PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  } as const;

  afterEach(() => {
    for (const [key, value] of Object.entries(originalKeys)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  });

  it('uses window __ORVEL_DASHBOARD_ENV__ over baked environment when process env is incomplete', () => {
    delete process.env.PUBLIC_SUPABASE_URL;
    delete process.env.PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const windowEnv = {
      PUBLIC_SUPABASE_URL: 'https://example-qa.supabase.co',
      PUBLIC_SUPABASE_ANON_KEY: 'qa-anon-key'
    };

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { __ORVEL_DASHBOARD_ENV__: windowEnv }
    });

    const env = loadDashboardRuntimeEnv();

    expect(env.PUBLIC_SUPABASE_URL).toBe(windowEnv.PUBLIC_SUPABASE_URL);
    expect(env.PUBLIC_SUPABASE_ANON_KEY).toBe(windowEnv.PUBLIC_SUPABASE_ANON_KEY);
    expect(env.PUBLIC_SUPABASE_URL).not.toBe(environment.supabaseUrl);
  });
});
