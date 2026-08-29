import { Routes } from '@angular/router';
import { dashboardAuthGuard } from './core/auth/dashboard-auth.guard';

export const routes: Routes = [
  {
    path: 'auth/onboarding',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },
  {
    path: 'booking/manage',
    loadChildren: () => import('./public-booking.routes').then(m => m.manageBookingRoutes)
  },
  {
    path: 'booking/:slug',
    loadChildren: () => import('./public-booking.routes').then(m => m.publicBookingSlugRoutes)
  },
  {
    path: 'payments/return/success',
    loadComponent: () =>
      import('./features/onboarding/pages/onboarding-business-step.page').then(m => m.OnboardingBusinessStepPage)
  },
  {
    path: 'payments/return/pending',
    loadComponent: () =>
      import('./features/onboarding/pages/onboarding-business-step.page').then(m => m.OnboardingBusinessStepPage)
  },
  {
    path: 'payments/return/failure',
    loadComponent: () =>
      import('./features/onboarding/pages/onboarding-business-step.page').then(m => m.OnboardingBusinessStepPage)
  },
  {
    path: 'billing/subscription',
    loadComponent: () => import('./features/billing/pages/billing-subscription.component').then(m => m.BillingSubscriptionComponent)
  },
  {
    path: 'billing/subscription/cancel',
    canActivate: [dashboardAuthGuard],
    loadComponent: () => import('./features/billing/pages/billing-subscription.component').then(m => m.BillingSubscriptionComponent)
  },
  {
    path: 'dashboard/installar',
    loadComponent: () =>
      import('./features/pwa-install/pages/pwa-install.page').then(m => m.PwaInstallPage)
  },
  {
    path: 'auth/login',
    loadComponent: () =>
      import('./features/auth/pages/in-app-login.page').then(m => m.InAppLoginPage)
  },
  {
    path: 'auth/signup',
    loadComponent: () =>
      import('./features/auth/pages/in-app-signup-wizard.page').then(m => m.InAppSignupWizardPage)
  },
  {
    path: 'dashboard/login',
    loadComponent: () =>
      import('./features/pwa-install/pages/operator-sign-in.page').then(m => m.OperatorSignInPage)
  },
  {
    path: 'dashboard',
    loadChildren: () => import('./dashboard-shell.routes').then(m => m.dashboardShellRoutes)
  },
  {
    path: '',
    loadChildren: () => import('./dashboard-shell.routes').then(m => m.dashboardShellRoutes)
  }
];
