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
const VALID_SIGNUP_RUBROS = new Set(['peluqueria', 'barberia', 'unas', 'estetica', 'spa', 'maquillaje', 'pestanas', 'cejas', 'masajes', 'otro']);

const normalizeSignupPlan = (rawPlan: string | null) => rawPlan?.trim().toUpperCase() ?? '';
const normalizeBillingPeriod = (raw: string | null) => {
  const normalized = raw?.trim().toLowerCase();
  return normalized === 'quarterly' || normalized === 'annual' ? normalized : 'monthly';
};
const isValidSignupPlan = (rawPlan: string | null) =>
  VALID_SIGNUP_PLANS.includes(normalizeSignupPlan(rawPlan) as typeof VALID_SIGNUP_PLANS[number]);
const normalizeBusinessType = (value: string) => value === 'uñas' ? 'unas' : value === 'pestañas' ? 'pestanas' : value;
const normalizeRubroCode = (value: unknown) => {
  if (typeof value !== 'string') return '';
  const normalized = normalizeBusinessType(value.trim().toLowerCase());
  return VALID_SIGNUP_RUBROS.has(normalized) ? normalized : '';
};
const isExistingAccountError = (error: unknown) => {
  const message = error instanceof Error ? error.message : `${error ?? ''}`;
  return /signup_existing|EMAIL_EXISTS|EMAIL_ALREADY_REGISTERED|already\s+(?:registered|exists)|email.*registrad[oa]/i.test(message);
};
const isPendingSignupAlreadyExistsError = (error: unknown) => {
  const message = error instanceof Error ? error.message : `${error ?? ''}`;
  return /signup_protection_conflict|PENDING_SIGNUP_ALREADY_EXISTS|pending_signup_already_exists/i.test(message);
};

