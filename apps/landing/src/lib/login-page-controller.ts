import {
  createSupabaseLoginAdapterFromEnv,
  loginWithProvider
} from './auth-provider';
import { sanitizeLandingAuthReturnTo } from './auth-return-to';
import { createDashboardSessionHandoffInvoke } from './dashboard-session-handoff';
import { buildLocalProxyAuthCanonicalUrl } from './local-auth-proxy-canonicalizer';

export function initLoginPage(env: {
  PUBLIC_DASHBOARD_URL?: string;
  PUBLIC_SUPABASE_URL?: string;
  PUBLIC_SUPABASE_ANON_KEY?: string;
}): void {
  if (typeof window === 'undefined') return;

  const canonicalRedirectTo = buildLocalProxyAuthCanonicalUrl(window.location.href);
  if (canonicalRedirectTo) {
    window.location.replace(canonicalRedirectTo);
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const returnTo = sanitizeLandingAuthReturnTo(params.get('returnTo'), {
    currentOrigin: window.location.origin,
    dashboardBaseUrl: env.PUBLIC_DASHBOARD_URL
  });

  const setError = (message: string) => {
    const error = document.getElementById('loginError');
    if (!error) return;
    error.textContent = message;
    error.classList.remove('hidden');
  };

  const clearError = () => {
    const error = document.getElementById('loginError');
    if (!error) return;
    error.textContent = '';
    error.classList.add('hidden');
  };

  const supabaseLogin = createSupabaseLoginAdapterFromEnv({
    SUPABASE_URL: env.PUBLIC_SUPABASE_URL,
    SUPABASE_ANON_KEY: env.PUBLIC_SUPABASE_ANON_KEY
  });
  const dashboardOrigin = env.PUBLIC_DASHBOARD_URL || returnTo;
  const dashboardHandoff = env.PUBLIC_SUPABASE_URL
    ? {
        dashboardOrigin,
        invoke: createDashboardSessionHandoffInvoke({ supabaseUrl: env.PUBLIC_SUPABASE_URL })
      }
    : undefined;

  document.getElementById('loginForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const button = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    if (!button) return;

    const formData = new FormData(form);
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '');

    clearError();
    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = 'Ingresando...';

    try {
      const result = await loginWithProvider({ attempt: { email, password, returnTo }, supabaseLogin, dashboardHandoff });
      if (result.ok && result.redirectTo) {
        window.location.assign(result.redirectTo);
        return;
      }

      setError(result.error || 'No pudimos iniciar sesión. Revisá tus credenciales e intentá nuevamente.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No pudimos iniciar sesión. Revisá tus credenciales e intentá nuevamente.');
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  });
}
