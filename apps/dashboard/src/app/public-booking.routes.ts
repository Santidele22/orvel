import { Routes } from '@angular/router';
import { provideBooking } from './features/booking/booking.providers';

export const manageBookingRoutes: Routes = [
  {
    path: '',
    providers: [provideBooking()],
    loadComponent: () =>
      import('./features/booking/pages/public/manage-booking.page').then(m => m.ManageBookingPage)
  }
];

export const publicBookingSlugRoutes: Routes = [
  {
    path: '',
    providers: [provideBooking()],
    loadComponent: () =>
      import('./features/booking/pages/public/public-booking.page').then(m => m.PublicBookingPage)
  }
];
