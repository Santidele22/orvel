// Auth Service - Manejo de autenticación
// Preparado para migración a Supabase Auth
// SECURE: Tokens are encrypted before storing in localStorage

import { Injectable, signal } from '@angular/core';
import { Observable, of, from, delay, tap, map } from 'rxjs';
import { User, AuthUser, LoginDTO, RegisterDTO, NEGOCIO_TEMPLATES, TipoNegocio, UserPlan } from '../models/user.model';
import {
  initEncryption,
  encryptToken,
  decryptToken,
  isEncryptionReady
} from './encrypted-token-storage';

import { createSupabaseAuthClient, type SupabaseAuthClient, type SupabaseSession } from '../core/auth/supabase-auth.client';
import { SUPABASE_CONFIG } from '../core/auth/supabase-config';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUser = signal<User | null>(null);
  private isAuthenticated = signal<boolean>(false);
  private token = signal<string | null>(null);

  // Provider: 'mock' | 'supabase'
  private provider: 'mock' | 'supabase' = 'supabase';
  private supabase: SupabaseAuthClient;

  constructor() {
    this.supabase = createSupabaseAuthClient({
      supabaseUrl: SUPABASE_CONFIG.url,
      supabaseAnonKey: SUPABASE_CONFIG.anonKey
    });

    // Initialize encryption on service creation
    initEncryption().then(() => {
      if (this.provider === 'mock') {
        this.loadStoredSession();
      } else {
        this.initializeSupabaseAuth();
      }
    });
  }

  private async initializeSupabaseAuth() {
    // 1. Get initial session from URL or LocalStorage
    const { data: { session } } = await this.supabase.getSession();
    this.updateStateFromSession(session);

    // 2. Listen for OAuth redirects and token refreshes
    this.supabase.onAuthStateChange((event, newSession) => {
      this.updateStateFromSession(newSession);
    });
  }

  private updateStateFromSession(session: SupabaseSession | null) {
    if (session && session.user) {
      const metadata = session.user.user_metadata || {};
      const user: User = {
        id: session.user.id,
        email: session.user.email || '',
        nombre: (metadata['nombre'] as string) || (metadata['full_name'] as string)?.split(' ')[0] || '',
        apellido: (metadata['apellido'] as string) || (metadata['full_name'] as string)?.split(' ').slice(1).join(' ') || '',
        negocioNombre: metadata['negocioNombre'] as string || '',
        tipoNegocio: (metadata['tipoNegocio'] as TipoNegocio) || 'otro',
        telefono: metadata['telefono'] as string,
        plan: (metadata['plan'] as UserPlan) || '',
        createdAt: new Date(session.user.created_at),
        updatedAt: new Date()
      };
      
      this.currentUser.set(user);
      this.token.set(session.access_token);
      this.isAuthenticated.set(true);
    } else {
      this.currentUser.set(null);
      this.token.set(null);
      this.isAuthenticated.set(false);
    }
  }

  // GETTERS SEÑALADOS
  user = this.currentUser.asReadonly();
  authenticated = this.isAuthenticated.asReadonly();
  authToken = this.token.asReadonly();

  login(credentials: LoginDTO): Observable<AuthUser> {
    if (this.provider === 'mock') {
      // Mock authentication
      const mockAuth = this.getMockUser(credentials.email);
      if (!mockAuth) {
        return new Observable(subscriber => {
          subscriber.error(new Error('Credenciales inválidas'));
        });
      }
      return of(mockAuth).pipe(
        delay(500),
        tap(async authUser => {
          this.currentUser.set(authUser.user);
          this.isAuthenticated.set(true);
          this.token.set(authUser.token);
          await this.saveSession(authUser);
        })
      );
    }
    return from(this.supabase.signInWithPassword({
      email: credentials.email,
      password: credentials.password
    })).pipe(
      map(({ data, error }) => {
        if (error || !data.session?.user) {
          throw new Error('AUTH_REQUIRED: Credenciales inválidas');
        }
        return this.toAuthUser(data.session);
      }),
      tap(authUser => {
        this.currentUser.set(authUser.user);
        this.isAuthenticated.set(true);
        this.token.set(authUser.token);
      })
    );
  }

  register(data: RegisterDTO): Observable<AuthUser> {
    if (this.provider === 'mock') {
      const newUser = this.createMockUser(data);
      const token = this.generateToken();
      const authUser: AuthUser = { user: newUser, token };

      return of(authUser).pipe(
        delay(500),
        tap(async auth => {
          this.currentUser.set(auth.user);
          this.isAuthenticated.set(true);
          this.token.set(auth.token);
          await this.saveSession(auth);
        })
      );
    }
    return from(this.supabase.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          nombre: data.nombre,
          apellido: data.apellido,
          negocioNombre: data.negocioNombre,
          tipoNegocio: data.tipoNegocio
        }
      }
    })).pipe(
      map(({ data: result, error }) => {
        if (error || !result.session?.user) {
          throw new Error('AUTH_REQUIRED: No active tenant session');
        }
        return this.toAuthUser(result.session);
      }),
      tap(authUser => {
        this.currentUser.set(authUser.user);
        this.isAuthenticated.set(true);
        this.token.set(authUser.token);
      })
    );
  }

  logout(): void {
    if (this.provider === 'supabase') {
      this.supabase.signOut().then(() => {
        this.currentUser.set(null);
        this.isAuthenticated.set(null as any); // Force cleanup
        this.isAuthenticated.set(false);
        this.token.set(null);
      });
    } else {
      this.currentUser.set(null);
      this.isAuthenticated.set(false);
      this.token.set(null);
      localStorage.removeItem('salon_auth');
    }
  }

  /**
   * Request a password reset email via Supabase Auth
   */
  async requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
    if (this.provider === 'mock') {
      return { success: true };
    }

    try {
      const { error } = await this.supabase.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/login`
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  getUser(): User | null {
    return this.currentUser();
  }

  getToken(): string | null {
    return this.token();
  }

  isLogged(): boolean {
    return this.isAuthenticated();
  }

  // Obtener template de negocio del usuario
  getNegocioTemplate(): { serviciosDefault: string[]; categorias: string[] } {
    const user = this.currentUser();
    if (!user) {
      return NEGOCIO_TEMPLATES['otro'];
    }
    return NEGOCIO_TEMPLATES[user.tipoNegocio];
  }

  // Cambiar provider
  setProvider(provider: 'mock' | 'supabase'): void {
    this.provider = provider;
  }

// PRIVATE HELPERS
  private toAuthUser(session: SupabaseSession): AuthUser {
    const metadata = session.user.user_metadata || {};
    return {
      user: {
        id: session.user.id,
        email: session.user.email || '',
        nombre: (metadata['nombre'] as string) || (metadata['full_name'] as string)?.split(' ')[0] || '',
        apellido: (metadata['apellido'] as string) || (metadata['full_name'] as string)?.split(' ').slice(1).join(' ') || '',
        negocioNombre: metadata['negocioNombre'] as string || '',
        tipoNegocio: (metadata['tipoNegocio'] as TipoNegocio) || 'otro',
        telefono: metadata['telefono'] as string,
        plan: (metadata['plan'] as UserPlan) || '',
        createdAt: new Date(session.user.created_at),
        updatedAt: new Date()
      },
      token: session.access_token
    };
  }

  private generateToken(): string {
    // SECURE: Use Web Crypto API for cryptographically secure random tokens
    return 'mock_' + crypto.randomUUID();
  }

  private getMockUser(email: string): AuthUser | null {
    // Hardcoded mock user
    if (email === 'demo@salon.com' || email.includes('@')) {
      const mockUser: User = {
        id: 'user-001',
        email: email,
        nombre: 'Demo',
        apellido: 'Usuario',
        negocioNombre: 'Mi Salon',
        tipoNegocio: 'uñas',
        plan: 'free',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      return { user: mockUser, token: this.generateToken() };
    }
    return null;
  }

  private createMockUser(data: RegisterDTO): User {
    return {
      id: 'user-' + Date.now(),
      email: data.email,
      nombre: data.nombre,
      apellido: data.apellido,
      negocioNombre: data.negocioNombre,
      tipoNegocio: data.tipoNegocio,
      plan: 'free',
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  private async saveSession(authUser: AuthUser): Promise<void> {
    // Encrypt token before storing
    const encryptedToken = await encryptToken(authUser.token);
    const sessionData = {
      user: authUser.user,
      token: encryptedToken,
      version: 'v2' // Version 2 indicates encrypted storage
    };
    localStorage.setItem('salon_auth', JSON.stringify(sessionData));
  }

  private async loadStoredSession(): Promise<void> {
    const stored = localStorage.getItem('salon_auth');
    if (stored) {
      try {
        const sessionData = JSON.parse(stored);

        // Check if it's the new encrypted format (v2)
        if (sessionData.version === 'v2' && isEncryptionReady()) {
          const decryptedToken = await decryptToken(sessionData.token);
          const authUser: AuthUser = {
            user: sessionData.user,
            token: decryptedToken
          };
          this.currentUser.set(authUser.user);
          this.isAuthenticated.set(true);
          this.token.set(authUser.token);
        } else if (sessionData.token) {
          // Legacy format (v1) - plain text token, migrate to encrypted
          const authUser: AuthUser = {
            user: sessionData.user,
            token: sessionData.token
          };
          this.currentUser.set(authUser.user);
          this.isAuthenticated.set(true);
          this.token.set(authUser.token);
          // Upgrade to encrypted storage on next login
          this.saveSession(authUser);
        }
      } catch (e) {
        this.logout();
      }
    }
  }
}
