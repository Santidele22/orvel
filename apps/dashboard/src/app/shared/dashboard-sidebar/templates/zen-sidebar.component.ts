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
    <aside data-testid="dashboard-sidebar-responsive" class="h-full w-full flex flex-col bg-[#0F172A] shadow-2xl shadow-black/20 animate-in fade-in slide-in-from-left duration-500 border-r border-white/5">
      <!-- Logo / Brand -->
      <div class="flex items-center gap-4 px-6 pt-12 pb-10 shrink-0">
        <div class="flex flex-col items-center w-full">
          <img src="/logo-white.png" alt="Orvel Logo" class="w-32 h-auto object-contain drop-shadow-lg mb-2"/>
          <span class="text-[10px] font-black text-purple-400 tracking-[0.4em] uppercase opacity-80">Premium Edition</span>
        </div>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 px-4 mt-2 overflow-y-auto no-scrollbar">
        <div class="space-y-10">
          <!-- Gestón Group -->
          <div class="space-y-3">
            <span class="px-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Gestión</span>
            <div class="space-y-1">
              @for (link of sidebarLinks.slice(0, 3); track link.path) {
                <a [routerLink]="link.path"
                   routerLinkActive="!bg-purple-500/10 !text-purple-300 !font-bold shadow-inner"
                   class="flex items-center gap-3 px-4 py-3.5 text-slate-400 hover:text-white hover:bg-white/5 transition-all duration-300 rounded-2xl text-[13px] font-semibold group">
                  <i [class]="link.icon" class="text-[1.25rem] group-hover:scale-110 transition-transform text-purple-500/50 group-hover:text-purple-400"></i>
                  <span>{{ link.label }}</span>
                </a>
              }
            </div>
          </div>

          <!-- Sistema Group -->
          <div class="space-y-3">
            <span class="px-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Sistema</span>
            <div class="space-y-1">
              @for (link of sidebarLinks.slice(3); track link.path) {
                <a [routerLink]="link.path"
                   routerLinkActive="!bg-purple-500/10 !text-purple-300 !font-bold shadow-inner"
                   class="flex items-center gap-3 px-4 py-3.5 text-slate-400 hover:text-white hover:bg-white/5 transition-all duration-300 rounded-2xl text-[13px] font-semibold group">
                  <i [class]="link.icon" class="text-[1.25rem] group-hover:scale-110 transition-transform text-purple-500/50 group-hover:text-purple-400"></i>
                  <span>{{ link.label }}</span>
                </a>
              }
            </div>
          </div>
        </div>
      </nav>                               

      <!-- Footer Actions -->
      <div class="px-4 py-8 space-y-3 shrink-0 border-t border-white/5">
        <button class="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white transition-all rounded-2xl font-bold text-xs uppercase tracking-widest group hover:bg-white/5">
          <i class="ri-question-fill text-[1.25rem] group-hover:opacity-100 transition-opacity text-slate-600"></i>
          <span>Soporte</span>
        </button>
        <button (click)="onLogout()" class="w-full h-14 flex items-center gap-3 px-6 rounded-2xl bg-slate-900/50 text-error hover:bg-red-500/10 transition-all font-bold text-xs uppercase tracking-widest group shadow-inner">
          <i class="ri-logout-box-r-fill text-[1.25rem] group-hover:translate-x-1 transition-transform"></i>
          <span>Cerrar Sesión</span>
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
  @Input() onThemeChange: (theme: string) => void = () => { };
  @Input() onLogout: () => void = () => { };
}
