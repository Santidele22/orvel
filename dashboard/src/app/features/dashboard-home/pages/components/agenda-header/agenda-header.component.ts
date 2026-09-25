import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DateItemComponent } from '../../../../../shared/ui/date-item/date-item.component';
import { DASHBOARD_STRUCTURAL_TOKENS } from '../../../../../core/theming/dashboard-structural.tokens';

@Component({
  selector: 'app-agenda-header',
  standalone: true,
  imports: [CommonModule, DateItemComponent],
  template: `
    <header [class]="structure.cardPadding + ' border-b border-text-primary/5 flex items-center justify-between bg-surface/50 backdrop-blur-md sticky top-zen-xs z-20'">
      <div class="flex items-center mx-auto gap-zen-xxl">
        <div class="flex items-center gap-zen-sm">
          <button (click)="prev.emit()" class="w-zen-icon-lg h-zen-icon-lg rounded-zen-lg bg-bg border border-text-primary/5 flex items-center justify-center text-text-primary/30 hover:text-primary hover:border-primary/20 transition-all active:scale-95">
            <i class="ri-arrow-left-s-line text-lg"></i>
          </button>
          
          <div class="flex gap-zen-sm mx-zen-sm">
            @for (day of weekDays; track day.date) {
              <app-date-item 
                [label]="day.label" 
                [date]="day.date" 
                [active]="day.active"
                (select)="daySelect.emit(day)">
              </app-date-item>
            }
          </div>

          <button (click)="next.emit()" class="w-zen-icon-lg h-zen-icon-lg rounded-zen-lg bg-bg border border-text-primary/5 flex items-center justify-center text-text-primary/30 hover:text-primary hover:border-primary/20 transition-all active:scale-95">
            <i class="ri-arrow-right-s-line text-lg"></i>
          </button>
        </div>
      </div>

    </header>
  `
})
export class AgendaHeaderComponent {
  protected readonly structure = DASHBOARD_STRUCTURAL_TOKENS;
  @Input() weekDays: any[] = [];
  @Output() daySelect = new EventEmitter<any>();
  @Output() prev = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();
}
