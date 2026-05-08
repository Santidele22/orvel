import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

type UiStateVariant = 'loading' | 'empty' | 'error';
type UiStateTone = 'neutral' | 'warning' | 'error' | 'danger';
type UiLiveRole = 'status' | 'alert';
type UiAriaLive = 'polite' | 'assertive' | 'off';

@Component({
  selector: 'app-ui-state-message',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="rounded-xl border px-4 py-3 text-sm"
      role="status"
      [attr.role]="role"
      [attr.aria-live]="ariaLive"
      [ngClass]="{
        'border-slate-200 bg-slate-50 text-slate-700': tone === 'neutral',
        'border-amber-200 bg-amber-50 text-amber-800': tone === 'warning',
        'border-rose-200 bg-rose-50 text-rose-800': resolvedTone === 'error'
      }"
    >
      <p class="font-medium">{{ title }}</p>
      <p *ngIf="description" class="mt-1 text-xs opacity-90">{{ description }}</p>
      <p *ngIf="variant" class="sr-only">{{ variant }}</p>
    </div>
  `
})
export class UiStateMessageComponent {
  @Input({ required: true }) title = '';
  @Input() description = '';
  @Input() variant: UiStateVariant = 'empty';
  @Input() tone: 'neutral' | 'warning' | 'error' = 'neutral';
  @Input() role: UiLiveRole = 'status';
  @Input() ariaLive: UiAriaLive = 'polite';

  get resolvedTone(): Exclude<UiStateTone, 'danger'> {
    return this.tone === 'error' ? 'error' : this.tone;
  }
}
