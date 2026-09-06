import { describe, expect, it } from 'vitest';
import { loginAfterFreeSignup } from '../lib/supabase-auth-adapter';

const AUTH_ADAPTER = new URL('../lib/supabase-auth-adapter.ts', import.meta.url);

async function readSource(url: URL): Promise<string> {
  return await import('node:fs/promises').then(({ readFile }) => readFile(url, 'utf8'));
}

describe('RED signup account confirmation modal copy contract', () => {
  it('FREE immediate login adapter never returns email_confirmation_required', async () => {
    const adapter = await readSource(AUTH_ADAPTER);

    expect(adapter).toMatch(/signInWithPassword/);
    expect(adapter).toMatch(/loginAfterFreeSignup/);
    expect(adapter).toMatch(/email_confirmation_required/);
    const loginAfter = adapter.match(/export\s+async\s+function\s+loginAfterFreeSignup[\s\S]*?^}/m)?.[0] ?? '';
    expect(loginAfter, 'loginAfterFreeSignup must remapped email_confirmation_required away from the FREE session path').toMatch(/email_confirmation_required/);
    expect(loginAfter).toMatch(/code:\s*['"]unknown['"]|never.*email_confirmation_required/i);
  });

  it('remaps email_confirmation_required away from the immediate FREE login path', async () => {
    const result = await loginAfterFreeSignup(async () => ({
      ok: false,
      code: 'email_confirmation_required',
      error: 'Registro exitoso. Revisá tu email para confirmar la cuenta antes de continuar.',
    }), { email: 'ana@example.com', password: 'password-segura-123' });

    expect(result).toEqual({
      ok: false,
      code: 'unknown',
      error: 'Registro exitoso. Revisá tu email para confirmar la cuenta antes de continuar.',
    });
  });

  it('keeps a successful FREE session result unchanged', async () => {
    const result = await loginAfterFreeSignup(async () => ({
      ok: true,
      token: 'access-token',
      refreshToken: 'refresh-token',
      user: { id: 'user-1', email: 'ana@example.com' },
    }), { email: 'ana@example.com', password: 'password-segura-123' });

    expect(result).toEqual({
      ok: true,
      token: 'access-token',
      refreshToken: 'refresh-token',
      user: { id: 'user-1', email: 'ana@example.com' },
    });
  });
});
