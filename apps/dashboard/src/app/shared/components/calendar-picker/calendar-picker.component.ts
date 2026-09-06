import { Component, EventEmitter, Input, Output, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-calendar-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './calendar-picker.component.html',
  styleUrl: './calendar-picker.component.scss'
})
export class CalendarPickerComponent {
  @Input() set selectedDate(date: Date) {
    this._selectedDate.set(date);
  }
  @Output() dateChange = new EventEmitter<Date>();

  protected readonly _selectedDate = signal<Date>(new Date());
  
  // Navigation for the week view
  protected readonly pivotDate = signal<Date>(new Date());
  
  protected readonly calendarDays = computed(() => {
    const days: Date[] = [];
    const start = new Date(this.pivotDate());
    // Find the Monday of the current week
    const dayOfWeek = start.getDay();
    const diff = start.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const monday = new Date(start.setDate(diff));
    
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        days.push(d);
    }
    return days;
  });

  protected readonly monthLabel = computed(() => {
    return this.pivotDate().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  });

  protected readonly navigatorLabel = computed(() => {
    const selected = this._selectedDate();
    if (this.isToday(selected)) {
      return 'Hoy';
    }

    return selected
      .toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
      .replace(/\./g, '')
      .replace(/,/g, '');
  });

  selectDate(day: Date) {
    this._selectedDate.set(day);
    this.dateChange.emit(day);
  }

  prevWeek() {
    this.shiftSelectedByDays(-7);
  }

  nextWeek() {
    this.shiftSelectedByDays(7);
  }

  goToToday() {
    this.applyViewDate(new Date());
  }

  private shiftSelectedByDays(days: number) {
    const next = new Date(this._selectedDate());
    next.setDate(next.getDate() + days);
    this.applyViewDate(next);
  }

  private applyViewDate(date: Date) {
    this._selectedDate.set(date);
    this.pivotDate.set(date);
    this.dateChange.emit(date);
  }

  isToday(date: Date): boolean {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  isSelected(date: Date): boolean {
    return date.toDateString() === this._selectedDate().toDateString();
  }
}
