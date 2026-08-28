import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { logoutAndRedirect } from '../../../core/auth/route-protection';
import { AuthService } from '../../../services/auth.service';
import { navigateAfterLogout } from '../../../shared/dashboard-shell/logout-navigation';
import { BusinessService } from '../../settings/data-access/business.service';

@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section data-testid="perfil-page" class="mobile-perfil min-h-full space-y-5 bg-[#0A0E1B] px-5 pb-8 pt-4 text-[#F3F1FA]">
      <h1 class="text-[1.65rem] font-semibold tracking-tight text-[#F3F1FA]">Perfil</h1>

      <article class="flex items-center gap-3 rounded-2xl bg-[#141A2C] px-4 py-4">
        <div
          class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#7C5CFF,#5B3DE0)] text-lg font-semibold text-white"
          aria-hidden="true">
          {{ operatorInitial() }}
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-base font-semibold text-[#F3F1FA]">{{ auth.user()?.nombre }}</p>
          <p class="truncate text-xs text-[#9096AE]">{{ auth.user()?.email }}</p>
          <span class="mt-1 inline-flex rounded-full bg-[rgba(124,92,255,0.12)] px-2.5 py-0.5 text-[11px] font-semibold text-[#9B7BFF]">
            Plan {{ planName() }}
          </span>
        </div>
        <a
          routerLink="/dashboard/configuracion"
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1A2138] text-[#9B7BFF]"
          aria-label="Editar perfil">
          <i class="ri-pencil-line text-lg" aria-hidden="true"></i>
        </a>
      </article>

      <section class="space-y-2">
        <h2 class="px-1 text-[10px] font-semibold uppercase tracking-widest text-[#5D6280]">Cuenta</h2>
        <div class="overflow-hidden rounded-2xl bg-[#141A2C]">
          <a
            data-testid="perfil-settings-link"
            routerLink="/dashboard/configuracion"
            class="flex items-center gap-3 px-4 py-3">
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1A2138] text-[#9B7BFF]">
              <i class="ri-settings-3-line" aria-hidden="true"></i>
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-semibold text-[#F3F1FA]">Configuración</span>
              <span class="block text-xs text-[#9096AE]">Preferencias generales de la cuenta</span>
            </span>
            <i class="ri-arrow-right-s-line text-lg text-[#5D6280]" aria-hidden="true"></i>
          </a>
          <div class="h-px bg-white/5" aria-hidden="true"></div>
          <a
            routerLink="/dashboard/configuracion"
            [queryParams]="{ tab: 'negocio' }"
            class="flex items-center gap-3 px-4 py-3">
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1A2138] text-[#9B7BFF]">
              <i class="ri-store-2-line" aria-hidden="true"></i>
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-semibold text-[#F3F1FA]">Mi negocio</span>
              <span class="block text-xs text-[#9096AE]">Horarios, servicios y datos públicos</span>
            </span>
            <i class="ri-arrow-right-s-line text-lg text-[#5D6280]" aria-hidden="true"></i>
          </a>
          <div class="h-px bg-white/5" aria-hidden="true"></div>
          <a routerLink="/dashboard/notificaciones" class="flex items-center gap-3 px-4 py-3">
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1A2138] text-[#9B7BFF]">
              <i class="ri-notification-3-line" aria-hidden="true"></i>
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-semibold text-[#F3F1FA]">Notificaciones</span>
              <span class="block text-xs text-[#9096AE]">Recordatorios y avisos push</span>
            </span>
            <span class="text-xs font-semibold text-[#9B7BFF]">Activas</span>
            <i class="ri-arrow-right-s-line text-lg text-[#5D6280]" aria-hidden="true"></i>
          </a>
        </div>
      </section>

      <section class="space-y-2">
        <h2 class="px-1 text-[10px] font-semibold uppercase tracking-widest text-[#5D6280]">Soporte</h2>
        <div class="overflow-hidden rounded-2xl bg-[#141A2C]">
          <a href="mailto:orvel2026@gmail.com" class="flex items-center gap-3 px-4 py-3">
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1A2138] text-[#9B7BFF]">
              <i class="ri-customer-service-2-line" aria-hidden="true"></i>
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-semibold text-[#F3F1FA]">Ayuda y soporte</span>
              <span class="block text-xs text-[#9096AE]">Centro de ayuda y contacto</span>
            </span>
            <i class="ri-arrow-right-s-line text-lg text-[#5D6280]" aria-hidden="true"></i>
          </a>
          <div class="h-px bg-white/5" aria-hidden="true"></div>
          <a
            href="https://orvel.app/terminos-y-condiciones"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-3 px-4 py-3">
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1A2138] text-[#9B7BFF]">
              <i class="ri-shield-line" aria-hidden="true"></i>
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-semibold text-[#F3F1FA]">Privacidad y datos</span>
              <span class="block text-xs text-[#9096AE]">Términos y política de privacidad</span>
            </span>
            <i class="ri-external-link-line text-base text-[#5D6280]" aria-hidden="true"></i>
          </a>
        </div>
      </section>

      <button
        type="button"
        data-testid="perfil-logout"
        class="flex h-12 w-full items-center justify-center rounded-2xl bg-[#141A2C] text-sm font-semibold text-[#F87171]"
        (click)="logout()">
        Cerrar sesión
      </button>

      <p class="text-center text-[11px] text-[#5D6280]">Orvel</p>
    </section>
  `,
  styles: [`
    :host { display: block; }

    .mobile-perfil {
      font-family: 'Manrope', sans-serif;
    }

    .mobile-perfil h1,
    .mobile-perfil h2 {
      font-family: 'Plus Jakarta Sans', sans-serif;
    }
  `],
})
export class PerfilPage {
  readonly auth = inject(AuthService);
  private readonly business = inject(BusinessService);
  private readonly router = inject(Router);

  protected readonly operatorInitial = computed(() => {
    const name = this.auth.user()?.nombre?.trim();
    return name ? name.charAt(0).toUpperCase() : '?';
  });

  protected readonly planName = computed(() => {
    const raw = String(this.business.settings()?.plan ?? this.auth.user()?.plan ?? 'free').trim();
    if (!raw || raw.toUpperCase() === 'FREE') {
      return 'Free';
    }

    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  });

  async logout(): Promise<void> {
    try {
      const redirectTo = await logoutAndRedirect();
      await navigateAfterLogout(redirectTo, this.router);
    } catch {
      window.alert('No se pudo cerrar sesión. Intentá de nuevo.');
    }
  }
}
