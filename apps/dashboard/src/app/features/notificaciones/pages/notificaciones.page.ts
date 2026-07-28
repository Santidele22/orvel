import { Component } from '@angular/core';

@Component({
  selector: 'app-notificaciones',
  standalone: true,
  template: `
    <div class="flex flex-col items-center justify-center h-full p-6 text-center">
      <i class="ri-notification-3-line text-5xl text-text-secondary mb-4" aria-hidden="true"></i>
      <h2 class="text-xl font-semibold text-text-primary mb-2">Notificaciones</h2>
      <p class="text-text-secondary text-sm">Tus notificaciones aparecerán aquí.</p>
    </div>
  `
})
export class NotificacionesPage {}
