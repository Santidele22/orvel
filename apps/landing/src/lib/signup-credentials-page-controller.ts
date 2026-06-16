import { ARGENTINA_AREA_CODE_DATA_VERSION } from './argentina-area-codes';
import { SIGNUP_STORAGE_KEYS } from './browser-storage-keys';
import {
  SIGNUP_CREDENTIAL_FIELDS,
  mapSignupCredentialErrorsForAstro,
  normalizeArgentinaPhone,
  validateSignupCredentials,
  type SignupCredentialField,
  type SignupCredentialsInput
} from './signup-credentials-validation';

type SignupEnv = {
  PUBLIC_DASHBOARD_URL?: string;
  PUBLIC_SUPABASE_URL?: string;
  PUBLIC_SUPABASE_ANON_KEY?: string;
};

const VALID_SIGNUP_PLANS = ['FREE', 'STARTER', 'GROWTH', 'PRO'] as const;

const normalizeSignupPlan = (rawPlan: string | null) => rawPlan?.trim().toUpperCase() ?? '';
const normalizeBillingPeriod = (raw: string | null) => {
  const normalized = raw?.trim().toLowerCase();
  return normalized === 'quarterly' || normalized === 'annual' ? normalized : 'monthly';
};
const isValidSignupPlan = (rawPlan: string | null) =>
  VALID_SIGNUP_PLANS.includes(normalizeSignupPlan(rawPlan) as typeof VALID_SIGNUP_PLANS[number]);

