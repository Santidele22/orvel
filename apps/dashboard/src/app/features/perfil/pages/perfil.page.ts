import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { logoutAndRedirect } from '../../../core/auth/route-protection';
import { AuthService } from '../../../services/auth.service';
import { navigateAfterLogout } from '../../../shared/dashboard-shell/logout-navigation';

@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section data-testid="perfil-page" class="flex min-w-0 flex-col gap-4 overflow-x-hidden p-4">
      <div>
        <p class="text-lg font-semibold text-text-primary">{{ auth.user()?.nombre }}</p>
        <p class="text-sm text-text-secondary">{{ auth.user()?.email }}</p>
      </div>
      <a data-testid="perfil-settings-link" routerLink="/dashboard/configuracion" class="text-sm font-medium text-primary">
        Configuración
      </a>
      <button type="button" data-testid="perfil-logout" class="rounded-xl bg-bg-secondary px-4 py-3 text-sm font-medium text-text-primary" (click)="logout()">
        Cerrar sesión
      </button>
    </section>
  `,
})
export class PerfilPage {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  async logout(): Promise<void> {
    try {
      const redirectTo = await logoutAndRedirect();
      await navigateAfterLogout(redirectTo, this.router);
    } catch {
      window.alert('No se pudo cerrar sesión. Intentá de nuevo.');
    }
  }
}
