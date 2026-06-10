import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { normalizeDashboardAuthRequest } from '../../core/auth/dashboard-auth-flow';

const CANONICAL_LANDING_ORIGIN = 'https://orvel.app';
const canonicalLandingAuth = '/auth/login';
const PARAM_BLOCKLIST = /^(access_token|refresh_token|token|id_token|code|preapproval_id|collection_id|payment_id|status|status_detail|merchant_order_id|external_reference|checkout_session_id)$/i;
const TOKEN_OR_PAYMENT_TEXT = /(access_token|refresh_token|id_token|code|preapproval_id|collection_id|payment_id|merchant_order_id|external_reference|checkout_session_id)/i;

function sanitizeDashboardReturnTo(raw: string | null | undefined): string {
  if (!raw) return '/dashboard/inicio';
  const value = raw.trim();
  if (!value.startsWith('/') || value.startsWith('//') || TOKEN_OR_PAYMENT_TEXT.test(value)) return '/dashboard/inicio';
  try {
    const parsed = new URL(value, 'https://dashboard.orvel.local');
    if (parsed.origin !== 'https://dashboard.orvel.local') return '/dashboard/inicio';
    for (const key of parsed.searchParams.keys()) {
      if (PARAM_BLOCKLIST.test(key)) return '/dashboard/inicio';
    }
    if (TOKEN_OR_PAYMENT_TEXT.test(parsed.hash)) return '/dashboard/inicio';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/dashboard/inicio';
  }
}

function buildLandingLoginRedirect(returnTo: string): string {
  const landingOrigin = (() => {
    const env = globalThis as { process?: { env?: Record<string, string | undefined> } };
    const raw = env.process?.env?.['PUBLIC_LANDING_URL']?.trim();
    if (!raw) return CANONICAL_LANDING_ORIGIN;
    try {
      const url = new URL(raw);
      url.search = '';
      url.hash = '';
      return url.origin;
    } catch {
      return CANONICAL_LANDING_ORIGIN;
    }
  })();
  const safeReturnTo = sanitizeDashboardReturnTo(returnTo);
  return `${landingOrigin}${canonicalLandingAuth}?returnTo=${encodeURIComponent(safeReturnTo)}`;
}

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
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected redirectUrl = canonicalLandingAuth;

  ngOnInit(): void {
    const authRequest = normalizeDashboardAuthRequest(typeof window !== 'undefined' ? window.location.href : '/auth');
    if (authRequest.mode === 'signup') {
      void this.router.navigate(['/auth/signup/plan'], { queryParams: { returnTo: authRequest.returnTo } });
      return;
    }

    const returnTo = this.route.snapshot.queryParamMap.get('returnTo') ?? authRequest.returnTo;
    this.redirectUrl = buildLandingLoginRedirect(returnTo);
    if (typeof window !== 'undefined') {
      window.location.assign(this.redirectUrl);
    }
  }
}
