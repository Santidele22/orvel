/**
 * Signup Credentials Page - Pure Business Logic
 *
 * Contains the pure class without Angular dependencies.
 * This file can be imported by tests without Angular compilation.
 */
import type { PlanCode } from '../../core/plans/plan-entitlements';
import { readPlanSelection } from '../../features/onboarding/data-access/onboarding-plan-storage';
import { setCurrentStep } from '../../features/onboarding/data-access/onboarding-flow-state';

// Re-export PlanCode for convenience
export { PlanCode };

// Storage keys
export const ONBOARDING_CREDENTIALS_STORAGE_KEY = 'turnea.onboarding.credentials.v1';
export const ONBOARDING_PLAN_STORAGE_KEY = 'turnea.onboarding.v1';
const LEGACY_SIGNUP_ACCOUNT_METHOD_KEY = 'turnea.signup.account-method.v1';

// Validation result type
export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

// Form data type (excludes password for security)
export interface SignupCredentialsData {
  email: string;
  fullName: string;
  businessName: string;
  phone: string;
}

/**
 * Email validation - RFC compliant with trim and lowercase
 */
export function validateEmail(email: string): ValidationResult {
  const trimmed = email.trim().toLowerCase();

  if (!trimmed) {
    return { isValid: false, error: 'El email es requerido' };
  }

  // RFC 5321 simplified regex - more permissive than strict RFC 5322
  // Allows: local@domain, local+tag@domain, local@sub.domain
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  if (!emailRegex.test(trimmed)) {
    return { isValid: false, error: 'Ingresá un email válido' };
  }

  // Check for valid TLD (at least 2 chars)
  const parts = trimmed.split('@');
  if (parts.length !== 2 || parts[1].length < 4 || !parts[1].includes('.')) {
    return { isValid: false, error: 'Ingresá un email válido' };
  }

  return { isValid: true };
}

/**
 * Password validation - min 8, max 72, letter + number required
 */
export function validatePassword(password: string): ValidationResult {
  if (!password) {
    return { isValid: false, error: 'La contraseña es requerida' };
  }

  if (password.length < 8) {
    return { isValid: false, error: 'La contraseña debe tener al menos 8 caracteres' };
  }

  if (password.length > 72) {
    return { isValid: false, error: 'La contraseña no puede superar los 72 caracteres' };
  }

  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  if (!hasLetter || !hasNumber) {
    return { isValid: false, error: 'La contraseña debe contener al menos una letra y un número' };
  }

  return { isValid: true };
}

/**
 * Full name validation - 2 to 120 characters
 */
export function validateFullName(fullName: string): ValidationResult {
  const trimmed = fullName.trim();

  if (!trimmed) {
    return { isValid: false, error: 'El nombre completo es requerido' };
  }

  if (trimmed.length < 2) {
    return { isValid: false, error: 'El nombre debe tener al menos 2 caracteres' };
  }

  if (trimmed.length > 120) {
    return { isValid: false, error: 'El nombre no puede superar los 120 caracteres' };
  }

  return { isValid: true };
}

/**
 * Business name validation - 2 to 120 characters
 */
export function validateBusinessName(businessName: string): ValidationResult {
  const trimmed = businessName.trim();

  if (!trimmed) {
    return { isValid: false, error: 'El nombre del negocio es requerido' };
  }

  if (trimmed.length < 2) {
    return { isValid: false, error: 'El nombre del negocio debe tener al menos 2 caracteres' };
  }

  if (trimmed.length > 120) {
    return { isValid: false, error: 'El nombre del negocio no puede superar los 120 caracteres' };
  }

  return { isValid: true };
}

/**
 * Phone validation - E.164 format, optional
 * E.164 format: +[country code][number], max 15 digits total
 */
export function validatePhone(phone: string): ValidationResult {
  // Phone is optional
  if (!phone || phone.trim() === '') {
    return { isValid: true };
  }

  const trimmed = phone.trim();

  // Basic E.164 format: starts with + followed by 8-15 digits
  const phoneRegex = /^\+[1-9]\d{7,14}$/;

  if (!phoneRegex.test(trimmed)) {
    return { isValid: false, error: 'Ingresá un teléfono válido (ej: +5491123456789)' };
  }

  return { isValid: true };
}

