import { CanMatchFn, Routes } from '@angular/router';
import { dashboardAuthGuard } from '@orvel/dashboard-core/auth/dashboard-auth.guard';

const isDashboardShellPath: CanMatchFn = (_route, segments) => {
  const head = segments[0]?.path;
  return head !== 'login' && head !== 'signup' && head !== 'auth';
};

/**
 * Fase 3 of #1098 — the web target's router table.
 *
 * Fase 0 classified every route as `web`, `pwa` or `shared` (`core/platform/dashboard-targets.ts`).
 * This table mounts **only** the web and shared surfaces; the PWA keeps `booking/*` (the public
 * mobile turnero) and `dashboard/installar` to itself. There is no shared route table on purpose:
 * deriving this one from `apps/dashboard/src/app/app.routes.ts` would keep the booking lazy chunks
 * in the web bundle, which is exactly what the split exists to avoid.
 *
 * The `../../../dashboard/src/app/...` specifiers are the transitional alias of this corte: the
 * console features are still owned by `apps/dashboard`, and they move to packages later. They are
 * spelled as full string literals because a bundler can only build a lazy chunk from a static
 * specifier.
 *
 * `src/app/tests/unit/web-target-routes.contract.spec.ts` walks both tables and fails when this one
 * drifts from the classification.
 */
export const routes: Routes = [
  {
    path: 'auth/onboarding',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },
  {
    path: 'payments/return/success',
    loadComponent: () =>
      import('../../../dashboard/src/app/features/onboarding/pages/onboarding-business-step.page').then(m => m.OnboardingBusinessStepPage)
  },
  {
    path: 'payments/return/pending',
    loadComponent: () =>
      import('../../../dashboard/src/app/features/onboarding/pages/onboarding-business-step.page').then(m => m.OnboardingBusinessStepPage)
  },
  {
    path: 'payments/return/failure',
    loadComponent: () =>
      import('../../../dashboard/src/app/features/onboarding/pages/onboarding-business-step.page').then(m => m.OnboardingBusinessStepPage)
  },
  {
    path: 'billing/subscription',
    loadComponent: () =>
      import('../../../dashboard/src/app/features/billing/pages/billing-subscription.component').then(m => m.BillingSubscriptionComponent)
  },
  {
    path: 'billing/subscription/cancel',
    canActivate: [dashboardAuthGuard],
    loadComponent: () =>
      import('../../../dashboard/src/app/features/billing/pages/billing-subscription.component').then(m => m.BillingSubscriptionComponent)
  },
  {
    path: 'auth/login',
    loadComponent: () =>
      import('../../../dashboard/src/app/features/auth/pages/in-app-login.page').then(m => m.InAppLoginPage)
  },
  {
    path: 'auth/signup',
    loadComponent: () =>
      import('../../../dashboard/src/app/features/auth/pages/in-app-signup-wizard.page').then(m => m.InAppSignupWizardPage)
  },
  {
    path: 'dashboard/login',
    loadComponent: () =>
      import('../../../dashboard/src/app/features/auth/pages/in-app-login.page').then(m => m.InAppLoginPage)
  },
  {
    path: 'dashboard/signup',
    loadComponent: () =>
      import('../../../dashboard/src/app/features/auth/pages/in-app-signup-wizard.page').then(m => m.InAppSignupWizardPage)
  },
  {
    path: 'login',
    loadComponent: () =>
      import('../../../dashboard/src/app/features/auth/pages/in-app-login.page').then(m => m.InAppLoginPage)
  },
  {
    path: 'signup',
    loadComponent: () =>
      import('../../../dashboard/src/app/features/auth/pages/in-app-signup-wizard.page').then(m => m.InAppSignupWizardPage)
  },
  {
    path: 'dashboard',
    loadChildren: () => import('./shell.routes').then(m => m.dashboardWebShellRoutes)
  },
  {
    path: '',
    canMatch: [isDashboardShellPath],
    loadChildren: () => import('./shell.routes').then(m => m.dashboardWebShellRoutes)
  }
];
