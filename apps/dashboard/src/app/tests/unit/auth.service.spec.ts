// ============================================
// Unit Tests - AuthService
// ============================================
// AuthService now delegates to the canonical Supabase auth session.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import type { SupabaseAuthClient, SupabaseSession } from '../../core/auth/supabase-auth.client';

const authClient = vi.hoisted(() => ({
  getSession: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  onAuthStateChange: vi.fn()
}));

vi.mock('../../core/auth/supabase-auth.client', () => ({
  createSupabaseAuthClient: vi.fn(() => authClient),
  ORVEL_SUPABASE_AUTH_STORAGE_KEY: 'orvel-dashboard-auth'
}));

function session(overrides: Partial<SupabaseSession> = {}): SupabaseSession {
  return {
    access_token: 'supabase-access-token',
    refresh_token: 'supabase-refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: 'user-123',
      email: 'demo@salon.com',
      email_confirmed_at: '2026-06-10T00:00:00.000Z',
      created_at: '2026-06-10T00:00:00.000Z',
      user_metadata: {
        nombre: 'Demo',
        apellido: 'Salon',
        negocioNombre: 'Demo Salon',
        tipoNegocio: 'uñas',
        plan: 'free'
      }
    },
    ...overrides
  };
}

async function flushAuthInitialization(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('AuthService - Supabase-backed auth', () => {
  let service: AuthService;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    authClient.getSession.mockResolvedValue({ data: { session: null }, error: null });
    authClient.signOut.mockResolvedValue({ error: null });
    authClient.resetPasswordForEmail.mockResolvedValue({ error: null });
    authClient.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    service = new AuthService();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('login()', () => {
    it('authenticates only through Supabase credentials and maps the returned session', async () => {
      const supabaseSession = session();
      authClient.signInWithPassword.mockResolvedValue({
        data: { session: supabaseSession, user: supabaseSession.user },
        error: null
      });

      const result = await firstValueFrom(service.login({ email: 'demo@salon.com', password: 'real-password' }));

      expect(authClient.signInWithPassword).toHaveBeenCalledWith({
        email: 'demo@salon.com',
        password: 'real-password'
      });
      expect(result.user.email).toBe('demo@salon.com');
      expect(result.user.negocioNombre).toBe('Demo Salon');
      expect(result.token).toBe('supabase-access-token');
      expect(result.token).not.toContain('mock_');
      expect(service.isLogged()).toBe(true);
      expect(service.getUser()?.email).toBe('demo@salon.com');
    });

    it('fails closed when Supabase rejects credentials', async () => {
      authClient.signInWithPassword.mockResolvedValue({
        data: { session: null, user: null },
        error: { message: 'Invalid login credentials', status: 400 }
      });

      await expect(
        firstValueFrom(service.login({ email: 'invalid@salon.com', password: 'wrong' }))
      ).rejects.toThrow('AUTH_REQUIRED: Credenciales inválidas');

      expect(service.isLogged()).toBe(false);
      expect(service.getUser()).toBeNull();
      expect(service.getToken()).toBeNull();
    });

    it('fails closed when Supabase returns no active session', async () => {
      authClient.signInWithPassword.mockResolvedValue({
        data: { session: null, user: { id: 'user-without-session' } },
        error: null
      });

      await expect(
        firstValueFrom(service.login({ email: 'any@email.com', password: 'any' }))
      ).rejects.toThrow('AUTH_REQUIRED: Credenciales inválidas');
    });
  });

  describe('register()', () => {
    it('creates the Supabase user with metadata and requires an active returned session', async () => {
      const supabaseSession = session({
        access_token: 'registered-access-token',
        user: {
          ...session().user,
          email: 'new@user.com',
          user_metadata: {
            nombre: 'Nuevo',
            apellido: 'Usuario',
            negocioNombre: 'Mi Salon',
            tipoNegocio: 'uñas'
          }
        }
      });
      authClient.signUp.mockResolvedValue({ data: { session: supabaseSession, user: supabaseSession.user }, error: null });

      const result = await firstValueFrom(
        service.register({
          email: 'new@user.com',
          password: 'password123',
          nombre: 'Nuevo',
          apellido: 'Usuario',
          negocioNombre: 'Mi Salon',
          tipoNegocio: 'uñas'
        })
      );

      expect(authClient.signUp).toHaveBeenCalledWith({
        email: 'new@user.com',
        password: 'password123',
        options: {
          data: {
            nombre: 'Nuevo',
            apellido: 'Usuario',
            negocioNombre: 'Mi Salon',
            tipoNegocio: 'uñas'
          }
        }
      });
      expect(result.user.email).toBe('new@user.com');
      expect(result.user.negocioNombre).toBe('Mi Salon');
      expect(result.token).toBe('registered-access-token');
      expect(result.token).not.toContain('mock_');
    });

    it('rejects signup responses that do not include an active Supabase session', async () => {
      authClient.signUp.mockResolvedValue({ data: { session: null, user: null }, error: null });

      await expect(
        firstValueFrom(
          service.register({
            email: 'pending@user.com',
            password: 'password123',
            nombre: 'Pending',
            apellido: 'User',
            negocioNombre: 'Pending Salon',
            tipoNegocio: 'spa'
          })
        )
      ).rejects.toThrow('AUTH_REQUIRED: No active tenant session');
    });
  });

  describe('Session management', () => {
    it('loads the initial session from Supabase instead of legacy salon_auth localStorage', async () => {
      const supabaseSession = session({ access_token: 'stored-supabase-token' });
      authClient.getSession.mockResolvedValue({ data: { session: supabaseSession }, error: null });
      localStorage.setItem('salon_auth', JSON.stringify({ user: { email: 'legacy@salon.com' }, token: 'mock_stored_token' }));

      const newService = new AuthService();
      await flushAuthInitialization();

      expect(newService.isLogged()).toBe(true);
      expect(newService.getUser()?.email).toBe('demo@salon.com');
      expect(newService.getToken()).toBe('stored-supabase-token');
    });

    it('ignores corrupt legacy localStorage and remains logged out without a Supabase session', async () => {
      localStorage.setItem('salon_auth', 'invalid-json');

      const newService = new AuthService();
      await flushAuthInitialization();

      expect(newService.isLogged()).toBe(false);
      expect(newService.getUser()).toBeNull();
    });

    it('clears local auth state on logout', async () => {
      const supabaseSession = session();
      authClient.signInWithPassword.mockResolvedValue({ data: { session: supabaseSession, user: supabaseSession.user }, error: null });
      await firstValueFrom(service.login({ email: 'demo@salon.com', password: 'demo' }));

      service.logout();
      await flushAuthInitialization();

      expect(authClient.signOut).toHaveBeenCalled();
      expect(service.isLogged()).toBe(false);
      expect(service.getUser()).toBeNull();
      expect(service.getToken()).toBeNull();
    });
  });

  describe('getNegocioTemplate()', () => {
    it('returns the user business template after Supabase login maps tipoNegocio', async () => {
      const supabaseSession = session();
      authClient.signInWithPassword.mockResolvedValue({ data: { session: supabaseSession, user: supabaseSession.user }, error: null });
      await firstValueFrom(service.login({ email: 'demo@salon.com', password: 'demo' }));

      const template = service.getNegocioTemplate();

      expect(template.serviciosDefault).toContain('Manicura');
      expect(template.categorias).toContain('Uñas');
    });

    it('returns the safe default template when there is no authenticated user', () => {
      const template = service.getNegocioTemplate();

      expect(template.categorias).toContain('General');
    });
  });

  describe('Edge Cases', () => {
    it('handles multiple logout calls without throwing', () => {
      expect(() => {
        service.logout();
        service.logout();
        service.logout();
      }).not.toThrow();
    });

    it('returns null user and token before login', () => {
      expect(service.getUser()).toBeNull();
      expect(service.getToken()).toBeNull();
    });
  });
});
