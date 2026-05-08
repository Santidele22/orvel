/**
 * Login Loading State Management
 *
 * Manages loading state for the login page using localStorage.
 * This allows loading state to persist across the session.
 */

import { LoginFormData } from './login.validators';

const LOGIN_LOADING_KEY = 'login_loading';

/**
 * Sets the loading state for login.
 *
 * @param isLoading - Whether the form is currently loading
 */
export function setLoadingState(isLoading: boolean): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem(LOGIN_LOADING_KEY, JSON.stringify(isLoading));
  }
}

/**
 * Gets the current loading state for login.
 * @returns true if loading, false otherwise
 */
export function getLoadingState(): boolean {
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = localStorage.getItem(LOGIN_LOADING_KEY);
    if (stored) {
      try {
        return JSON.parse(stored) === true;
      } catch {
        return false;
      }
    }
  }
  return false;
}

/**
 * Clears the loading state.
 */
export function clearLoadingState(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.removeItem(LOGIN_LOADING_KEY);
  }
}

/**
 * Checks if the login form is currently loading.
 * @returns true if loading
 */
export function isLoading(): boolean {
  return getLoadingState();
}

/**
 * Checks if the login form can be submitted.
 * This version checks localStorage for loading state.
 *
 * @param formData - The login form data
 * @returns true if the form can be submitted
 */
export function canSubmitForm(formData: LoginFormData): boolean {
  // Can't submit while loading (check localStorage)
  if (getLoadingState()) {
    return false;
  }

  // Both fields must be valid
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const passwordMinLength = 6;

  const emailValid = emailRegex.test(formData.email);
  const passwordValid = formData.password.length >= passwordMinLength;

  return emailValid && passwordValid;
}