import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

export interface NavItem {
  path: string;
  label: string;
  icon: string;
  activeIcon: string;
  testId: string;
}

@Component({
  selector: 'app-mobile-bottom-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav
      class="fixed bottom-0 inset-x-0 z-50 lg:hidden safe-area-bottom"
      aria-label="Navegación principal"
      data-testid="mobile-bottom-nav">
      <div class="flex items-center justify-around h-16 px-2 pb-[env(safe-area-inset-bottom)] border-t bg-[rgba(13,18,32,0.92)] backdrop-blur-xl border-[rgba(255,255,255,0.045)]">
        @for (item of navItems; track item.path) {
          <a
            [routerLink]="item.path"
            routerLinkActive="text-[#9B7BFF]"
            [attr.data-testid]="item.testId"
            class="flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 py-1 px-0 rounded-full transition-colors duration-150 text-[#5D6280]"
            [class.text-[#9B7BFF]]="isActive(item.path)"
            [class.bg-[rgba(124,92,255,0.12)]]="isActive(item.path)">
            <i [class]="(isActive(item.path) ? item.activeIcon : item.icon) + ' text-xl'" aria-hidden="true"></i>
            <span class="text-[10px] font-medium leading-tight truncate max-w-full">{{ item.label }}</span>
          </a>
        }
      </div>
    </nav>
  `,
  styles: [`
    :host {
      display: contents;
    }

    .safe-area-bottom {
      padding-bottom: env(safe-area-inset-bottom, 0px);
    }
  `]
})
export class MobileBottomNavComponent {
  private readonly router = inject(Router);

  protected readonly navItems: NavItem[] = [
    { path: '/dashboard/inicio', label: 'Inicio', icon: 'ri-home-5-line', activeIcon: 'ri-home-5-fill', testId: 'nav-inicio' },
    { path: '/dashboard/turnos', label: 'Agenda', icon: 'ri-calendar-line', activeIcon: 'ri-calendar-fill', testId: 'nav-turnos' },
    { path: '/dashboard/clientes', label: 'Clientes', icon: 'ri-group-line', activeIcon: 'ri-group-fill', testId: 'nav-clientes' },
    { path: '/dashboard/notificaciones', label: 'Avisos', icon: 'ri-notification-3-line', activeIcon: 'ri-notification-3-fill', testId: 'nav-notificaciones' },
    { path: '/dashboard/perfil', label: 'Perfil', icon: 'ri-user-line', activeIcon: 'ri-user-fill', testId: 'nav-perfil' },
  ];

  protected readonly currentUrl = computed(() => this.router.url);

  protected isActive(path: string): boolean {
    // Match the current route: exact match or when the URL starts with the item's base path
    const url = this.router.url;
    // Exact match
    if (url === path) return true;
    // Child route match (e.g. /dashboard/turnos/new matches /dashboard/turnos)
    if (url.startsWith(path + '/')) return true;
    // Handle the root /dashboard when it redirects to /dashboard/inicio
    if (path === '/dashboard/inicio' && (url === '/dashboard' || url === '/dashboard/')) return true;
    return false;
  }
}
