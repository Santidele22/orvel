import { Routes } from '@angular/router';
import { provideBooking } from './booking.providers';

export const turnosRoutes: Routes = [
  {
    path: '',
    providers: [provideBooking()],
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/turnos-list.page').then(m => m.TurnosListPage)
      },
      {
        path: 'new',
        loadComponent: () => import('./pages/turno-form.page').then(m => m.TurnoFormPage)
      },
      {
        path: 'edit/:id',
        loadComponent: () => import('./pages/turno-form.page').then(m => m.TurnoFormPage)
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./ui/mobile-turno-detail/mobile-turno-detail.component').then(m => m.MobileTurnoDetailComponent)
      }
    ]
  }
];
