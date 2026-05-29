import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DASHBOARD_STRUCTURAL_TOKENS } from '../../../../../core/theming/dashboard-structural.tokens';

@Component({
  selector: 'app-next-client',
  standalone: true,
  imports: [CommonModule],
  template: `
    <article [class]="structure.cardRadius + ' p-zen-xl bg-surface shadow-sm border border-border relative overflow-hidden group'">
      <!-- Smaller, non-negative gradient background -->
      <div class="absolute top-zen-xs right-zen-xs w-zen-ornament h-zen-ornament bg-primary-soft rounded-full blur-3xl opacity-50"></div>
      
      <div class="flex justify-between items-center mb-zen-lg">
        <p class="zen-font-micro font-black text-primary uppercase tracking-zen-wide opacity-80">PRÓXIMO CLIENTE</p>
        <span [class]="'px-zen-sm py-zen-xs rounded-full text-xs font-black uppercase tracking-zen-wide border ' + getStatusClasses()">
          {{ status }}
        </span>
      </div>

      <div class="flex items-center gap-zen-lg mb-zen-xl">
        <div class="relative shrink-0">
          <img [src]="avatar" class="w-zen-icon-lg h-zen-icon-lg rounded-zen-xl object-cover ring-zen-icon-sm ring-bg shadow-sm" [alt]="name"/>
          <div class="absolute -bottom-zen-xs -right-zen-xs w-zen-lg h-zen-lg bg-primary rounded-full border-2 border-surface shadow-sm overflow-hidden">
             <!-- Combined ping effect -->
             <div class="absolute inset-0 bg-white/20 animate-pulse"></div>
           </div>
        </div>
        <div class="flex flex-col min-w-zen-xs">
          <h4 class="text-base font-black text-text-primary tracking-tight leading-tight truncate" [style.fontFamily]="'var(--heading-font)'">{{ name }}</h4>
          <div class="flex items-center gap-zen-sm mt-zen-xs">
             <span class="px-zen-xs py-zen-xs bg-primary-soft text-primary text-xs font-black uppercase tracking-zen-wide rounded-md border border-primary">VIP</span>
             <span class="text-xs font-bold text-text-tertiary uppercase tracking-zen-wide truncate">{{ visits }} visitas</span>
           </div>
        </div>
      </div>
      
      <div class="grid grid-cols-2 gap-zen-md">
        <div class="p-zen-md rounded-zen-xl bg-bg border border-border text-center shadow-inner hover:border-primary transition-all">
          <p class="text-xs font-black text-text-tertiary uppercase tracking-zen-wide mb-zen-xs">HORARIO</p>
          <p class="text-base font-black text-text-primary">{{ time }}<span class="zen-font-micro font-bold text-text-tertiary ml-zen-xs">{{ period }}</span></p>
        </div>
        <div class="p-zen-md rounded-zen-xl flex flex-col justify-center bg-bg border border-border text-center shadow-inner hover:border-primary transition-all">
          <p class="text-xs font-black text-text-tertiary uppercase tracking-zen-wide mb-zen-xs">SERVICIO</p>
          <p class="text-xs font-black text-primary uppercase leading-tight tracking-zen-wide truncate">{{ treatment }}</p>
        </div>
      </div>
    </article>
  `
})
export class NextClientComponent {
  protected readonly structure = DASHBOARD_STRUCTURAL_TOKENS;
  @Input() avatar = '';
  @Input() name = '';
  @Input() visits: number | string = 0;
  @Input() time = '';
  @Input() period = 'PM';
  @Input() treatment = '';
  @Input() status = 'llega en breve';

  getStatusClasses() {
    if (this.status.includes('breve')) {
      return 'bg-accent-soft text-accent border-accent';
    }
    if (this.status.includes('sesión')) {
      return 'bg-primary-soft text-primary border-primary';
    }
    return 'bg-surface-muted text-text-tertiary border-border';
  }
}