/**
 * Check if all required fields are valid (email, password, fullName, businessName)
 * Phone is optional and not required for validity
 */
export function canSubmitForm(
  email: string,
  password: string,
  fullName: string,
  businessName: string,
  isLoading: boolean
): boolean {
  if (isLoading) {
    return false;
  }

  return (
    validateEmail(email).isValid &&
    validatePassword(password).isValid &&
    validateFullName(fullName).isValid &&
    validateBusinessName(businessName).isValid
  );
}

/**
 * Signup Credentials Page - Pure Business Logic Class
 *
 * Step 2 of the onboarding flow - Credentials & Profile.
 * User must fill email, password, full_name, business_name, and optionally phone.
 * Plan must be selected from Step 1.
 *
 * Flow:
 * 1. User fills in credentials (email, password, full_name, business_name, phone)
 * 2. Real-time validation on blur
 * 3. Continue button enabled when form is valid
 * 4. On submit, persist data (excluding password) to onboarding storage
 * 5. Navigate to Step 3
 */
export class SignupCredentialsPage {
  protected accountMethod: 'manual' | 'google' = 'manual';
  // Form fields
  protected email = '';
  protected password = '';
  protected fullName = '';
  protected businessName = '';
  protected phone = '';

  // Error states
  protected emailError = '';
  protected passwordError = '';
  protected fullNameError = '';
  protected businessNameError = '';
  protected phoneError = '';
  protected formError = '';

  // UI state
  protected isLoading = false;
  protected showPassword = false;

  // Router reference for navigation
  private routerRef: { navigateByUrl: (url: string) => void } | null = null;

  /**
   * Sets the router instance (for testability and production)
   */
  setRouter(router: { navigateByUrl: (url: string) => void }): void {
    this.routerRef = router;
  }

  /**
   * Checks if a plan is selected from Step 1
   */
  hasPlanSelected(): boolean {
    const storage = this.getStorage();
    if (!storage) {
      return false;
    }
    return readPlanSelection(storage) !== null;
  }

  /**
   * Gets the selected plan code
   */
  getSelectedPlan(): PlanCode | null {
    const storage = this.getStorage();
    if (!storage) {
      return null;
    }
    return readPlanSelection(storage);
  }

  /**
   * Validates email field
   */
  onEmailBlur(): void {
    const result = validateEmail(this.email);
    this.emailError = result.error || '';
  }

  /**
   * Validates password field
   */
  onPasswordBlur(): void {
    const result = validatePassword(this.password);
    this.passwordError = result.error || '';
  }

  /**
   * Validates full name field
   */
  onFullNameBlur(): void {
    const result = validateFullName(this.fullName);
    this.fullNameError = result.error || '';
  }

  /**
   * Validates business name field
   */
  onBusinessNameBlur(): void {
    const result = validateBusinessName(this.businessName);
    this.businessNameError = result.error || '';
  }

  /**
   * Validates phone field
   */
  onPhoneBlur(): void {
    const result = validatePhone(this.phone);
    this.phoneError = result.error || '';
  }

  /**
   * Validates all fields on submit
   * @returns true if form is valid
   */
  validateForm(): boolean {
    let isValid = true;

    // Clear previous errors
    this.emailError = '';
    this.passwordError = '';
    this.fullNameError = '';
    this.businessNameError = '';
    this.phoneError = '';
    this.formError = '';

    // Email validation
    const emailResult = validateEmail(this.email);
    if (!emailResult.isValid) {
      this.emailError = emailResult.error || '';
      isValid = false;
    }

    // Password validation
    const passwordResult = validatePassword(this.password);
    if (!passwordResult.isValid) {
      this.passwordError = passwordResult.error || '';
      isValid = false;
    }

    // Full name validation
    const fullNameResult = validateFullName(this.fullName);
    if (!fullNameResult.isValid) {
      this.fullNameError = fullNameResult.error || '';
      isValid = false;
    }

    // Business name validation
    const businessNameResult = validateBusinessName(this.businessName);
    if (!businessNameResult.isValid) {
      this.businessNameError = businessNameResult.error || '';
      isValid = false;
    }

    // Phone validation (optional)
    const phoneResult = validatePhone(this.phone);
    if (!phoneResult.isValid) {
      this.phoneError = phoneResult.error || '';
      isValid = false;
    }

    return isValid;
  }

