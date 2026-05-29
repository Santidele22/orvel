import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DASHBOARD_STRUCTURAL_TOKENS } from '../../../../../core/theming/dashboard-structural.tokens';

@Component({
  selector: 'app-appointment-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <article [class]="'absolute ' + positionClasses + ' bg-surface ' + structure.cardRadius + ' shadow-sm flex flex-col justify-between p-zen-xl gap-zen-sm transition-all hover:scale-[1.01] duration-300 border border-border overflow-hidden group ' + themeClasses">
      <div class="flex items-start justify-between gap-zen-lg">
        <div class="flex-1 min-w-zen-xs">
          <h3 class="text-base font-black tracking-tight truncate" [style.fontFamily]="'var(--heading-font)'" [class.text-text-primary]="!isHighlight">{{ title }}</h3>
          <p class="zen-font-micro font-bold mt-zen-xs truncate" [class.text-text-tertiary]="!isHighlight" [class.text-white/80]="isHighlight">
            {{ client }} • {{ duration }}
          </p>
        </div>
        
        <!-- Status & Hover Actions -->
        <div class="relative flex items-center gap-zen-sm">
           <span class="px-zen-md py-zen-xs text-xs font-black uppercase tracking-zen-wide rounded-full border shrink-0 flex items-center gap-zen-xs transition-all group-hover:opacity-0 group-hover:translate-y-2" 
                 [class]="statusClasses">
              <div *ngIf="isProgress" class="w-zen-xs h-zen-xs rounded-full bg-current animate-pulse"></div>
              {{ status }}
           </span>

           <div class="absolute inset-zen-xs flex items-center justify-end gap-zen-xs opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all">
              <button (click)="reschedule.emit(); $event.stopPropagation()" 
                      class="w-zen-icon-lg h-zen-icon-lg rounded-zen-lg bg-bg border border-border flex items-center justify-center text-text-tertiary hover:text-primary hover:border-primary transition-all shadow-sm"
                      title="Reprogramar">
                <i class="ri-calendar-event-line text-lg"></i>
              </button>
              <button (click)="cancel.emit(); $event.stopPropagation()" 
                      class="w-zen-icon-lg h-zen-icon-lg rounded-zen-lg bg-accent-soft border border-accent flex items-center justify-center text-accent hover:bg-accent-soft/80 transition-all shadow-sm"
                      title="Cancelar">
                <i class="ri-close-line text-lg"></i>
              </button>
           </div>
        </div>
      </div>

      <!-- Bottom Section: Staff & Extra Info -->
      <div class="flex items-center justify-between mt-auto pt-zen-sm border-t border-current/10">
        <div class="flex items-center gap-zen-sm">
          <div class="relative">
            <img [src]="avatar" class="w-zen-icon-md h-zen-icon-md rounded-full object-cover border shadow-sm" [class.border-surface]="!isHighlight" [class.border-white/30]="isHighlight" [alt]="staff"/>
            <div *ngIf="isProgress" class="absolute -bottom-zen-xs -right-zen-xs w-zen-md h-zen-md bg-primary rounded-full border-2 border-surface"></div>
          </div>
          <div class="flex flex-col min-w-zen-xs">
             <span class="zen-font-micro font-black uppercase tracking-zen-wide truncate" [class.text-text-secondary]="!isHighlight">{{ staff }}</span>
             <span class="text-xs font-bold uppercase tracking-zen-wide truncate" [class.text-primary]="!isHighlight" [class.text-white/70]="isHighlight">{{ location }}</span>
          </div>
        </div>

        @if (endTime) {
          <div class="px-zen-sm py-zen-xs bg-surface-muted rounded-zen-lg flex items-center gap-zen-xs shrink-0">
             <i class="ri-time-line text-xs"></i>
             <span class="text-xs font-black uppercase tracking-zen-wide italic opacity-80">Hasta {{ endTime }}</span>
          </div>
        }
      </div>
    </article>
  `
})
export class AppointmentCardComponent {
  protected readonly structure = DASHBOARD_STRUCTURAL_TOKENS;
  @Input() title = '';
  @Input() client = '';
  @Input() duration = '';
  @Input() staff = '';
  @Input() avatar = '';
  @Input() location = '';
  @Input() status = '';
  @Input() positionClasses = '';
  @Input() themeClasses = 'bg-surface border-l-zen-lg border-primary';
  @Input() statusClasses = 'bg-surface-muted text-text-tertiary border-border';
  @Input() isHighlight = false;
  @Input() isProgress = false;
  @Input() endTime = '';

  @Output() reschedule = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
}
