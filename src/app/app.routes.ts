import { Routes } from '@angular/router';
import { TurnosListPage } from './pages/dashboard/turnos/turnos-list.page';
import { TurnoFormPage } from './pages/dashboard/turnos/turno-form.page';
import { DashboardShellComponent } from './shared/dashboard-shell/dashboard-shell.component';
import { dashboardAuthChildGuard, dashboardAuthGuard } from './core/auth/dashboard-auth.guard';
import { OnboardingBusinessStepPage } from './pages/landing/onboarding-business-step.page';
import { ServiciosPage } from './pages/dashboard/servicios/servicios.page';
import { ClientesPage } from './pages/dashboard/clientes/clientes.page';
import { ConfiguracionPage } from './pages/dashboard/configuracion/configuracion.page';
import { PublicBookingPage } from './pages/booking/public-booking.page';
import { ManageBookingPage } from './pages/booking/manage-booking.page';
import { LoginPage } from './pages/auth/login.page';
import { SignupPlanStepPageComponent } from './pages/landing/signup-plan-step.component';
import { SignupCredentialsPageComponent } from './pages/auth/signup-credentials.component';
import { SignupBusinessTypesStepComponent } from './pages/landing/signup-business-types-step.component';
import {
  onboardingAccountGuard,
  onboardingBusinessTypesGuard,
  onboardingLoginGuard,
  onboardingWelcomeGuard
} from './core/onboarding/onboarding-flow.guard';

export const routes: Routes = [
  {
    path: 'login',
    redirectTo: 'auth/login',
    pathMatch: 'full'
  },
  {
    path: 'auth/login',
    component: LoginPage,
    canActivate: [onboardingLoginGuard]
  },
  {
    path: 'auth/signup/plan',
    component: SignupPlanStepPageComponent
  },
  {
    path: 'auth/signup/credentials',
    component: SignupCredentialsPageComponent,
    canActivate: [onboardingAccountGuard]
  },
  {
    path: 'auth/signup/complete',
    component: SignupBusinessTypesStepComponent,
    canActivate: [onboardingBusinessTypesGuard]
  },
  {
    path: 'auth/signup/welcome',
    component: SignupBusinessTypesStepComponent,
    canActivate: [onboardingWelcomeGuard]
  },
  {
    path: 'booking/manage',
    component: ManageBookingPage
  },
  {
    path: 'booking/:slug',
    component: PublicBookingPage
  },
  {
    path: 'payments/return/success',
    component: OnboardingBusinessStepPage
  },
  {
    path: 'payments/return/pending',
    component: OnboardingBusinessStepPage
  },
  {
    path: 'payments/return/failure',
    component: OnboardingBusinessStepPage
  },
  {
    path: 'dashboard',
    component: DashboardShellComponent,
    canActivate: [dashboardAuthGuard],
    canActivateChild: [dashboardAuthChildGuard],
    children: [
      {
        path: '',
        redirectTo: 'inicio',
        pathMatch: 'full'
      },
      {
        path: 'inicio',
        loadComponent: () => import('./pages/dashboard/home/dashboard-home.page').then(m => m.DashboardHomeComponent)
      },
      {
        path: 'turnos',
        component: TurnosListPage
      },
      {
        path: 'turnos/edit/:id',
        component: TurnoFormPage
      },
      {
        path: 'servicios',
        component: ServiciosPage
      },
      {
        path: 'clientes',
        component: ClientesPage
      },
      {
        path: 'configuracion',
        component: ConfiguracionPage
      }
    ]
  },
  {
    path: '',
    redirectTo: 'dashboard/turnos',
    pathMatch: 'full'
  }
];