export function initSignupCredentialsPage(env: SignupEnv): void {
  if (typeof window === 'undefined') return;

  const form = document.getElementById('credentialsForm') as HTMLFormElement | null;
  if (!form) return;

  const searchParams = new URLSearchParams(window.location.search);
  const explicitPlan = searchParams.get('plan');
  const hasValidSignupPlan = Boolean(explicitPlan?.trim()) && isValidSignupPlan(explicitPlan);
  const plan = hasValidSignupPlan ? normalizeSignupPlan(explicitPlan) : '';
  const isExplicitFreePlan = normalizeSignupPlan(explicitPlan) === 'FREE';
  const isPaidPlan = plan !== 'FREE';
  const billing = normalizeBillingPeriod(isExplicitFreePlan ? searchParams.get('billing') : searchParams.get('billing') || sessionStorage.getItem(SIGNUP_STORAGE_KEYS.billing));
  const missingPlanRedirectUrl = '/auth/signup/plan?reason=missing_plan&intent=create_account';
  const invalidPlanRedirectUrl = '/auth/signup/plan?reason=invalid_plan&intent=create_account';
  let planSelectionRedirectUrl = missingPlanRedirectUrl;
  let redirectNoticeTimeout: ReturnType<typeof setTimeout> | undefined;

  form.dataset.areaCodeDataVersion = ARGENTINA_AREA_CODE_DATA_VERSION;

  const openRedirectNotice = () => {
    const redirectNotice = document.getElementById('create-account-redirect-notice');
    redirectNotice?.classList.remove('hidden');
    redirectNotice?.setAttribute('aria-hidden', 'false');
    document.getElementById('create-account-redirect-notice-title')?.focus();
    redirectNotice?.setAttribute('aria-label', 'Primero elegí un plan');
    window.clearTimeout(redirectNoticeTimeout);
    redirectNoticeTimeout = setTimeout(() => {
      window.location.href = planSelectionRedirectUrl;
    }, 5000);
  };
  document.getElementById('create-account-redirect-continue-now')?.addEventListener('click', () => {
    window.clearTimeout(redirectNoticeTimeout);
    window.location.href = planSelectionRedirectUrl;
  });
  const redirectToPlanSelection = (reason: 'missing_plan' | 'invalid_plan') => {
    sessionStorage.removeItem(SIGNUP_STORAGE_KEYS.plan);
    sessionStorage.removeItem(SIGNUP_STORAGE_KEYS.billing);
    planSelectionRedirectUrl = reason === 'missing_plan' ? missingPlanRedirectUrl : invalidPlanRedirectUrl;
    openRedirectNotice();
  };

  if (!explicitPlan?.trim()) {
    sessionStorage.removeItem(SIGNUP_STORAGE_KEYS.plan);
    sessionStorage.removeItem(SIGNUP_STORAGE_KEYS.billing);
  } else if (!isValidSignupPlan(explicitPlan)) {
    redirectToPlanSelection('invalid_plan');
  }
  if (hasValidSignupPlan) {
    sessionStorage.setItem(SIGNUP_STORAGE_KEYS.plan, plan);
    sessionStorage.setItem(SIGNUP_STORAGE_KEYS.billing, billing);
  }
  if (hasValidSignupPlan && (isExplicitFreePlan || plan === 'FREE')) {
    sessionStorage.removeItem(SIGNUP_STORAGE_KEYS.pendingSignupIntent);
  }

  const passwordFields = document.getElementById('passwordFields');
  const passwordInput = document.getElementById('password') as HTMLInputElement | null;
  const confirmPasswordInput = document.getElementById('confirmPassword') as HTMLInputElement | null;
  if (hasValidSignupPlan && isPaidPlan) {
    passwordFields?.classList.add('hidden');
    passwordInput?.removeAttribute('required');
    confirmPasswordInput?.removeAttribute('required');
  }

  const backLink = document.getElementById('backLink') as HTMLAnchorElement | null;
  if (backLink) {
    backLink.href = hasValidSignupPlan
      ? `/auth/signup/plan?plan=${encodeURIComponent(plan)}&billing=${encodeURIComponent(billing)}`
      : missingPlanRedirectUrl;
  }

  const readSignupCredentialValues = (): SignupCredentialsInput => ({
    nombre: form.querySelector<HTMLInputElement>('input[name="nombre"]')?.value ?? '',
    apellido: form.querySelector<HTMLInputElement>('input[name="apellido"]')?.value ?? '',
    negocioNombre: form.querySelector<HTMLInputElement>('input[name="negocioNombre"]')?.value ?? '',
    telefonoCaracteristica: form.querySelector<HTMLInputElement>('input[name="telefonoCaracteristica"]')?.value ?? '',
    telefonoNumero: form.querySelector<HTMLInputElement>('input[name="telefonoNumero"]')?.value ?? '',
    email: form.querySelector<HTMLInputElement>('input[name="email"]')?.value ?? '',
    password: form.querySelector<HTMLInputElement>('input[name="password"]')?.value ?? '',
    confirm: form.querySelector<HTMLInputElement>('input[name="confirm"]')?.value ?? ''
  });
  const getFieldError = (fieldName: SignupCredentialField, value?: string, requirePassword = !isPaidPlan) => {
    const current = readSignupCredentialValues();
    const result = validateSignupCredentials({ ...current, [fieldName]: value ?? current[fieldName] }, { requirePassword });
    return mapSignupCredentialErrorsForAstro(result)[fieldName] ?? '';
  };
  const validators = {
    nombre: (val: string) => getFieldError('nombre', val),
    apellido: (val: string) => getFieldError('apellido', val),
    negocioNombre: (val: string) => getFieldError('negocioNombre', val),
    telefonoCaracteristica: (val: string) => getFieldError('telefonoCaracteristica', val),
    telefonoNumero: (val: string) => getFieldError('telefonoNumero', val),
    email: (val: string) => getFieldError('email', val),
    password: (val: string) => getFieldError('password', val),
    confirm: (val: string) => getFieldError('confirm', val)
  };
  const paintFieldError = (input: HTMLInputElement, message: string) => {
    const fieldName = input.name as SignupCredentialField;
    const errorEl = document.getElementById(`error-${fieldName === 'confirm' ? 'confirm' : fieldName}`);
    if (message) {
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
      }
      input.classList.add('border-error', 'bg-error/5');
      return false;
    }
    errorEl?.classList.add('hidden');
    input.classList.remove('border-error', 'bg-error/5');
    return true;
  };
  const validateField = (input: HTMLInputElement) => {
    const fieldName = input.name as keyof typeof validators;
    return validators[fieldName] ? paintFieldError(input, validators[fieldName](input.value)) : true;
  };
  const validateForm = () => {
    const result = validateSignupCredentials(readSignupCredentialValues(), { requirePassword: !isPaidPlan });
    const fieldErrors = mapSignupCredentialErrorsForAstro(result);
    let valid = true;
    form.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
      const fieldName = input.name as SignupCredentialField;
      if (SIGNUP_CREDENTIAL_FIELDS.includes(fieldName) && !paintFieldError(input, fieldErrors[fieldName] ?? '')) valid = false;
    });
    return valid;
  };
  const validateNonSensitiveCredentials = (fields = ['nombre', 'apellido', 'negocioNombre', 'telefonoCaracteristica', 'telefonoNumero', 'email']) => {
    const result = validateSignupCredentials(readSignupCredentialValues(), { requirePassword: false });
    const fieldErrors = mapSignupCredentialErrorsForAstro(result);
    let valid = true;
    fields.forEach((field) => {
      const input = form.querySelector<HTMLInputElement>(`input[name="${field}"]`);
      const fieldName = field as SignupCredentialField;
      if (input && !paintFieldError(input, fieldErrors[fieldName] ?? '')) valid = false;
    });
    return valid;
  };
  const allRequiredFieldsComplete = () => Array.from(form.querySelectorAll<HTMLInputElement>('input[required]'))
    .every((input) => input.value.trim() && validateField(input));
  const updateContinueButtonState = () => {
    const button = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    if (button) button.disabled = !allRequiredFieldsComplete();
  };
  const createProtectedPendingSignupIntent = async (values: { email: string; first_name: string; last_name: string; business_name: string; phone: string }) => {
    const protectionResponse = await fetch('/api/signup/pending-intent/protect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values)
    });
    const protectionResult = await protectionResponse.json().catch(() => null);
    if (!protectionResponse.ok || !protectionResult?.protected_pending_signup_intent) throw new Error('pending_signup_protection_failed');
    return protectionResult.protected_pending_signup_intent;
  };
  const readSubmitValues = () => {
    const values = readSignupCredentialValues();
    return {
      ...values,
      nombre: values.nombre.trim(),
      apellido: values.apellido.trim(),
      negocioNombre: values.negocioNombre.trim(),
      telefonoCaracteristica: values.telefonoCaracteristica.trim(),
      telefonoNumero: values.telefonoNumero.trim(),
      email: values.email.trim(),
      normalizedPhone: normalizeArgentinaPhone(values.telefonoCaracteristica, values.telefonoNumero)
    };
  };

  form.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
    input.addEventListener('input', () => { validateField(input); updateContinueButtonState(); });
    input.addEventListener('blur', () => { validateField(input); updateContinueButtonState(); });
  });
  updateContinueButtonState();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    const errorEl = document.getElementById('signupError');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.add('hidden');
    }
    const values = readSubmitValues();

    if (!hasValidSignupPlan) {
      planSelectionRedirectUrl = missingPlanRedirectUrl;
      if (!validateNonSensitiveCredentials()) return;
      try {
        if (button) {
          button.disabled = true;
          button.textContent = 'Protegiendo datos...';
        }
        const protectedSignup = await createProtectedPendingSignupIntent({
          email: values.email,
          first_name: values.nombre,
          last_name: values.apellido,
          business_name: values.negocioNombre,
          phone: values.normalizedPhone
        });
        sessionStorage.setItem(SIGNUP_STORAGE_KEYS.pendingSignupIntent, JSON.stringify(protectedSignup));
        redirectToPlanSelection(explicitPlan?.trim() ? 'invalid_plan' : 'missing_plan');
      } catch {
        if (button) {
          button.disabled = false;
          button.textContent = 'Continuar';
        }
        if (errorEl) {
          errorEl.textContent = 'No pudimos proteger tus datos. Reintentá en unos segundos.';
          errorEl.classList.remove('hidden');
        }
      }
      return;
    }

    if (!validateForm() || !button) return;
    button.disabled = true;
    button.textContent = 'Procesando...';
    sessionStorage.setItem(SIGNUP_STORAGE_KEYS.plan, plan);
    sessionStorage.setItem(SIGNUP_STORAGE_KEYS.billing, billing);

    if (!isPaidPlan) {
      const landingOwnedOnboardingUrl = new URL('/auth/signup/onboarding', window.location.origin);
      const accountCreatedModalLoginUrl = new URL('/auth/login', window.location.origin);
      const onboardingUrl = landingOwnedOnboardingUrl;
      onboardingUrl.searchParams.set('onboarding_required', 'true');
      onboardingUrl.searchParams.set('account_created_modal', 'welcome_login');
      onboardingUrl.searchParams.set('loginUrl', accountCreatedModalLoginUrl.pathname);
      onboardingUrl.searchParams.set('plan', plan);
      onboardingUrl.searchParams.set('billing', billing);
      try {
        const { createSupabaseSignupAdapterFromEnv, signupWithProvider } = await import('./auth-provider');
        const signupResult = await signupWithProvider({
          attempt: {
            nombre: values.nombre,
            apellido: values.apellido,
            negocioNombre: values.negocioNombre,
            tipoNegocio: 'pendiente',
            telefono: values.normalizedPhone,
            email: values.email,
            password: values.password,
            plan,
            returnTo: onboardingUrl.toString()
          },
          supabaseSignup: createSupabaseSignupAdapterFromEnv({
            SUPABASE_URL: env.PUBLIC_SUPABASE_URL,
            SUPABASE_ANON_KEY: env.PUBLIC_SUPABASE_ANON_KEY
          })
        });
        if (signupResult.redirectTo) window.location.href = signupResult.redirectTo;
        else if (signupResult.ok) window.location.href = onboardingUrl.toString();
        else {
          button.disabled = false;
          button.textContent = 'Continuar';
          if (errorEl) {
            errorEl.textContent = signupResult.error || 'No pudimos crear tu cuenta. Reintentá en unos segundos.';
            errorEl.classList.remove('hidden');
          }
        }
      } catch {
        button.disabled = false;
        button.textContent = 'Continuar';
        if (errorEl) {
          errorEl.textContent = 'No pudimos crear tu cuenta. Reintentá en unos segundos.';
          errorEl.classList.remove('hidden');
        }
      }
      return;
    }

    try {
      const protectedSignup = await createProtectedPendingSignupIntent({
        email: values.email,
        first_name: values.nombre,
        last_name: values.apellido,
        business_name: values.negocioNombre,
        phone: values.normalizedPhone
      });
      sessionStorage.setItem(SIGNUP_STORAGE_KEYS.pendingSignupIntent, JSON.stringify({
        ...protectedSignup,
        plan_code: plan,
        billing_period: billing
      }));
      window.location.href = `/billing/subscription?plan=${encodeURIComponent(plan)}&billing=${encodeURIComponent(billing)}&signup_intent=pending_signup`;
    } catch {
      button.disabled = false;
      button.textContent = 'Continuar';
      if (errorEl) {
        errorEl.textContent = 'No pudimos proteger tus datos para iniciar el pago. Reintentá en unos segundos.';
        errorEl.classList.remove('hidden');
      }
    }
  });
}
