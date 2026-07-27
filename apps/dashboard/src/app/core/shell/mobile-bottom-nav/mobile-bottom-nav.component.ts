import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { NgClass } from '@angular/common';

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
  imports: [RouterLink, RouterLinkActive, NgClass],
  template: `
    <nav
      class="fixed bottom-0 inset-x-0 z-50 lg:hidden safe-area-bottom"
      aria-label="Navegación principal"
      data-testid="mobile-bottom-nav">
      <div class="flex items-center justify-around h-16 bg-bg-primary border-t border-border px-2 pb-[env(safe-area-inset-bottom)]">
        @for (item of navItems; track item.path) {
          <a
            [routerLink]="item.path"
            routerLinkActive="text-primary"
            [attr.data-testid]="item.testId"
            class="flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 py-1 px-0 rounded-lg transition-colors duration-150 text-text-tertiary"
            [class.text-primary]="isActive(item.path)">
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

    .text-text-tertiary {
      color: var(--divider, #475569);
    }
  `]
})
export class MobileBottomNavComponent {
  private readonly router = inject(Router);

  protected readonly navItems: NavItem[] = [
    { path: '/dashboard/inicio', label: 'Inicio', icon: 'ri-home-5-line', activeIcon: 'ri-home-5-fill', testId: 'nav-inicio' },
    { path: '/dashboard/turnos', label: 'Turnos', icon: 'ri-calendar-line', activeIcon: 'ri-calendar-fill', testId: 'nav-turnos' },
    { path: '/dashboard/clientes', label: 'Clientes', icon: 'ri-group-line', activeIcon: 'ri-group-fill', testId: 'nav-clientes' },
    { path: '/dashboard/notificaciones', label: 'Notificaciones', icon: 'ri-notification-3-line', activeIcon: 'ri-notification-3-fill', testId: 'nav-notificaciones' },
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
