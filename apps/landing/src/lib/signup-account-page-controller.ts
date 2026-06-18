import { ARGENTINA_AREA_CODE_DATA_VERSION } from './argentina-area-codes';
import { SIGNUP_STORAGE_KEYS } from './browser-storage-keys';
import {
  SIGNUP_ACCOUNT_FIELDS,
  mapSignupAccountErrorsForAstro,
  normalizeArgentinaPhone,
  validateSignupAccount,
  type SignupAccountField,
  type SignupAccountInput
} from './signup-account-validation';

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

export function initSignupAccountPage(env: SignupEnv): void {
  if (typeof window === 'undefined') return;

  const form = document.getElementById('accountForm') as HTMLFormElement | null;
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
  passwordFields?.classList.remove('hidden');
  passwordInput?.setAttribute('required', 'true');
  confirmPasswordInput?.setAttribute('required', 'true');

  const backLink = document.getElementById('backLink') as HTMLAnchorElement | null;
  if (backLink) {
    backLink.href = hasValidSignupPlan
      ? `/auth/signup/plan?plan=${encodeURIComponent(plan)}&billing=${encodeURIComponent(billing)}`
      : missingPlanRedirectUrl;
  }

  const readSignupAccountValues = (): SignupAccountInput => ({
    nombre: form.querySelector<HTMLInputElement>('input[name="nombre"]')?.value ?? '',
    apellido: form.querySelector<HTMLInputElement>('input[name="apellido"]')?.value ?? '',
    negocioNombre: form.querySelector<HTMLInputElement>('input[name="negocioNombre"]')?.value ?? '',
    rubro: form.querySelector<HTMLSelectElement>('select[name="rubro"]')?.value ?? '',
    telefonoCaracteristica: form.querySelector<HTMLInputElement>('input[name="telefonoCaracteristica"]')?.value ?? '',
    telefonoNumero: form.querySelector<HTMLInputElement>('input[name="telefonoNumero"]')?.value ?? '',
    email: form.querySelector<HTMLInputElement>('input[name="email"]')?.value ?? '',
    password: form.querySelector<HTMLInputElement>('input[name="password"]')?.value ?? '',
    confirm: form.querySelector<HTMLInputElement>('input[name="confirm"]')?.value ?? ''
  });
  const getFieldError = (fieldName: SignupAccountField, value?: string, requirePassword = true) => {
    const current = readSignupAccountValues();
    const result = validateSignupAccount({ ...current, [fieldName]: value ?? current[fieldName] }, { requirePassword });
    return mapSignupAccountErrorsForAstro(result)[fieldName] ?? '';
  };
  const validators = {
    nombre: (val: string) => getFieldError('nombre', val),
    apellido: (val: string) => getFieldError('apellido', val),
    negocioNombre: (val: string) => getFieldError('negocioNombre', val),
    rubro: (val: string) => getFieldError('rubro', val),
    telefonoCaracteristica: (val: string) => getFieldError('telefonoCaracteristica', val),
    telefonoNumero: (val: string) => getFieldError('telefonoNumero', val),
    email: (val: string) => getFieldError('email', val),
    password: (val: string) => getFieldError('password', val),
    confirm: (val: string) => getFieldError('confirm', val)
  };
  const paintFieldError = (input: HTMLInputElement | HTMLSelectElement, message: string) => {
    const fieldName = input.name as SignupAccountField;
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
  const validateField = (input: HTMLInputElement | HTMLSelectElement) => {
    const fieldName = input.name as keyof typeof validators;
    return validators[fieldName] ? paintFieldError(input, validators[fieldName](input.value)) : true;
  };
  const validateForm = () => {
    const result = validateSignupAccount(readSignupAccountValues(), { requirePassword: true });
    const fieldErrors = mapSignupAccountErrorsForAstro(result);
    let valid = true;
    form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select').forEach((input) => {
      const fieldName = input.name as SignupAccountField;
      if (SIGNUP_ACCOUNT_FIELDS.includes(fieldName) && !paintFieldError(input, fieldErrors[fieldName] ?? '')) valid = false;
    });
    return valid;
  };
  const validateNonSensitiveCredentials = (fields = ['nombre', 'apellido', 'negocioNombre', 'rubro', 'telefonoCaracteristica', 'telefonoNumero', 'email']) => {
    const result = validateSignupAccount(readSignupAccountValues(), { requirePassword: false });
    const fieldErrors = mapSignupAccountErrorsForAstro(result);
    let valid = true;
    fields.forEach((field) => {
      const input = form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${field}"]`);
      const fieldName = field as SignupAccountField;
      if (input && !paintFieldError(input, fieldErrors[fieldName] ?? '')) valid = false;
    });
    return valid;
  };
  const allRequiredFieldsComplete = () => Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input[required], select[required]'))
    .every((input) => input.value.trim() && validateField(input));
  const updateContinueButtonState = () => {
    const button = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    if (button) button.disabled = !allRequiredFieldsComplete();
  };
  const showAccountCreatedModal = () => {
    const safeLoginUrl = '/auth/login';
    const modal = document.getElementById('accountCreatedModal');
    const continueLink = document.getElementById('accountCreatedContinue') as HTMLAnchorElement | null;
    if (continueLink) continueLink.href = safeLoginUrl;
    modal?.classList.remove('hidden');
    modal?.setAttribute('aria-hidden', 'false');
    document.getElementById('accountCreatedModalTitle')?.focus();
    buttonReset('Continuar');
  };
  const buttonReset = (label: string) => {
    const button = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    if (button) {
      button.disabled = false;
      button.textContent = label;
    }
  };
  const createAccountAndBusiness = async (values: { email: string; password: string; nombre: string; apellido: string; negocioNombre: string; rubro: string; telefono: string; plan: string }) => {
    const response = await fetch('/api/signup/create-account-business', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) throw new Error(result?.message || 'create_account_business_failed');
    return result;
  };
  const readSubmitValues = () => {
    const values = readSignupAccountValues();
    return {
      ...values,
      nombre: values.nombre.trim(),
      apellido: values.apellido.trim(),
      negocioNombre: values.negocioNombre.trim(),
      rubro: `${values.rubro ?? ''}`.trim(),
      telefonoCaracteristica: values.telefonoCaracteristica.trim(),
      telefonoNumero: values.telefonoNumero.trim(),
      email: values.email.trim(),
      normalizedPhone: normalizeArgentinaPhone(values.telefonoCaracteristica, values.telefonoNumero)
    };
  };

  form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select').forEach((input) => {
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
      redirectToPlanSelection(explicitPlan?.trim() ? 'invalid_plan' : 'missing_plan');
      return;
    }

    if (!validateForm() || !button) return;
    button.disabled = true;
    button.textContent = 'Procesando...';
    sessionStorage.setItem(SIGNUP_STORAGE_KEYS.plan, plan);
    sessionStorage.setItem(SIGNUP_STORAGE_KEYS.billing, billing);

    const accountBusinessPayload = {
      email: values.email,
      password: values.password,
      nombre: values.nombre,
      apellido: values.apellido,
      negocioNombre: values.negocioNombre,
      rubro: values.rubro,
      telefono: values.normalizedPhone,
      plan
    };

    if (!isPaidPlan) {
      button.textContent = 'Creando cuenta...';
      const accountResult = await createAccountAndBusiness(accountBusinessPayload).catch((error) => ({ ok: false, error }));
      if (!accountResult.ok) {
        const accountErrorMessage = accountResult.error instanceof Error
          ? accountResult.error.message
          : 'No pudimos crear tu cuenta y negocio. Reintentá en unos segundos.';
        button.disabled = false;
        button.textContent = 'Continuar';
        if (errorEl) {
          errorEl.textContent = accountErrorMessage;
          errorEl.classList.remove('hidden');
        }
        return;
      }
      sessionStorage.setItem(SIGNUP_STORAGE_KEYS.tipoNegocio, values.rubro);
      showAccountCreatedModal();
      return;
    }

    try {
      const accountResult = await createAccountAndBusiness(accountBusinessPayload);
      sessionStorage.setItem(SIGNUP_STORAGE_KEYS.tipoNegocio, values.rubro);
      if (accountResult?.account_first_intent_id && accountResult?.account_first_session) {
        sessionStorage.setItem(SIGNUP_STORAGE_KEYS.accountFirstSession, JSON.stringify({
          account_first_intent_id: accountResult.account_first_intent_id,
          account_first_session: accountResult.account_first_session
        }));
      }
      const billingUrl = `/billing/subscription?plan=${encodeURIComponent(plan)}&billing=${encodeURIComponent(billing)}&account_business_created=1`;
      window.location.href = billingUrl;
    } catch {
      button.disabled = false;
      button.textContent = 'Continuar';
      if (errorEl) {
        errorEl.textContent = 'No pudimos crear tu cuenta y negocio para iniciar el pago. Reintentá en unos segundos.';
        errorEl.classList.remove('hidden');
      }
    }
  });
}
