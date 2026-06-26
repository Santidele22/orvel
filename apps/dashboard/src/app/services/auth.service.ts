// Auth Service - Manejo de autenticación
// Preparado para migración a Supabase Auth
// SECURE: Tokens are encrypted before storing in localStorage

import { Injectable, signal } from '@angular/core';
import { Observable, from, tap, map } from 'rxjs';
import { User, AuthUser, LoginDTO, RegisterDTO, NEGOCIO_TEMPLATES, TipoNegocio, UserPlan } from '../models/user.model';

import { createSupabaseAuthClient, type SupabaseAuthClient, type SupabaseSession } from '../core/auth/supabase-auth.client';
import { SUPABASE_CONFIG } from '../core/auth/supabase-config';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUser = signal<User | null>(null);
  private isAuthenticated = signal<boolean>(false);
  private token = signal<string | null>(null);

  private supabase: SupabaseAuthClient;

  constructor() {
    this.supabase = createSupabaseAuthClient({
      supabaseUrl: SUPABASE_CONFIG.url,
      supabaseAnonKey: SUPABASE_CONFIG.anonKey
    });
    void this.initializeSupabaseAuth();
  }

  private async initializeSupabaseAuth() {
    // 1. Get initial session from URL or LocalStorage
    const { data: { session } } = await this.supabase.getSession();
    this.updateStateFromSession(session);

    // 2. Listen for Supabase auth state changes and token refreshes
    this.supabase.onAuthStateChange((event, newSession) => {
      this.updateStateFromSession(newSession);
    });
  }

  private updateStateFromSession(session: SupabaseSession | null) {
    if (session && session.user) {
      const metadata = session.user.user_metadata || {};
      const resolvedName = this.resolveUserName(metadata);
      const user: User = {
        id: session.user.id,
        email: session.user.email || '',
        nombre: resolvedName.firstName,
        apellido: resolvedName.lastName,
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
    this.supabase.signOut().then(() => {
      this.currentUser.set(null);
      this.isAuthenticated.set(null as any); // Force cleanup
      this.isAuthenticated.set(false);
      this.token.set(null);
    });
  }

  /**
   * Request a password reset email via Supabase Auth
   */
  async requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
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

// PRIVATE HELPERS
  private toAuthUser(session: SupabaseSession): AuthUser {
    const metadata = session.user.user_metadata || {};
    const resolvedName = this.resolveUserName(metadata);
    return {
      user: {
        id: session.user.id,
        email: session.user.email || '',
        nombre: resolvedName.firstName,
        apellido: resolvedName.lastName,
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

  private resolveUserName(metadata: Record<string, unknown>): { firstName: string; lastName: string } {
    const firstName = this.readStringMetadata(metadata, 'nombre', 'first_name', 'firstName', 'given_name');
    const lastName = this.readStringMetadata(metadata, 'apellido', 'last_name', 'lastName', 'family_name');

    if (firstName || lastName) {
      return { firstName, lastName };
    }

    const fullName = this.readStringMetadata(metadata, 'full_name', 'fullName', 'name', 'display_name', 'displayName');
    const [first, ...rest] = fullName.split(/\s+/).filter(Boolean);

    return {
      firstName: first ?? '',
      lastName: rest.join(' ')
    };
  }

  private readStringMetadata(metadata: Record<string, unknown>, ...keys: string[]): string {
    for (const key of keys) {
      const value = metadata[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return '';
  }

}
