import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-date-item',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-col items-center p-3 rounded-[20px] min-w-[60px] transition-all cursor-pointer group"
         [class.bg-(--surface)]="active"
         [class.shadow-2xl]="active"
         [class.shadow-(--primary)/10]="active"
         [class.scale-110]="active"
         [class.z-10]="active"
         (click)="select.emit()">
      <span class="text-[9px] font-bold uppercase tracking-widest transition-colors"
            [class.text-(--primary)]="active"
            [class.text-(--text)/30]="!active">{{ label }}</span>
      <span class="text-xl font-black mt-0.5 transition-colors"
            [class.text-(--text)]="active"
            [class.text-(--text)/20]="!active">{{ date }}</span>
    </div>
  `,
  styles: [`
    :host { display: block; }
  `]
})
export class DateItemComponent {
  @Input() label = '';
  @Input() date = '';
  @Input() active = false;
  @Output() select = new EventEmitter<void>();
}
