import { Routes } from '@angular/router';
import { dashboardAuthChildGuard, dashboardAuthGuard } from './core/auth/dashboard-auth.guard';
import { DashboardService } from './core/dashboard/dashboard.service';
import { provideBooking } from './features/booking/booking.providers';

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
    path: 'turnos/:id',
    loadComponent: () => import('./features/booking/ui/mobile-turno-detail/mobile-turno-detail.component').then(m => m.MobileTurnoDetailComponent)
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
    providers: [provideBooking(), DashboardService],
    children: dashboardShellChildren
  }
];
