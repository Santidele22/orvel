import { Component, Input, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../../core/theming/theme.service';
import { SIDEBAR_LINKS } from '../sidebar-links.config';

@Component({
  selector: 'app-zen-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <aside data-testid="dashboard-sidebar-responsive" class="h-full w-full flex flex-col bg-[#0b1020] bg-gradient-to-b from-purple-950/35 via-[#0F172A] to-[#070b16] shadow-2xl shadow-black/20 animate-in fade-in slide-in-from-left duration-500 border-r border-purple-400/10">
      <!-- Logo / Brand -->
      <div class="shrink-0 px-4 pt-5 pb-6" [class.px-3]="collapsed">
        <div class="flex items-center" [class.justify-between]="!collapsed" [class.flex-col]="collapsed" [class.justify-center]="collapsed" [class.gap-2]="collapsed">
          <div class="flex items-center min-w-0" [class.gap-3]="!collapsed" [class.justify-center]="collapsed">
            <span class="flex items-center justify-center rounded-2xl bg-purple-500/10 ring-1 ring-purple-300/15 shadow-lg shadow-purple-950/20" [class.h-10]="!collapsed" [class.w-10]="!collapsed" [class.h-11]="collapsed" [class.w-11]="collapsed">
              <img src="/logo-white.png" alt="Orvel Logo" class="h-auto object-contain drop-shadow-lg" [class.w-7]="!collapsed" [class.w-8]="collapsed"/>
            </span>
          </div>

          <button
            type="button"
            data-testid="dashboard-sidebar-collapse-toggle"
            (click)="onToggleCollapse()"
            [attr.aria-expanded]="!collapsed"
            [attr.aria-label]="collapsed ? 'Desplegar menú' : 'Guardar menú'"
            class="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.04] text-purple-100/75 transition-all duration-200 hover:bg-purple-400/10 hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300/70"
          >
            <i [class]="collapsed ? 'ri-menu-unfold-line text-xl' : 'ri-menu-fold-line text-xl'" aria-hidden="true"></i>
          </button>
        </div>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 px-3 mt-1 overflow-y-auto no-scrollbar" [class.px-3]="collapsed">
        <div [class.space-y-7]="!collapsed" [class.space-y-3]="collapsed">
          <!-- Gestón Group -->
          <div class="space-y-2">
            @if (!collapsed) {
              <span class="px-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Gestión</span>
            }
            <div class="space-y-1.5">
              @for (link of sidebarLinks.slice(0, 3); track link.path) {
                <a [routerLink]="link.path"
                   [attr.aria-label]="collapsed ? link.label : null"
                   routerLinkActive="!bg-purple-500/10 !text-purple-100 !font-bold ring-1 ring-purple-300/15 shadow-inner shadow-purple-950/10"
                   ariaCurrentWhenActive="page"
                   class="flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold text-slate-400 transition-all duration-200 hover:bg-white/[0.04] hover:text-purple-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300/60 group"
                   [class.justify-center]="collapsed"
                   [class.w-10]="collapsed"
                   [class.mx-auto]="collapsed"
                   [class.px-0]="collapsed">
                    <i [class]="link.icon" class="text-[1.2rem] transition-transform text-purple-400/60 group-hover:scale-105 group-hover:text-purple-300" aria-hidden="true"></i>
                    @if (!collapsed) {
                      <span class="truncate">{{ link.label }}</span>
                    }
                 </a>
              }
            </div>
          </div>

          <!-- Sistema Group -->
          <div class="space-y-2">
            @if (!collapsed) {
              <span class="px-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Sistema</span>
            }
            <div class="space-y-1.5">
              @for (link of sidebarLinks.slice(3); track link.path) {
                <a [routerLink]="link.path"
                   [attr.aria-label]="collapsed ? link.label : null"
                   routerLinkActive="!bg-purple-500/10 !text-purple-100 !font-bold ring-1 ring-purple-300/15 shadow-inner shadow-purple-950/10"
                   ariaCurrentWhenActive="page"
                   class="flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold text-slate-400 transition-all duration-200 hover:bg-white/[0.04] hover:text-purple-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300/60 group"
                   [class.justify-center]="collapsed"
                   [class.w-10]="collapsed"
                   [class.mx-auto]="collapsed"
                   [class.px-0]="collapsed">
                    <i [class]="link.icon" class="text-[1.2rem] transition-transform text-purple-400/60 group-hover:scale-105 group-hover:text-purple-300" aria-hidden="true"></i>
                    @if (!collapsed) {
                      <span class="truncate">{{ link.label }}</span>
                    }
                 </a>
              }
            </div>
          </div>
        </div>
      </nav>                               

      <!-- Footer Actions -->
      <div class="px-3 py-5 space-y-2 shrink-0 border-t border-purple-400/10">
        <button [attr.aria-label]="collapsed ? 'Soporte' : null" class="w-full h-10 flex items-center gap-3 px-3 text-slate-400 hover:text-purple-100 transition-all rounded-xl font-bold text-xs uppercase tracking-widest group hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300/60" [class.justify-center]="collapsed" [class.w-10]="collapsed" [class.mx-auto]="collapsed" [class.px-0]="collapsed">
          <i class="ri-question-fill text-[1.2rem] group-hover:opacity-100 transition-opacity text-slate-500" aria-hidden="true"></i>
          @if (!collapsed) {
            <span>Soporte</span>
          }
        </button>
        <button data-testid="dashboard-sidebar-logout-action" (click)="onLogout()" [attr.aria-label]="collapsed ? 'Cerrar sesión' : null" class="w-full h-10 flex items-center gap-3 px-3 rounded-xl bg-slate-950/35 text-error hover:bg-red-500/10 transition-all font-bold text-xs uppercase tracking-widest group shadow-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/50" [class.justify-center]="collapsed" [class.w-10]="collapsed" [class.mx-auto]="collapsed" [class.px-0]="collapsed">
          <i class="ri-logout-box-r-fill text-[1.2rem] group-hover:translate-x-0.5 transition-transform" aria-hidden="true"></i>
          @if (!collapsed) {
            <span>Cerrar sesión</span>
          }
        </button>
      </div>
    </aside>
  `
})
export class ZenSidebarComponent {
  protected readonly themeService = inject(ThemeService);
  protected readonly sidebarLinks = SIDEBAR_LINKS;

  @Input() activeTheme: string = 'zen';
  @Input() businessName: string = 'Orvel';
  @Input() dashboards: any[] = [];
  @Input() collapsed: boolean = false;
  @Input() onThemeChange: (theme: string) => void = () => { };
  @Input() onToggleCollapse: () => void = () => { };
  @Input() onLogout: () => void | Promise<void> = () => { };
}
