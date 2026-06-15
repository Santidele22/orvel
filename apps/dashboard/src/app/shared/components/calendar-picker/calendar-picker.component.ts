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

  selectDate(day: Date) {
    this._selectedDate.set(day);
    this.dateChange.emit(day);
  }

  prevWeek() {
    const d = new Date(this.pivotDate());
    d.setDate(d.getDate() - 7);
    this.pivotDate.set(d);
  }

  nextWeek() {
    const d = new Date(this.pivotDate());
    d.setDate(d.getDate() + 7);
    this.pivotDate.set(d);
  }

  goToToday() {
    this.pivotDate.set(new Date());
  }

  isToday(date: Date): boolean {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  isSelected(date: Date): boolean {
    return date.toDateString() === this._selectedDate().toDateString();
  }
}
