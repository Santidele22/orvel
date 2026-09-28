import { Routes } from '@angular/router';
import { dashboardAuthChildGuard, dashboardAuthGuard } from './core/auth/dashboard-auth.guard';
import { DashboardService } from './core/dashboard/dashboard.service';
import {
  DASHBOARD_BUSINESS_SOURCE,
  DASHBOARD_CLIENTE_SOURCE,
  DASHBOARD_SERVICIO_SOURCE
} from './core/dashboard/dashboard-data.ports';
import { ClienteService } from './features/clientes/data-access/cliente.service';
import { ServicioService } from './features/servicios/data-access/servicio.service';
import { BusinessService } from './core/business/business.service';
import { provideBookingQueries } from './features/booking/booking-queries.providers';
import { OperatorTourHelpButtonComponent } from './features/operator-tour/operator-tour-help-button.component';
import { OperatorTourService } from './features/operator-tour/operator-tour.service';
import { readOnboardingState } from './features/onboarding/data-access/onboarding-storage';
import {
  DASHBOARD_ONBOARDING_PAYLOAD,
  DASHBOARD_TOUR,
  DASHBOARD_TOUR_HELP_COMPONENT
} from './core/shell/dashboard-chrome.ports';

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
    loadChildren: () => import('./features/booking/turnos.routes').then(m => m.turnosRoutes)
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
  },
  {
    path: 'notificaciones',
    loadComponent: () => import('./features/notificaciones/pages/notificaciones.page').then(m => m.NotificacionesPage)
  },
  {
    path: 'perfil',
    loadComponent: () => import('./features/perfil/pages/perfil.page').then(m => m.PerfilPage)
  }
];

export const dashboardShellRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./shared/dashboard-shell/dashboard-shell.component').then(m => m.DashboardShellComponent),
    canActivate: [dashboardAuthGuard],
    canActivateChild: [dashboardAuthChildGuard],
    providers: [
      provideBookingQueries(),
      DashboardService,
      // Bind core dashboard read ports to the feature implementations.
      { provide: DASHBOARD_CLIENTE_SOURCE, useExisting: ClienteService },
      { provide: DASHBOARD_SERVICIO_SOURCE, useExisting: ServicioService },
      { provide: DASHBOARD_BUSINESS_SOURCE, useExisting: BusinessService },
      // Bind core shell chrome ports to the feature implementations.
      { provide: DASHBOARD_TOUR, useExisting: OperatorTourService },
      { provide: DASHBOARD_TOUR_HELP_COMPONENT, useValue: OperatorTourHelpButtonComponent },
      { provide: DASHBOARD_ONBOARDING_PAYLOAD, useValue: readOnboardingState }
    ],
    children: dashboardShellChildren
  }
];
