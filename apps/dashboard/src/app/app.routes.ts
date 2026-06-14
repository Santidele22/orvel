import { Routes } from '@angular/router';
import { DashboardShellComponent } from './shared/dashboard-shell/dashboard-shell.component';
import { dashboardAuthChildGuard, dashboardAuthGuard } from './core/auth/dashboard-auth.guard';

export const dashboardShellChildren: Routes = [
  {
    path: '',
    redirectTo: 'inicio',
    pathMatch: 'full'
  },
  {
    path: 'inicio',
    loadComponent: () => import('./features/dashboard-home/pages/dashboard-home.page').then(m => m.DashboardHomeComponent)
  },
  {
    path: 'turnos',
    loadComponent: () => import('./features/booking/pages/turnos-list.page').then(m => m.TurnosListPage)
  },
  {
    path: 'turnos/new',
    loadComponent: () => import('./features/booking/pages/turno-form.page').then(m => m.TurnoFormPage)
  },
  {
    path: 'turnos/edit/:id',
    loadComponent: () => import('./features/booking/pages/turno-form.page').then(m => m.TurnoFormPage)
  },
  {
    path: 'servicios',
    loadComponent: () => import('./features/servicios/pages/servicios.page').then(m => m.ServiciosPage)
  },
  {
    path: 'clientes',
    loadComponent: () => import('./features/clientes/pages/clientes.page').then(m => m.ClientesPage)
  },
  {
    path: 'configuracion',
    loadComponent: () => import('./features/settings/pages/configuracion.page').then(m => m.ConfiguracionPage)
  }
];

export const routes: Routes = [
  {
    path: 'auth/onboarding',
    loadComponent: () =>
      import('./features/onboarding/pages/signup-business-types-step.component').then(m => m.SignupBusinessTypesStepComponent),
    canActivate: [dashboardAuthGuard]
  },
  {
    path: 'booking/manage',
    loadComponent: () =>
      import('./features/booking/pages/public/manage-booking.page').then(m => m.ManageBookingPage)
  },
  {
    path: 'booking/:slug',
    loadComponent: () =>
      import('./features/booking/pages/public/public-booking.page').then(m => m.PublicBookingPage)
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
    path: 'dashboard',
    component: DashboardShellComponent,
    canActivate: [dashboardAuthGuard],
    canActivateChild: [dashboardAuthChildGuard],
    children: dashboardShellChildren
  },
  {
    path: '',
    component: DashboardShellComponent,
    canActivate: [dashboardAuthGuard],
    canActivateChild: [dashboardAuthChildGuard],
    children: dashboardShellChildren
  }
];
