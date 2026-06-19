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

const RUBRO_OPTIONS = [
  ['peluqueria', 'Peluquería'],
  ['unas', 'Uñas'],
  ['barberia', 'Barbería'],
  ['spa', 'Spa'],
  ['pestanas', 'Pestañas'],
  ['cejas', 'Cejas'],
  ['masajes', 'Masajes'],
  ['otro', 'Otro']
] as const;

type FreeSignupDraft = {
  nombre: string;
  apellido: string;
  negocioNombre: string;
  email: string;
  password: string;
  normalizedPhone: string;
};

const normalizeBusinessType = (value: string) => value === 'unas' ? 'uñas' : value === 'pestanas' ? 'pestañas' : value;
const isExistingAccountError = (error: unknown) => {
  const message = error instanceof Error ? error.message : `${error ?? ''}`;
  return /signup_existing|EMAIL_EXISTS|EMAIL_ALREADY_REGISTERED|already\s+(?:registered|exists)|email.*registrad[oa]/i.test(message);
};

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
  passwordFields?.classList.remove('hidden');

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
  const getFieldError = (fieldName: SignupCredentialField, value?: string, requirePassword = true) => {
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
    const result = validateSignupCredentials(readSignupCredentialValues(), { requirePassword: true });
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
  const finalizeFreeSignup = async (values: { protectedSignupIntent: unknown; password: string; businessType: string }) => {
    const response = await fetch('/api/signup/pending-intent/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pending_signup_intent: values.protectedSignupIntent,
        password: values.password,
        business_type: values.businessType,
        plan_code: 'FREE',
        return_to: '/auth/login'
      })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      throw new Error(typeof result?.error === 'string' ? result.error : 'pending_signup_finalize_failed');
    }
    return result;
  };
  const createAndfinalizeFreeSignup = async (values: { email: string; firstName: string; lastName: string; businessName: string; phone: string; password: string }) => {
    const protectedSignup = await createProtectedPendingSignupIntent({
      email: values.email,
      first_name: values.firstName,
      last_name: values.lastName,
      business_name: values.businessName,
      phone: values.phone
    });
    return finalizeFreeSignup({
      protectedSignupIntent: protectedSignup,
      password: values.password,
      businessType: normalizeBusinessType('otro')
    });
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
  const ensureFreeRubroStep = () => {
    let section = document.getElementById('freeSignupRubroStep') as HTMLElement | null;
    if (section) return section;
    section = document.createElement('section');
    section.id = 'freeSignupRubroStep';
    section.className = 'hidden mt-8 rounded-2xl border border-border bg-bg-secondary/80 p-6 shadow-xl';
    section.setAttribute('aria-labelledby', 'freeSignupRubroTitle');
    section.innerHTML = `
      <p class="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Paso 3 de 3</p>
      <h2 id="freeSignupRubroTitle" tabindex="-1" class="font-headline text-2xl font-black tracking-tighter text-text-primary">Tu rubro.</h2>
      <p class="mt-2 text-sm leading-6 text-text-secondary">Seleccioná la categoría que mejor describe tu negocio para crear tu cuenta y configuración inicial.</p>
      <form id="freeSignupRubroForm" class="mt-6 space-y-5">
        <fieldset class="grid gap-3 sm:grid-cols-2" aria-describedby="freeSignupRubroHelper freeSignupRubroError">
          <legend class="sr-only">Categoría del negocio</legend>
          ${RUBRO_OPTIONS.map(([value, label]) => `<label class="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-bg-primary/60 p-4 text-sm font-semibold transition hover:border-primary/60"><input class="h-4 w-4 accent-primary" type="radio" name="rubro" value="${value}" required /><span>${label}</span></label>`).join('')}
        </fieldset>
        <p id="freeSignupRubroHelper" class="text-xs text-text-secondary">Tu contraseña queda solo en memoria hasta finalizar este paso.</p>
        <p id="freeSignupRubroError" class="hidden rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error" role="alert" aria-live="polite"></p>
        <button id="freeSignupRubroSubmit" type="submit" class="inline-flex w-full items-center justify-center rounded-full bg-primary px-6 py-4 text-xs font-bold uppercase tracking-widest text-on-secondary shadow-lg shadow-primary/20">Crear cuenta</button>
      </form>
      <div id="freeSignupWelcomeModal" class="fixed inset-0 z-50 hidden items-center justify-center overflow-hidden bg-black/70 px-6" role="dialog" aria-modal="true" aria-labelledby="freeSignupWelcomeTitle" aria-describedby="freeSignupWelcomeDescription">
        <section class="relative w-full max-w-sm rounded-2xl border border-border bg-bg-secondary p-6 text-center shadow-2xl">
          <p class="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Cuenta lista</p>
          <h2 id="freeSignupWelcomeTitle" tabindex="-1" class="font-headline text-2xl font-black tracking-tighter text-text-primary">¡Bienvenida a Orvel!</h2>
          <p id="freeSignupWelcomeDescription" class="mt-3 text-sm leading-6 text-text-secondary">Tu cuenta y configuración inicial ya están listas. Iniciá sesión para empezar a organizar tus turnos con Orvel.</p>
          <a id="freeSignupWelcomeLogin" href="/auth/login" class="mt-6 inline-flex w-full items-center justify-center rounded-full bg-primary px-5 py-3 text-xs font-bold uppercase tracking-widest text-on-secondary">Iniciar sesión</a>
        </section>
      </div>
    `;
    form.insertAdjacentElement('afterend', section);
    return section;
  };
  let freeSignupDraft: FreeSignupDraft | null = null;
  const showFreeRubroStep = (draft: FreeSignupDraft) => {
    freeSignupDraft = draft;
    const section = ensureFreeRubroStep();
    section.classList.remove('hidden');
    form.classList.add('hidden');
    form.setAttribute('aria-hidden', 'true');
    document.getElementById('freeSignupRubroTitle')?.focus();
  };
  const attachFreeRubroFinalizer = () => {
    const section = ensureFreeRubroStep();
    const rubroForm = section.querySelector<HTMLFormElement>('#freeSignupRubroForm');
    if (!rubroForm || rubroForm.dataset.bound === 'true') return;
    rubroForm.dataset.bound = 'true';
    rubroForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorEl = document.getElementById('freeSignupRubroError');
      const button = document.getElementById('freeSignupRubroSubmit') as HTMLButtonElement | null;
      const selected = rubroForm.querySelector<HTMLInputElement>('input[name="rubro"]:checked')?.value;
      if (errorEl) {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
      }
      if (!selected) {
        if (errorEl) {
          errorEl.textContent = 'Seleccioná una categoría para continuar.';
          errorEl.classList.remove('hidden');
        }
        return;
      }
      if (!freeSignupDraft) {
        if (errorEl) {
          errorEl.textContent = 'Volvé al paso anterior para completar tus datos de acceso.';
          errorEl.classList.remove('hidden');
        }
        return;
      }
      if (button) {
        button.disabled = true;
        button.textContent = 'Creando cuenta...';
      }
      try {
        const protectedSignup = await createProtectedPendingSignupIntent({
          email: freeSignupDraft.email,
          first_name: freeSignupDraft.nombre,
          last_name: freeSignupDraft.apellido,
          business_name: freeSignupDraft.negocioNombre,
          phone: freeSignupDraft.normalizedPhone
        });
        await finalizeFreeSignup({
          protectedSignupIntent: protectedSignup,
          password: freeSignupDraft.password,
          businessType: normalizeBusinessType(selected)
        });
        freeSignupDraft = null;
        sessionStorage.removeItem(SIGNUP_STORAGE_KEYS.pendingSignupIntent);
        sessionStorage.setItem(SIGNUP_STORAGE_KEYS.plan, 'FREE');
        sessionStorage.setItem(SIGNUP_STORAGE_KEYS.billing, billing);
        const modal = document.getElementById('freeSignupWelcomeModal');
        modal?.classList.remove('hidden');
        modal?.classList.add('flex');
        document.getElementById('freeSignupWelcomeTitle')?.focus();
      } catch {
        if (button) {
          button.disabled = false;
          button.textContent = 'Crear cuenta';
        }
        if (errorEl) {
          errorEl.textContent = 'No pudimos crear tu cuenta. Reintentá en unos segundos.';
          errorEl.classList.remove('hidden');
        }
      }
    });
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
      if (button) {
        button.disabled = true;
        button.textContent = 'Protegiendo datos...';
      }
      await createProtectedPendingSignupIntent({
          email: values.email,
          first_name: values.nombre,
          last_name: values.apellido,
          business_name: values.negocioNombre,
          phone: values.normalizedPhone
        }).then((protectedSignup) => {
        sessionStorage.setItem(SIGNUP_STORAGE_KEYS.pendingSignupIntent, JSON.stringify(protectedSignup));
        redirectToPlanSelection(explicitPlan?.trim() ? 'invalid_plan' : 'missing_plan');
      }).catch(() => {
        if (button) {
          button.disabled = false;
          button.textContent = 'Continuar';
        }
        if (errorEl) {
          errorEl.textContent = 'No pudimos proteger tus datos. Reintentá en unos segundos.';
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

    if (!isPaidPlan) {
      button.textContent = 'Creando cuenta...';
      await createAndfinalizeFreeSignup({
          email: values.email,
          firstName: values.nombre,
          lastName: values.apellido,
          businessName: values.negocioNombre,
          phone: values.normalizedPhone,
          password: values.password
        }).then(() => {
        const modal = document.getElementById('freeSignupWelcomeModal') ?? ensureFreeRubroStep().querySelector('#freeSignupWelcomeModal');
        modal?.classList.remove('hidden');
        modal?.classList.add('flex');
        document.getElementById('freeSignupWelcomeTitle')?.focus();
      }).catch((error) => {
        if (isExistingAccountError(error)) {
          button.disabled = false;
          button.textContent = 'Continuar';
          showExistingAccountModal();
          return;
        }
        button.disabled = false;
        button.textContent = 'Continuar';
        if (errorEl) {
          errorEl.textContent = 'No pudimos crear tu cuenta. Reintentá en unos segundos.';
          errorEl.classList.remove('hidden');
        }
      });
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
    } catch (error) {
      if (isExistingAccountError(error)) {
        button.disabled = false;
        button.textContent = 'Continuar';
        showExistingAccountModal();
        return;
      }
      button.disabled = false;
      button.textContent = 'Continuar';
      if (errorEl) {
        errorEl.textContent = 'No pudimos proteger tus datos para iniciar el pago. Reintentá en unos segundos.';
        errorEl.classList.remove('hidden');
      }
    }
  });
}
