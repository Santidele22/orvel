/**
 * Login Validators
 *
 * Validation functions for login form fields.
 * These functions are designed to be pure and testable.
 */

const MIN_PASSWORD_LENGTH = 6;

/**
 * Validates email format.
 * Rules:
 * - Must not be empty
 * - Must contain exactly one @ character
 * - Must have a local part (before @)
 * - Must have a domain part (after @)
 *
 * @param email - The email to validate
 * @returns true if valid, false otherwise
 */
export function validateEmail(email: string): boolean {
  if (!email || email.trim() === '') {
    return false;
  }

  const trimmedEmail = email.trim();
  const atSymbolCount = (trimmedEmail.match(/@/g) || []).length;

  if (atSymbolCount !== 1) {
    return false;
  }

  const [localPart, domainPart] = trimmedEmail.split('@');

  if (!localPart || localPart.trim() === '') {
    return false;
  }

  if (!domainPart || domainPart.trim() === '') {
    return false;
  }

  return true;
}

/**
 * Validates password minimum length.
 * Rules:
 * - Must not be empty
 * - Must be at least MIN_PASSWORD_LENGTH characters
 *
 * @param password - The password to validate
 * @returns true if valid, false otherwise
 */
export function validatePassword(password: string): boolean {
  if (!password || password.trim() === '') {
    return false;
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return false;
  }

  return true;
}

export interface LoginFormData {
  email: string;
  password: string;
}

/**
 * Checks if the login form can be submitted.
 * This includes validation + loading state check.
 *
 * @param formData - The login form data
 * @param isLoading - Whether the form is currently loading
 * @returns true if the form can be submitted
 */
export function canSubmitForm(
  formData: LoginFormData,
  isLoading: boolean = false
): boolean {
  // Can't submit while loading
  if (isLoading) {
    return false;
  }

  // Both fields must be valid
  const emailValid = validateEmail(formData.email);
  const passwordValid = validatePassword(formData.password);

  return emailValid && passwordValid;
}

/**
 * Returns the minimum password length requirement.
 * @returns Minimum password length
 */
export function getMinPasswordLength(): number {
  return MIN_PASSWORD_LENGTH;
}