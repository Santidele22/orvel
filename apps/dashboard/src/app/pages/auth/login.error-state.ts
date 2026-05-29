/**
 * Login Error State Management
 *
 * Manages error state for the login page using localStorage.
 * This allows error messages to persist across retries and page reloads.
 */

const LOGIN_ERROR_KEY = 'login_error';

/**
 * Auth error structure
 */
export interface AuthError {
  message: string;
  status?: number;
  name?: string;
}

/**
 * Sets the login error state.
 * Stores the error in localStorage for persistence.
 *
 * @param error - The error to set
 */
export function setLoginError(error: AuthError): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem(LOGIN_ERROR_KEY, JSON.stringify(error));
  }
}

/**
 * Clears the login error state.
 * Removes the error from localStorage.
 */
export function clearLoginError(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.removeItem(LOGIN_ERROR_KEY);
  }
}

/**
 * Gets the current login error state.
 * @returns The current error or null if not set
 */
export function getLoginError(): AuthError | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = localStorage.getItem(LOGIN_ERROR_KEY);
    if (stored) {
      try {
        return JSON.parse(stored) as AuthError;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Checks if there is a stored login error.
 * @returns true if there is a stored error
 */
export function hasLoginError(): boolean {
  return getLoginError() !== null;
}