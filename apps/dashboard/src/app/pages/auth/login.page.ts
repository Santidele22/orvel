import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  clearLoginError,
  getLoginError,
  setLoginError
} from './login.error-state';
import {
  clearLoadingState,
  getLoadingState,
  setLoadingState
} from './login.loading-state';
import {
  extractReturnTo,
  getRedirectUrl,
  handleLoginError,
  handleLoginSuccess,
  sanitizeReturnTo
} from './login.router-helper';
import {
  canSubmitForm,
  LoginFormData,
  validateEmail,
  validatePassword
} from './login.validators';
import { createSupabaseAuthClient } from '../../core/auth/supabase-auth.client';
import { SUPABASE_CONFIG } from '../../core/auth/supabase-config';
import { normalizeDashboardAuthRequest } from '../../core/auth/dashboard-auth-flow';
import { setCurrentStep } from '../../features/onboarding/data-access/onboarding-flow-state';

const GENERIC_LOGIN_ERROR_MESSAGE = 'Credenciales inválidas o sesión no disponible';

/**
 * Login Page Component
 *
 * Credentials-only login for existing users.
 * No plan selection, no business-type selection.
 *
 * Flow:
 * 1. User enters email + password
 * 2. Clicks submit
 * 3. If valid → navigate to /dashboard/inicio (or returnTo)
 * 4. If invalid → show error, stay on page
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss'
})
export class LoginPage implements OnInit {
  // Form state
  protected email = '';
  protected password = '';
  protected emailError = '';
  protected passwordError = '';
  protected formError = '';

  // UI state
  protected isLoading = false;
  protected showPassword = false;

  // Injected services
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  ngOnInit(): void {
    const authRequest = normalizeDashboardAuthRequest(typeof window !== 'undefined' ? window.location.href : '/auth');
    if (authRequest.mode === 'signup') {
      void this.router.navigate(['/auth/signup/plan'], { queryParams: { returnTo: authRequest.returnTo } });
      return;
    }

    // Clear any previous errors
    clearLoginError();

    // Load any stored error
    const storedError = getLoginError();
    if (storedError) {
      this.formError = storedError.message;
    }

    // Clear loading state on mount
    clearLoadingState();

    // Initialize loading state
    this.isLoading = getLoadingState();
  }

  /**
   * Handles email input change with validation.
   */
  protected onEmailChange(value: string): void {
    this.email = value;
    this.emailError = '';

    if (value && !validateEmail(value)) {
      this.emailError = 'Ingresá un email válido';
    }
  }

  /**
   * Handles password input change with validation.
   */
  protected onPasswordChange(value: string): void {
    this.password = value;
    this.passwordError = '';

    if (value && value.length < 6) {
      this.passwordError = 'La contraseña debe tener al menos 6 caracteres';
    }
  }

  /**
   * Validates the entire form.
   * @returns true if form is valid
   */
  private validateForm(): boolean {
    let isValid = true;

    // Clear previous errors
    this.emailError = '';
    this.passwordError = '';
    this.formError = '';

    // Email validation
    if (!this.email.trim()) {
      this.emailError = 'El email es requerido';
      isValid = false;
    } else if (!validateEmail(this.email)) {
      this.emailError = 'Ingresá un email válido';
      isValid = false;
    }

    // Password validation
    if (!this.password) {
      this.passwordError = 'La contraseña es requerida';
      isValid = false;
    } else if (!validatePassword(this.password)) {
      this.passwordError = 'La contraseña debe tener al menos 6 caracteres';
      isValid = false;
    }

    return isValid;
  }

  /**
   * Handles form submission.
   * Calls Supabase signInWithPassword and handles result.
   */
  protected async onSubmit(): Promise<void> {
    // Validate form
    if (!this.validateForm()) {
      return;
    }

    // Check loading state
    if (this.isLoading) {
      return;
    }

    // Clear previous errors
    clearLoginError();
    this.formError = '';

    // Set loading state
    this.isLoading = true;
    setLoadingState(true);

    try {
      // Get Supabase auth client
      const authClient = createSupabaseAuthClient({
        supabaseUrl: SUPABASE_CONFIG.url,
        supabaseAnonKey: SUPABASE_CONFIG.anonKey
      });

      // Call Supabase signInWithPassword
      const { data, error } = await authClient.signInWithPassword({
        email: this.email.trim(),
        password: this.password
      });

      if (error) {
        // Login failed - show error and stay on page
        const safeMessage = GENERIC_LOGIN_ERROR_MESSAGE;
        this.formError = safeMessage;
        setLoginError({ message: safeMessage });
        handleLoginError({
          router: this.router,
          error: { message: safeMessage }
        });
        return;
      }

      // Login successful - get returnTo and navigate
      const returnTo = extractReturnTo(window.location.search);
      const redirectUrl = getRedirectUrl(returnTo);

      // Handle success (navigates to redirectUrl)
      if (typeof window !== 'undefined' && window.localStorage) {
        setCurrentStep(window.localStorage, 'dashboard');
      }
      await handleLoginSuccess({
        router: this.router,
        returnTo: redirectUrl,
        session: data.session
      });
    } catch {
      // Unexpected error
      const message = 'Ocurrió un error inesperado. Intentá nuevamente.';
      this.formError = message;
      setLoginError({ message });
      handleLoginError({
        router: this.router,
        error: { message }
      });
    } finally {
      // Clear loading state
      this.isLoading = false;
      clearLoadingState();
    }
  }

  /**
   * Toggles password visibility.
   */
  protected togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  /**
   * Checks if form can be submitted.
   */
  protected get canSubmit(): boolean {
    return canSubmitForm(
      { email: this.email, password: this.password },
      this.isLoading
    );
  }
}
