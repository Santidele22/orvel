import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DASHBOARD_STRUCTURAL_TOKENS } from '../../../../../core/theming/dashboard-structural.tokens';

@Component({
  selector: 'app-insight-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <article [class]="structure.cardRadius + ' p-zen-lg bg-surface shadow-sm border border-border relative overflow-hidden group'">
       <div class="flex items-center gap-zen-lg">
          <div [class]="'w-zen-control-md h-zen-control-md rounded-zen-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110 ' + (isInsight ? 'bg-primary-soft text-primary' : 'bg-accent-soft text-accent')">
            <i [class]="(isInsight ? 'ri-lightbulb-flash-line' : 'ri-chat-smile-3-line') + ' text-xl'"></i>
          </div>
          <div class="flex-1 min-w-zen-xs">
            <p class="zen-font-micro font-black text-text-tertiary uppercase tracking-zen-wide mb-zen-xs">{{ isInsight ? 'RECOMENDACIÓN IA' : 'RECENT FEEDBACK' }}</p>
            <p class="text-sm font-medium text-text-secondary italic leading-snug">"{{ text }}"</p>
            <div *ngIf="!isInsight" class="flex gap-zen-xs mt-zen-sm text-accent">
               @for (i of stars; track i) { <i class="ri-star-fill text-xs"></i> }
            </div>
          </div>
       </div>
    </article>
  `
})
export class InsightCardComponent {
  protected readonly structure = DASHBOARD_STRUCTURAL_TOKENS;
  @Input() text = '';
  @Input() rating = 5;
  @Input() isInsight = true;
  get stars() { return Array(this.rating).fill(0).map((_, i) => i); }
}