  /**
   * Checks if user can proceed to next step
   */
  canContinue(): boolean {
    if (this.accountMethod === 'google') {
      return !this.isLoading;
    }
    return canSubmitForm(this.email, this.password, this.fullName, this.businessName, this.isLoading);
  }

  /**
   * Handles continue action - persists credentials and navigates
   */
  continue(): void {
    if (this.accountMethod === 'google') {
      const storage = this.getStorage();
      if (storage) {
        storage.setItem(LEGACY_SIGNUP_ACCOUNT_METHOD_KEY, 'google');
        setCurrentStep(storage, 'business-types');
      }
      if (this.routerRef) {
        this.routerRef.navigateByUrl('/auth/signup/complete');
      }
      return;
    }

    if (!this.validateForm() || !this.canContinue()) {
      return;
    }

    // Check that plan is selected
    if (!this.hasPlanSelected()) {
      this.formError = 'Debés seleccionar un plan primero';
      return;
    }

    // Persist credentials (excluding password for security)
    const storage = this.getStorage();
    if (storage) {
      const credentialsData: SignupCredentialsData = {
        email: this.email.trim().toLowerCase(),
        fullName: this.fullName.trim(),
        businessName: this.businessName.trim(),
        phone: this.phone.trim()
      };
      storage.setItem(ONBOARDING_CREDENTIALS_STORAGE_KEY, JSON.stringify(credentialsData));
      storage.setItem(LEGACY_SIGNUP_ACCOUNT_METHOD_KEY, 'manual');
      setCurrentStep(storage, 'business-types');
    }

    if (this.routerRef) {
      this.routerRef.navigateByUrl('/auth/signup/complete');
    }
  }

  selectAccountMethod(method: 'manual' | 'google'): void {
    this.accountMethod = method;
    this.formError = '';
  }

  /**
   * Handles back navigation to plan selection
   */
  goBack(): void {
    if (this.routerRef) {
      this.routerRef.navigateByUrl('/auth/signup/plan');
    }
  }

  /**
   * Toggles password visibility
   */
  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  /**
   * Gets storage object
   */
  protected getStorage(): Storage | null {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    return null;
  }

  /**
   * Load persisted credentials from storage
   */
  loadPersistedCredentials(): void {
    const storage = this.getStorage();
    if (!storage) {
      return;
    }

    try {
      const stored = storage.getItem(ONBOARDING_CREDENTIALS_STORAGE_KEY);
      if (stored) {
        const data: SignupCredentialsData = JSON.parse(stored);
        this.email = data.email || '';
        this.fullName = data.fullName || '';
        this.businessName = data.businessName || '';
        this.phone = data.phone || '';
      }
    } catch {
      // Invalid stored data, ignore
    }
  }

  constructor() {
    // Load any persisted credentials on init
    this.loadPersistedCredentials();
  }
}

/**
 * Read persisted credentials from storage
 */
export function readPersistedCredentials(storage: Pick<Storage, 'getItem'>): SignupCredentialsData | null {
  try {
    const stored = storage.getItem(ONBOARDING_CREDENTIALS_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as SignupCredentialsData;
    }
  } catch {
    // Invalid stored data
  }
  return null;
}

/**
 * Check if plan is selected
 */
export function isPlanSelected(storage: Pick<Storage, 'getItem'>): boolean {
  return readPlanSelection(storage) !== null;
}

/**
 * Get selected plan code
 */
export function getSelectedPlanCode(storage: Pick<Storage, 'getItem'>): PlanCode | null {
  return readPlanSelection(storage);
}
