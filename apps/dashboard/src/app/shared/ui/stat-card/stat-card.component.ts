import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DASHBOARD_STRUCTURAL_TOKENS } from '../../../core/theming/dashboard-structural.tokens';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div [class]="structure.cardRadius + ' p-5 bg-(--surface) border border-(--text)/5 flex flex-col gap-4 group hover:border-(--primary)/30 transition-all shadow-xl'">
      <div [class]="'w-10 h-10 rounded-2xl flex items-center justify-center shadow-inner ' + iconBgClass + ' ' + iconTextClass">
        <i [class]="icon + ' text-xl'"></i>
      </div>
      <div>
        <p class="text-2xl font-black text-(--text) tracking-tighter" [style.fontFamily]="'var(--heading-font)'">
          <span *ngIf="type === 'currency'" class="text-sm mr-0.5">$</span>{{ value }}<span *ngIf="suffix" class="text-sm">{{ suffix }}</span><span *ngIf="type === 'percentage'" class="text-sm ml-0.5">%</span>
        </p>
        <p class="text-[8px] font-black text-(--text)/40 uppercase tracking-[0.2em] mt-1">{{ label }}</p>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
  `]
})
export class StatCardComponent {
  protected readonly structure = DASHBOARD_STRUCTURAL_TOKENS;
  @Input() icon = '';
  @Input() value: string | number = '';
  @Input() label = '';
  @Input() suffix = '';
  @Input() type: 'number' | 'currency' | 'percentage' = 'number';
  @Input() iconBgClass = 'bg-(--primary)/10';
  @Input() iconTextClass = 'text-(--primary)';
}