const SIGNUP_PROTECTION_CONFLICT_MESSAGE = 'No pudimos continuar el alta con ese correo. Probá con otro email, esperá unos minutos si ya iniciaste el pago, o contactá a soporte.';

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

  const getRubroCompatibilityField = () => form.querySelector<HTMLInputElement | HTMLSelectElement>('[name="rubro"]');
  const getPrimaryRubroField = () => form.querySelector<HTMLInputElement>('input[name="primaryRubro"]:checked');
  const getAdditionalRubroFields = () => Array.from(form.querySelectorAll<HTMLInputElement>('input[name="rubros"]'));
  const getSelectedRubros = (): string[] => {
    const primary = normalizeRubroCode(getPrimaryRubroField()?.value ?? '');
    const selected = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="rubros"]:checked'))
      .map((input) => normalizeRubroCode(input.value))
      .filter((value): value is string => Boolean(value));
    const legacyPrimary = normalizeRubroCode(getRubroCompatibilityField()?.value ?? '');
    const ordered = primary ? [primary, ...selected] : selected.length > 0 ? selected : legacyPrimary ? [legacyPrimary] : [];
    return [...new Set(ordered)];
  };
  const syncPrimaryRubroField = () => {
    const primary = getSelectedRubros()[0] ?? '';
    const field = getRubroCompatibilityField();
    if (field) field.value = primary;
    getAdditionalRubroFields().forEach((input) => {
      const isPrimary = normalizeRubroCode(input.value) === primary;
      input.disabled = isPrimary;
      if (isPrimary) input.checked = false;
      input.setAttribute('aria-disabled', String(isPrimary));
    });
    return primary;
  };
  const readSignupAccountValues = (): SignupAccountInput => {
    const primaryRubro = syncPrimaryRubroField();
    return {
      nombre: form.querySelector<HTMLInputElement>('input[name="nombre"]')?.value ?? '',
      apellido: form.querySelector<HTMLInputElement>('input[name="apellido"]')?.value ?? '',
      negocioNombre: form.querySelector<HTMLInputElement>('input[name="negocioNombre"]')?.value ?? '',
      rubro: primaryRubro,
      telefonoCaracteristica: form.querySelector<HTMLInputElement>('input[name="telefonoCaracteristica"]')?.value ?? '',
      telefonoNumero: form.querySelector<HTMLInputElement>('input[name="telefonoNumero"]')?.value ?? '',
      email: form.querySelector<HTMLInputElement>('input[name="email"]')?.value ?? '',
      password: form.querySelector<HTMLInputElement>('input[name="password"]')?.value ?? '',
      confirm: form.querySelector<HTMLInputElement>('input[name="confirm"]')?.value ?? ''
    };
  };
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
    if (input.name === 'primaryRubro' || input.name === 'rubros') {
      return paintFieldError(getRubroCompatibilityField() ?? input, validators.rubro(syncPrimaryRubroField()));
    }
    const fieldName = input.name as keyof typeof validators;
    return validators[fieldName] ? paintFieldError(input, validators[fieldName](input.value)) : true;
  };
  const validateForm = () => {
    const result = validateSignupAccount(readSignupAccountValues(), { requirePassword: true });
    const fieldErrors = mapSignupAccountErrorsForAstro(result);
    let valid = true;
    form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select').forEach((input) => {
      if (input.name === 'primaryRubro' || input.name === 'rubros') return;
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
  const showExistingAccountModal = () => {
    let existingAccountModal = document.getElementById('existingAccountModal');
    if (!existingAccountModal) {
      existingAccountModal = document.createElement('div');
      existingAccountModal.id = 'existingAccountModal';
      existingAccountModal.className = 'fixed inset-0 z-50 hidden items-center justify-center overflow-hidden bg-black/60 px-6';
      existingAccountModal.setAttribute('role', 'dialog');
      existingAccountModal.setAttribute('aria-modal', 'true');
      existingAccountModal.setAttribute('aria-labelledby', 'existingAccountModalTitle');
      existingAccountModal.setAttribute('aria-describedby', 'existingAccountModalDescription');
      existingAccountModal.innerHTML = `
        <section class="relative w-full max-w-sm rounded-2xl border border-slate-600 bg-slate-900 p-6 text-center shadow-2xl">
          <p class="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary">Cuenta existente</p>
          <h2 id="existingAccountModalTitle" tabindex="-1" class="font-headline text-2xl font-black tracking-tighter text-text-primary">Este email ya está registrado</h2>
          <p id="existingAccountModalDescription" class="mt-3 text-sm leading-6 text-text-secondary">Encontramos una cuenta existente con ese correo. Iniciá sesión para continuar con Orvel.</p>
          <a id="existingAccountLogin" href="/auth/login" class="mt-6 inline-flex w-full items-center justify-center rounded-full bg-slate-100 px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-900">Iniciar sesión</a>
        </section>
      `;
      document.body.appendChild(existingAccountModal);
    }
    existingAccountModal.classList.remove('hidden');
    existingAccountModal.classList.add('flex');
    document.getElementById('existingAccountModalTitle')?.focus();
  };
  const buttonReset = (label: string) => {
    const button = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    if (button) {
      button.disabled = false;
      button.textContent = label;
    }
  };
  const createAccountAndBusiness = async (values: { email: string; password: string; nombre: string; apellido: string; negocioNombre: string; rubro: string; business_type: string; selected_business_types: string[]; selectedBusinessTypes: string[]; additionalRubros: string[]; telefono: string; plan: string }) => {
    const response = await fetch('/api/signup/create-account-business', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) throw new Error(result?.message || 'create_account_business_failed');
    return result;
  };
  const createProtectedPendingSignupIntent = async (values: { email: string; nombre: string; apellido: string; negocioNombre: string; telefono: string; plan: string; billing: string; business_type: string; selected_business_types: string[]; selectedBusinessTypes: string[]; additionalRubros: string[] }) => {
    const response = await fetch('/api/signup/pending-intent/protect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: values.email,
        first_name: values.nombre,
        last_name: values.apellido,
        business_name: values.negocioNombre,
        phone: values.telefono,
        business_type: values.business_type,
        selected_business_types: values.selected_business_types,
        selectedBusinessTypes: values.selectedBusinessTypes,
        additionalRubros: values.additionalRubros,
        plan_code: values.plan,
        billing_period: values.billing,
      })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || result?.message || 'pending_signup_protection_failed');
    if (result?.ok && result?.status === 'signup_confirmation_requested') {
      return {
        pending_signup_reference: null,
        serverRedirectUrl: null,
        plan_code: values.plan,
        billing_period: values.billing,
        business_type: values.business_type,
        selected_business_types: values.selected_business_types,
        selectedBusinessTypes: values.selectedBusinessTypes,
        additionalRubros: values.additionalRubros,
      };
    }
    const pendingSignupReference = typeof result?.pending_signup_reference === 'string' ? result.pending_signup_reference : null;
    const serverRedirectUrl = typeof result?.serverRedirectUrl === 'string' ? result.serverRedirectUrl : typeof result?.serverIssuedRedirect === 'string' ? result.serverIssuedRedirect : null;
    if (!pendingSignupReference || !serverRedirectUrl) throw new Error('pending_signup_reference_missing');
    // Legacy static contract markers: protected_pending_signup_intent / email_encrypted now live server-side.
    return {
      pending_signup_reference: pendingSignupReference,
      serverRedirectUrl,
      plan_code: values.plan,
      billing_period: values.billing,
      business_type: values.business_type,
      selected_business_types: values.selected_business_types,
      selectedBusinessTypes: values.selectedBusinessTypes,
      additionalRubros: values.additionalRubros,
    };
  };
  const readSubmitValues = () => {
    const values = readSignupAccountValues();
    const selectedBusinessTypes = getSelectedRubros();
    const primaryBusinessType = selectedBusinessTypes[0] ?? normalizeRubroCode(values.rubro) ?? '';
    return {
      ...values,
      nombre: values.nombre.trim(),
      apellido: values.apellido.trim(),
      negocioNombre: values.negocioNombre.trim(),
      rubro: primaryBusinessType,
      business_type: primaryBusinessType,
      selectedBusinessTypes,
      selected_business_types: selectedBusinessTypes,
      additionalRubros: selectedBusinessTypes.slice(1),
      telefonoCaracteristica: values.telefonoCaracteristica.trim(),
      telefonoNumero: values.telefonoNumero.trim(),
      email: values.email.trim(),
      normalizedPhone: normalizeArgentinaPhone(values.telefonoCaracteristica, values.telefonoNumero)
    };
  };

  form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select').forEach((input) => {
    input.addEventListener('input', () => { validateField(input); updateContinueButtonState(); });
    input.addEventListener('blur', () => { validateField(input); updateContinueButtonState(); });
    input.addEventListener('change', () => { syncPrimaryRubroField(); validateField(getRubroCompatibilityField() ?? input); updateContinueButtonState(); });
  });
  syncPrimaryRubroField();
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
      if (button) {
        button.disabled = true;
        button.textContent = 'Protegiendo datos...';
      }
      await createProtectedPendingSignupIntent({
        ...values,
        telefono: values.normalizedPhone,
        plan: '',
        billing,
        business_type: values.business_type,
        selected_business_types: values.selected_business_types,
        selectedBusinessTypes: values.selectedBusinessTypes,
        additionalRubros: values.additionalRubros,
      }).then((protectedSignup) => {
        sessionStorage.setItem(SIGNUP_STORAGE_KEYS.pendingSignupIntent, JSON.stringify(protectedSignup));
        sessionStorage.setItem(SIGNUP_STORAGE_KEYS.tipoNegocio, values.business_type || 'otro');
        redirectToPlanSelection(explicitPlan?.trim() ? 'invalid_plan' : 'missing_plan');
      }).catch((error) => {
        if (button) {
          button.disabled = false;
          button.textContent = 'Continuar';
        }
        if (errorEl) {
          errorEl.textContent = isPendingSignupAlreadyExistsError(error)
            ? SIGNUP_PROTECTION_CONFLICT_MESSAGE
            : 'No pudimos proteger tus datos. Reintentá en unos segundos.';
          errorEl.classList.remove('hidden');
        }
      });
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
      business_type: values.business_type,
      selectedBusinessTypes: values.selectedBusinessTypes,
      selected_business_types: values.selected_business_types,
      additionalRubros: values.additionalRubros,
      telefono: values.normalizedPhone,
      plan
    };

    if (!isPaidPlan) {
      button.textContent = 'Creando cuenta...';
      const accountResult = await createAccountAndBusiness(accountBusinessPayload).catch((error) => ({ ok: false, error }));
      if (!accountResult.ok) {
        if (isExistingAccountError(accountResult.error)) {
          button.disabled = false;
          button.textContent = 'Continuar';
          showExistingAccountModal();
          return;
        }
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
      const pendingSignupIntent = await createProtectedPendingSignupIntent({
        ...accountBusinessPayload,
        billing,
      });
      const pendingSignupReference = pendingSignupIntent.pending_signup_reference;
      const serverIssuedRedirect = pendingSignupIntent.serverRedirectUrl;
      sessionStorage.setItem(SIGNUP_STORAGE_KEYS.tipoNegocio, values.rubro);
      sessionStorage.setItem(SIGNUP_STORAGE_KEYS.pendingSignupIntent, JSON.stringify(pendingSignupIntent));
      sessionStorage.removeItem(SIGNUP_STORAGE_KEYS.accountFirstSession);
      if (!pendingSignupReference || !serverIssuedRedirect) {
        showAccountCreatedModal();
        return;
      }
      const billingUrl = serverIssuedRedirect || `/billing/subscription?plan=${encodeURIComponent(plan)}&billing=${encodeURIComponent(billing)}&signup_intent=pending_signup&pending_signup_reference=${encodeURIComponent(pendingSignupReference)}`;
      window.location.href = billingUrl;
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Continuar';
      if (isExistingAccountError(error)) {
        showExistingAccountModal();
        return;
      }
      if (errorEl) {
        errorEl.textContent = isPendingSignupAlreadyExistsError(error)
          ? SIGNUP_PROTECTION_CONFLICT_MESSAGE
          : 'No pudimos proteger tus datos para iniciar el pago. Reintentá en unos segundos.';
        errorEl.classList.remove('hidden');
      }
    }
  });
}
