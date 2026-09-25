import { Component, Input, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SIDEBAR_LINKS, type SidebarLink } from '../sidebar-links.config';

@Component({
  selector: 'app-zen-sidebar',
  standalone: true,
  template: `
    <aside data-testid="dashboard-sidebar-responsive" class="h-full w-full flex flex-col bg-[#0b1020] bg-gradient-to-b from-purple-950/18 via-[#0F172A] to-[#070b16] shadow-2xl shadow-black/20 animate-in fade-in slide-in-from-left duration-500 border-r border-white/5">
      <div class="shrink-0 px-4 pt-5 pb-6" [class.px-3]="collapsed">
        <div class="flex items-center" [class.justify-between]="!collapsed" [class.flex-col]="collapsed" [class.justify-center]="collapsed" [class.gap-2]="collapsed">
          <div class="flex items-center min-w-0" [class.gap-3]="!collapsed" [class.justify-center]="collapsed">
            <span class="flex items-center justify-center rounded-2xl bg-white/[0.04] ring-1 ring-white/10 shadow-lg shadow-black/10" data-tour="sidebar-logo" [class.h-10]="!collapsed" [class.w-10]="!collapsed" [class.h-11]="collapsed" [class.w-11]="collapsed">
              <img src="/logo-white.png" alt="Orvel Logo" class="h-auto object-contain drop-shadow-lg" [class.w-7]="!collapsed" [class.w-8]="collapsed"/>
            </span>
          </div>

          <button
            type="button"
            data-testid="dashboard-sidebar-collapse-toggle"
            (click)="onToggleCollapse()"
            [attr.aria-expanded]="!collapsed"
            [attr.aria-label]="collapsed ? 'Desplegar menú' : 'Guardar menú'"
            class="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.04] text-slate-300 transition-colors duration-200 hover:bg-white/[0.07] hover:text-white active:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300/70"
          >
            <i [class]="collapsed ? 'ri-menu-unfold-line text-xl' : 'ri-menu-fold-line text-xl'" aria-hidden="true"></i>
          </button>
        </div>
      </div>

      <nav class="flex-1 px-3 mt-1 overflow-y-auto no-scrollbar" data-tour="sidebar-nav" [class.px-3]="collapsed">
        <div [class.space-y-7]="!collapsed" [class.space-y-3]="collapsed">
          <div class="space-y-2">
            @if (!collapsed) {
              <span class="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Gestión</span>
            }
            <div class="space-y-1.5">
              @for (link of gestionLinks; track link.path) {
                <button
                   type="button"
                   (click)="goTo(link.path)"
                   [attr.aria-label]="collapsed ? link.label : null"
                   [attr.aria-current]="isActive(link.path) ? 'page' : null"
                   class="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-[13px] font-medium text-slate-200 transition-colors duration-200 hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300/60"
                   [class.bg-purple-500/10]="isActive(link.path)"
                   [class.text-purple-100]="isActive(link.path)"
                   [class.justify-center]="collapsed"
                   [class.w-10]="collapsed"
                   [class.mx-auto]="collapsed"
                   [class.px-0]="collapsed">
                    <i [class]="link.icon" class="text-[1.2rem]" aria-hidden="true"></i>
                    @if (!collapsed) {
                      <span class="truncate">{{ link.label }}</span>
                    }
                 </button>
              }
            </div>
          </div>

          <div class="space-y-2">
            @if (!collapsed) {
              <span class="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Sistema</span>
            }
            <div class="space-y-1.5">
              @for (link of sistemaLinks; track link.path) {
                <button
                   type="button"
                   (click)="goTo(link.path)"
                   [attr.aria-label]="collapsed ? link.label : null"
                   [attr.aria-current]="isActive(link.path) ? 'page' : null"
                   class="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-[13px] font-medium text-slate-200 transition-colors duration-200 hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300/60"
                   [class.bg-purple-500/10]="isActive(link.path)"
                   [class.text-purple-100]="isActive(link.path)"
                   [class.justify-center]="collapsed"
                   [class.w-10]="collapsed"
                   [class.mx-auto]="collapsed"
                   [class.px-0]="collapsed">
                    <i [class]="link.icon" class="text-[1.2rem]" aria-hidden="true"></i>
                    @if (!collapsed) {
                      <span class="truncate">{{ link.label }}</span>
                    }
                 </button>
              }
            </div>
          </div>
        </div>
      </nav>

      <div class="px-3 py-5 space-y-2 shrink-0 border-t border-white/5">
        <button data-testid="dashboard-sidebar-logout-action" (click)="onLogout()" [attr.aria-label]="collapsed ? 'Cerrar sesión' : null" class="w-full h-10 flex items-center gap-3 px-3 rounded-xl bg-slate-950/25 text-error hover:bg-red-500/10 transition-colors font-semibold text-xs uppercase tracking-widest group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/50" [class.justify-center]="collapsed" [class.w-10]="collapsed" [class.mx-auto]="collapsed" [class.px-0]="collapsed">
          <i class="ri-logout-box-r-fill text-[1.2rem]" aria-hidden="true"></i>
          @if (!collapsed) {
            <span>Cerrar sesión</span>
          }
        </button>
      </div>
    </aside>
  `
})
export class ZenSidebarComponent {
  private readonly router = inject(Router);
  protected readonly gestionLinks: SidebarLink[] = SIDEBAR_LINKS.slice(0, 3);
  protected readonly sistemaLinks: SidebarLink[] = SIDEBAR_LINKS.slice(3);

  @Input() activeTheme: string = 'zen';
  @Input() businessName: string = 'Orvel';
  @Input() dashboards: any[] = [];
  @Input() collapsed: boolean = false;
  @Input() onThemeChange: (theme: string) => void = () => { };
  @Input() onToggleCollapse: () => void = () => { };
  @Input() onLogout: () => void | Promise<void> = () => { };

  protected isActive(path: string): boolean {
    const url = this.router.url;
    return url === path || url.startsWith(`${path}?`) || url.startsWith(`${path}/`);
  }

  protected goTo(path: string): void {
    void this.router.navigateByUrl(path);
  }
}
