/**
 * Login Router Helper
 *
 * Router-related functions for the login page.
 * Handles navigation after successful login, error handling,
 * and returnTo query param management.
 */

import { Router } from '@angular/router';
import { resolveDashboardAuthSuccessRedirect } from '../../core/auth/dashboard-auth-flow';
import { clearLoginError, setLoginError } from './login.error-state';
import { clearLoadingState } from './login.loading-state';

const PRESERVED_RETURN_TO_KEY = 'login_preserved_return_to';

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: string;
  user: {
    id: string;
    email: string;
    email_confirmed_at: string | null;
    created_at: string;
    user_metadata?: Record<string, unknown>;
  };
}

export interface AuthError {
  message: string;
  status?: number;
  name?: string;
}

export interface RouterInterface {
  navigate(commands: unknown[]): Promise<boolean>;
}

/**
 * Sanitizes the returnTo URL to prevent open redirect attacks.
 *
 * Security rules:
 * - Must start with /
 * - Cannot be an absolute URL
 * - Cannot contain path traversal
 * - Cannot start with //
 *
 * @param returnTo - The returnTo value to sanitize
 * @returns Safe returnTo value, defaults to /dashboard
 */
export function sanitizeReturnTo(returnTo: string | null | undefined): string {
  if (!returnTo) {
    return '/dashboard';
  }

  const value = returnTo.trim();

  if (!value.startsWith('/') || value.startsWith('//')) {
    return '/dashboard';
  }

  // Prevent absolute URLs (http://, https://, ftp://, etc.)
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value)) {
    return '/dashboard';
  }

  // Prevent path traversal attacks
  if (value.includes('/../') || value.endsWith('/..')) {
    return '/dashboard';
  }

  return value;
}

/**
 * Extracts the returnTo parameter from a URL.
 * Returns '/dashboard' as default when no returnTo param is present.
 *
 * @param url - The URL to parse
 * @returns The returnTo value or '/dashboard' as default
 */
export function extractReturnTo(url: string): string {
  if (!url) {
    return '/dashboard';
  }

  try {
    const urlObj = new URL(url, 'http://localhost');
    const returnTo = urlObj.searchParams.get('returnTo');
    return returnTo ?? '/dashboard';
  } catch {
    // Fallback: parse manually
    const match = url.match(/[?&]returnTo=([^&]*)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
    return '/dashboard';
  }
}

/**
 * Preserves the returnTo value across login attempts.
 *
 * @param returnTo - The returnTo value to preserve
 */
export function preserveReturnTo(returnTo: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem(PRESERVED_RETURN_TO_KEY, returnTo);
  }
}

/**
 * Handles successful login by navigating to the appropriate page.
 *
 * @param options - The options object
 * @param options.router - The Angular router
 * @param options.returnTo - The returnTo URL (from query param)
 * @param options.session - The Supabase session (optional, for session storage)
 * @returns Promise that resolves when navigation is complete
 */
export async function handleLoginSuccess(options: {
  router: Router | RouterInterface;
  returnTo: string | null;
  session?: SupabaseSession | null;
}): Promise<void> {
  const { router, returnTo } = options;

  // Clear any previous errors
  clearLoginError();
  clearLoadingState();

  // Determine navigation target through the dashboard-owned sanitizer so auth
  // callbacks never propagate access tokens, OAuth codes, or payment IDs.
  const navigationTarget = resolveDashboardAuthSuccessRedirect({ returnTo });

  // Navigate to the target
  await router.navigate([navigationTarget]);
}

/**
 * Handles login error by setting error state (no navigation).
 *
 * @param options - The options object
 * @param options.router - The Angular router
 * @param options.error - The auth error
 */
export function handleLoginError(options: {
  router: Router | RouterInterface;
  error: AuthError;
}): void {
  const { error } = options;

  // Clear loading state
  clearLoadingState();

  // Set error state for display
  setLoginError(error);

  // Do NOT navigate - stay on the login page
}

/**
 * Gets the safe redirect URL after login.
 * Prioritizes:
 * 1. returnTo query param (if provided)
 * 2. Preserved returnTo (from previous attempt)
 * 3. /dashboard/inicio (default)
 *
 * @param queryReturnTo - The returnTo from query params
 * @returns The safe redirect URL
 */
export function getRedirectUrl(queryReturnTo: string | null): string {
  // Priority 1: Query param
  if (queryReturnTo) {
    return resolveDashboardAuthSuccessRedirect({ returnTo: queryReturnTo });
  }

  // Priority 2: Preserved returnTo
  const preservedReturnTo = readPreservedReturnTo();
  if (preservedReturnTo) {
    return resolveDashboardAuthSuccessRedirect({ returnTo: preservedReturnTo });
  }

  // Priority 3: Default
  return '/dashboard/inicio';
}

/**
 * Gets the preserved returnTo value.
 *
 * @returns The preserved returnTo or null
 */
export function getPreservedReturnTo(): string | null {
  return readPreservedReturnTo();
}

function readPreservedReturnTo(): string | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return localStorage.getItem(PRESERVED_RETURN_TO_KEY);
  }
  return null;
}

/**
 * Clears the preserved returnTo value.
 */
export function clearPreservedReturnTo(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.removeItem(PRESERVED_RETURN_TO_KEY);
  }
}
