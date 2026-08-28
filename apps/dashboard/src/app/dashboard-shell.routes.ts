import { Routes } from '@angular/router';
import { dashboardAuthChildGuard, dashboardAuthGuard } from './core/auth/dashboard-auth.guard';
import { DashboardService } from './core/dashboard/dashboard.service';
import { provideBookingQueries } from './features/booking/booking-queries.providers';

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
    providers: [provideBookingQueries(), DashboardService],
    children: dashboardShellChildren
  }
];
