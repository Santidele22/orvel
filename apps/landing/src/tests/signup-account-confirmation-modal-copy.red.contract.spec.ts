import { describe, expect, it } from 'vitest';
import { loginAfterFreeSignup } from '../lib/supabase-auth-adapter';

const SIGNUP_ACCOUNT_PAGE = new URL('../pages/auth/signup/account.astro', import.meta.url);
const SIGNUP_ACCOUNT_CONTROLLER = new URL('../lib/signup-account-page-controller.ts', import.meta.url);
const AUTH_ADAPTER = new URL('../lib/supabase-auth-adapter.ts', import.meta.url);

async function readSource(url: URL): Promise<string> {
  return await import('node:fs/promises').then(({ readFile }) => readFile(url, 'utf8'));
}

describe('RED signup account confirmation modal copy contract', () => {
  it('does not use wait-for-email as the FREE success path', async () => {
    const page = await readSource(SIGNUP_ACCOUNT_PAGE);
    const controller = await readSource(SIGNUP_ACCOUNT_CONTROLLER);

    expect(page).not.toMatch(/se\s+te\s+enviar[áa]\s+un\s+email[\s\S]{0,160}confirmar\s+la\s+cuenta/i);
    expect(page).not.toMatch(/antes\s+de\s+completar\s+la\s+creaci[oó]n/i);
    expect(controller).toMatch(/signup_ready/);
    expect(controller).toMatch(/loginWithProvider|loginAfterFreeSignup/);
    expect(controller).not.toMatch(/email_confirmation_required/);
  });

  it('FREE immediate login adapter never returns email_confirmation_required', async () => {
    const adapter = await readSource(AUTH_ADAPTER);
    const controller = await readSource(SIGNUP_ACCOUNT_CONTROLLER);

    expect(controller).toMatch(/createSupabaseLoginAdapterFromEnv|loginAfterFreeSignup|signInWithPassword/);
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
