import { Component, Input, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { useDayStripController } from '../../../../shared/hooks/use-day-strip-controller/use-day-strip-controller';
import { MobileAppointmentCardComponent } from '../mobile-appointment-card/mobile-appointment-card.component';
import type { TurnoWithRelations } from '../../models/turno.model';

const SPANISH_DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

@Component({
  selector: 'app-mobile-agenda-day-view',
  standalone: true,
  imports: [CommonModule, RouterLink, MobileAppointmentCardComponent],
  templateUrl: './mobile-agenda-day-view.component.html',
  styleUrl: './mobile-agenda-day-view.component.scss',
})
export class MobileAgendaDayViewComponent {
  /** All turnos for the current context; filtered by selectedDate for empty-state check. */
  @Input() turnos: TurnoWithRelations[] = [];

  /** The currently-selected date from the parent. */
  @Input() set selectedDate(date: Date) {
    this._selectedDate.set(date);
  }

  /** Hardcoded loading flag. */
  @Input() loading = false;

  /** Internal selectedDate signal driven by the @Input setter. */
  protected readonly _selectedDate = signal<Date>(new Date());

  /** Day strip controller from PR #1 hook, initialised from _selectedDate. */
  protected readonly dayStrip = useDayStripController({
    anchor: this._selectedDate(),
  });

  /** Turnos filtered to the currently selected date (for empty-state check). */
  protected readonly filteredTurnos = computed(() => {
    const date = this._selectedDate();
    return this.turnos.filter((t) => {
      const tStr =
        t.fecha.getFullYear() +
        '-' +
        (t.fecha.getMonth() + 1).toString().padStart(2, '0') +
        '-' +
        t.fecha.getDate().toString().padStart(2, '0');
      const sStr =
        date.getFullYear() +
        '-' +
        (date.getMonth() + 1).toString().padStart(2, '0') +
        '-' +
        date.getDate().toString().padStart(2, '0');
      return tStr === sStr;
    });
  });

  /** Format a date as day-of-week short name (Spanish). */
  protected dayName(date: Date): string {
    return SPANISH_DAY_NAMES[date.getDay()];
  }

  /** Format a date as day-of-month number. */
  protected dayNumber(date: Date): number {
    return date.getDate();
  }

  /** Check if a given date is today. */
  protected isToday(date: Date): boolean {
    const today = new Date();
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  }

  /** Check if a given date is the currently selected date. */
  protected isSelected(date: Date): boolean {
    const selected = this._selectedDate();
    return (
      date.getFullYear() === selected.getFullYear() &&
      date.getMonth() === selected.getMonth() &&
      date.getDate() === selected.getDate()
    );
  }

  /** Select a day from the strip. */
  protected selectDate(date: Date): void {
    this._selectedDate.set(date);
  }

  /** True when the filtered list is empty (show empty state). */
  protected get isEmpty(): boolean {
    return this.filteredTurnos().length === 0;
  }
}
