/**
 * KB-002: Supabase Auth Client
 *
 * Real Supabase Auth integration for the Turnea dashboard.
 * Provides authentication methods using @supabase/supabase-js.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseAuthConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export interface SupabaseUser {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  created_at: string;
  user_metadata?: Record<string, unknown>;
}

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: string;
  user: SupabaseUser;
}

export interface AuthError {
  message: string;
  status?: number;
  name?: string;
}

export interface GetSessionResult {
  data: { session: SupabaseSession | null };
  error: AuthError | null;
}

export interface SignInResult {
  data: { session: SupabaseSession | null; user: SupabaseUser | null };
  error: AuthError | null;
}

export interface SignUpResult {
  data: { session: SupabaseSession | null; user: SupabaseUser | null };
  error: AuthError | null;
}

export interface SignOutResult {
  error: AuthError | null;
}

export interface ResetPasswordResult {
  error: AuthError | null;
}

export interface UpdateUserResult {
  data: { user: SupabaseUser | null };
  error: AuthError | null;
}

export interface AuthStateChangeCallback {
  (event: string, session: SupabaseSession | null): void;
}

export interface AuthStateSubscription {
  data: {
    subscription: {
      unsubscribe: () => void;
    };
  };
}

/**
 * Creates a Supabase Auth client configured for Turnea.
 *
 * @param config - Configuration with supabaseUrl and supabaseAnonKey
 * @returns SupabaseAuthClient instance
 */
export function createSupabaseAuthClient(
  config: SupabaseAuthConfig
): SupabaseAuthClient {
  const client: SupabaseClient = createClient(
    config.supabaseUrl,
    config.supabaseAnonKey,
    {
      auth: {
        flowType: 'pkce',
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      }
    }
  );

  return new SupabaseAuthClientAdapter(client);
}

/**
 * Adapter class that wraps Supabase client and provides typed auth methods.
 */
class SupabaseAuthClientAdapter {
  constructor(private readonly client: SupabaseClient) {}

  /**
   * Gets the current session from storage.
   */
  async getSession(): Promise<GetSessionResult> {
    try {
      const { data, error } = await this.client.auth.getSession();

      if (error) {
        return {
          data: { session: this.mapSession(data?.session) },
          error: { message: error.message, status: error.status }
        };
      }

      return {
        data: { session: this.mapSession(data?.session) },
        error: null
      };
    } catch (err) {
      return {
        data: { session: null },
        error: { message: (err as Error).message }
      };
    }
  }

  /**
   * Signs in with email and password.
   */
  async signInWithPassword(credentials: {
    email: string;
    password: string;
  }): Promise<SignInResult> {
    try {
      const { data, error } = await this.client.auth.signInWithPassword(credentials);

      if (error) {
        return {
          data: { session: this.mapSession(data?.session), user: null },
          error: { message: error.message, status: error.status }
        };
      }

      return {
        data: {
          session: this.mapSession(data?.session),
          user: this.mapUser(data?.user ?? null)
        },
        error: null
      };
    } catch (err) {
      return {
        data: { session: null, user: null },
        error: { message: (err as Error).message }
      };
    }
  }

  /**
   * Signs up a new user with email and password.
   */
  async signUp(credentials: {
    email: string;
    password: string;
    options?: {
      data?: Record<string, unknown>;
      emailRedirectTo?: string;
    };
  }): Promise<SignUpResult> {
    try {
      const { data, error } = await this.client.auth.signUp({
        email: credentials.email,
        password: credentials.password,
        options: credentials.options
      });

      if (error) {
        return {
          data: { session: this.mapSession(data?.session), user: null },
          error: { message: error.message, status: error.status }
        };
      }

      return {
        data: {
          session: this.mapSession(data?.session),
          user: this.mapUser(data?.user ?? null)
        },
        error: null
      };
    } catch (err) {
      return {
        data: { session: null, user: null },
        error: { message: (err as Error).message }
      };
    }
  }

  /**
   * Signs out the current user.
   */
  async signOut(): Promise<SignOutResult> {
    try {
      const { error } = await this.client.auth.signOut();

      if (error) {
        return {
          error: { message: error.message, status: error.status }
        };
      }

      return { error: null };
    } catch (err) {
      return {
        error: { message: (err as Error).message }
      };
    }
  }

  /**
   * Sends password reset email.
   */
  async resetPasswordForEmail(
    email: string,
    options?: {
      redirectTo?: string;
    }
  ): Promise<ResetPasswordResult> {
    try {
      const { error } = await this.client.auth.resetPasswordForEmail(email, {
        redirectTo: options?.redirectTo
      });

      if (error) {
        return {
          error: { message: error.message, status: error.status }
        };
      }

      return { error: null };
    } catch (err) {
      return {
        error: { message: (err as Error).message }
      };
    }
  }

  /**
   * Updates the current authenticated user's metadata.
   */
  async updateUser(input: { data: Record<string, unknown> }): Promise<UpdateUserResult> {
    try {
      const { data, error } = await this.client.auth.updateUser({ data: input.data });

      if (error) {
        return {
          data: { user: this.mapUser(data?.user ?? null) },
          error: { message: error.message, status: error.status }
        };
      }

      return {
        data: { user: this.mapUser(data?.user ?? null) },
        error: null
      };
    } catch (err) {
      return {
        data: { user: null },
        error: { message: (err as Error).message }
      };
    }
  }

  /**
   * Subscribes to authentication state changes.
   */
  onAuthStateChange(callback: AuthStateChangeCallback): AuthStateSubscription {
    const subscription = this.client.auth.onAuthStateChange((event, session) => {
      callback(event, this.mapSession(session));
    });

    return {
      data: {
        subscription: {
          unsubscribe: () => {
            subscription.data.subscription.unsubscribe();
          }
        }
      }
    };
  }

  /**
   * Maps Supabase session to our interface.
   */
  private mapSession(
    session: import('@supabase/supabase-js').Session | null
  ): SupabaseSession | null {
    if (!session) {
      return null;
    }

    const mappedUser = this.mapUser(session.user);
    if (!mappedUser) {
      return null;
    }

    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      token_type: session.token_type,
      user: mappedUser
    };
  }

  /**
   * Maps Supabase user to our interface.
   */
  private mapUser(
    user: import('@supabase/supabase-js').User | null
  ): SupabaseUser | null {
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email ?? '',
      email_confirmed_at: user.email_confirmed_at ?? null,
      created_at: user.created_at,
      user_metadata: user.user_metadata
    };
  }
}

// Re-export the Supabase Auth client interface
export interface SupabaseAuthClient {
  getSession(): Promise<GetSessionResult>;
  signInWithPassword(credentials: {
    email: string;
    password: string;
  }): Promise<SignInResult>;
  signUp(credentials: {
    email: string;
    password: string;
    options?: {
      data?: Record<string, unknown>;
      emailRedirectTo?: string;
    };
  }): Promise<SignUpResult>;
  signOut(): Promise<SignOutResult>;
  resetPasswordForEmail(
    email: string,
    options?: {
      redirectTo?: string;
    }
  ): Promise<ResetPasswordResult>;
  updateUser(input: { data: Record<string, unknown> }): Promise<UpdateUserResult>;
  onAuthStateChange(callback: AuthStateChangeCallback): AuthStateSubscription;
}
