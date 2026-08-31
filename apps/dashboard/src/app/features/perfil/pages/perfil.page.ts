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
    <section data-testid="perfil-page" class="mobile-perfil min-h-full px-5 pb-8 pt-[22px] text-[#F3F1FA]">
      <h1 class="mb-5 text-[22px] font-extrabold tracking-[-0.4px] text-[#F3F1FA]">Perfil</h1>

      <article class="profile-card relative mb-[22px] flex items-center gap-[15px] overflow-hidden rounded-[22px] border border-[rgba(255,255,255,0.045)] bg-[#141A2C] px-5 py-[22px]">
        <div
          class="relative z-[1] flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-[18px] bg-[linear-gradient(155deg,#7C5CFF,#5B3DE0)] text-[22px] font-extrabold text-white shadow-[0_8px_20px_rgba(124,92,255,0.35)]"
          aria-hidden="true">
          {{ operatorInitial() }}
        </div>
        <div class="relative z-[1] min-w-0 flex-1">
          <p class="mb-[3px] truncate text-[18px] font-extrabold capitalize tracking-[-0.2px] text-[#F3F1FA]">{{ auth.user()?.nombre }}</p>
          <p class="mb-[9px] truncate text-[13px] font-medium text-[#9096AE]">{{ auth.user()?.email }}</p>
          <span class="inline-flex items-center gap-[5px] rounded-full bg-[rgba(124,92,255,0.16)] py-1 pl-2 pr-2.5 text-[11px] font-bold text-[#9B7BFF]">
            <svg class="h-[11px] w-[11px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.6 6.6L21 9l-5 4.4L17.5 21 12 17.3 6.5 21 8 13.4 3 9l6.4-.4L12 2z"/></svg>
            Plan {{ planName() }}
          </span>
        </div>
        <a
          routerLink="/dashboard/configuracion"
          class="relative z-[1] flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border border-[rgba(255,255,255,0.045)] bg-[#1A2138] text-[#9096AE]"
          aria-label="Editar perfil">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19 3 20l1-4L16.5 3.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
        </a>
      </article>

      <h2 class="mb-2.5 ml-1 mt-1 text-xs font-bold uppercase tracking-[0.9px] text-[#5D6280]">Cuenta</h2>
      <div class="mb-[22px] overflow-hidden rounded-[16px] border border-[rgba(255,255,255,0.045)] bg-[#141A2C]">
        <a
          data-testid="perfil-settings-link"
          routerLink="/dashboard/configuracion"
          class="flex items-center gap-[13px] px-[15px] py-3.5">
          <span class="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-[#1A2138] text-[#9096AE]">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
          </span>
          <span class="min-w-0 flex-1">
            <span class="mb-0.5 block text-[14.5px] font-bold text-[#F3F1FA]">Configuración</span>
            <span class="block text-[11.5px] font-medium text-[#5D6280]">Preferencias generales de la cuenta</span>
          </span>
          <svg class="h-4 w-4 shrink-0 text-[#5D6280]" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </a>
        <a
          routerLink="/dashboard/configuracion"
          [queryParams]="{ tab: 'negocio' }"
          class="flex items-center gap-[13px] border-t border-[rgba(255,255,255,0.045)] px-[15px] py-3.5">
          <span class="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-[#1A2138] text-[#9096AE]">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2.5" stroke="currentColor" stroke-width="1.8"/><path d="M8 7V5.5A2.5 2.5 0 0 1 10.5 3h3A2.5 2.5 0 0 1 16 5.5V7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </span>
          <span class="min-w-0 flex-1">
            <span class="mb-0.5 block text-[14.5px] font-bold text-[#F3F1FA]">Mi negocio</span>
            <span class="block text-[11.5px] font-medium text-[#5D6280]">Horarios, servicios y datos públicos</span>
          </span>
          <svg class="h-4 w-4 shrink-0 text-[#5D6280]" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </a>
        <a routerLink="/dashboard/notificaciones" class="flex items-center gap-[13px] border-t border-[rgba(255,255,255,0.045)] px-[15px] py-3.5">
          <span class="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-[#1A2138] text-[#9096AE]">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </span>
          <span class="min-w-0 flex-1">
            <span class="mb-0.5 block text-[14.5px] font-bold text-[#F3F1FA]">Notificaciones</span>
            <span class="block text-[11.5px] font-medium text-[#5D6280]">Recordatorios y avisos push</span>
          </span>
          <span class="flex items-center gap-1.5 text-[#5D6280]">
            <span class="text-[12.5px] font-semibold text-[#9096AE]">Activas</span>
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
        </a>
      </div>

      <h2 class="mb-2.5 ml-1 mt-1 text-xs font-bold uppercase tracking-[0.9px] text-[#5D6280]">Soporte</h2>
      <div class="mb-[22px] overflow-hidden rounded-[16px] border border-[rgba(255,255,255,0.045)] bg-[#141A2C]">
        <a href="mailto:orvel2026@gmail.com" class="flex items-center gap-[13px] px-[15px] py-3.5">
          <span class="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-[#1A2138] text-[#9096AE]">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.3.9-1.3 1.7v.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="16.5" r="0.9" fill="currentColor"/></svg>
          </span>
          <span class="min-w-0 flex-1">
            <span class="mb-0.5 block text-[14.5px] font-bold text-[#F3F1FA]">Ayuda y soporte</span>
            <span class="block text-[11.5px] font-medium text-[#5D6280]">Centro de ayuda y contacto</span>
          </span>
          <svg class="h-4 w-4 shrink-0 text-[#5D6280]" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </a>
        <a
          href="https://orvel.pro/terminos-y-condiciones"
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center gap-[13px] border-t border-[rgba(255,255,255,0.045)] px-[15px] py-3.5">
          <span class="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-[#1A2138] text-[#9096AE]">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2 3 7v6c0 5 4 8.5 9 9 5-.5 9-4 9-9V7l-9-5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
          </span>
          <span class="min-w-0 flex-1">
            <span class="mb-0.5 block text-[14.5px] font-bold text-[#F3F1FA]">Privacidad y datos</span>
            <span class="block text-[11.5px] font-medium text-[#5D6280]">Términos y política de privacidad</span>
          </span>
          <svg class="h-4 w-4 shrink-0 text-[#5D6280]" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </a>
      </div>

      <button
        type="button"
        data-testid="perfil-logout"
        class="mb-4 flex w-full items-center justify-center gap-[9px] rounded-[16px] border border-[rgba(248,113,113,0.18)] bg-[rgba(248,113,113,0.08)] py-[15px] text-[14.5px] font-bold text-[#F87171]"
        (click)="logout()">
        <svg class="h-[17px] w-[17px]" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 17l5-5-5-5M21 12H9" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Cerrar sesión
      </button>

      <p class="mb-2 text-center text-[11.5px] font-semibold text-[#5D6280]">Orvel</p>
    </section>
  `,
  styles: [`
    :host { display: block; }

    .mobile-perfil {
      font-family: 'Manrope', sans-serif;
      background:
        radial-gradient(120% 55% at 15% -5%, rgba(124, 92, 255, 0.16), transparent 55%),
        radial-gradient(90% 40% at 100% 0%, rgba(124, 92, 255, 0.08), transparent 50%),
        #0A0E1B;
    }

    .mobile-perfil h1,
    .mobile-perfil h2,
    .mobile-perfil .profile-card {
      font-family: 'Plus Jakarta Sans', sans-serif;
    }

    .profile-card::before {
      content: '';
      position: absolute;
      top: -40%;
      right: -20%;
      width: 160px;
      height: 160px;
      background: radial-gradient(circle, rgba(124, 92, 255, 0.22), transparent 70%);
      pointer-events: none;
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
