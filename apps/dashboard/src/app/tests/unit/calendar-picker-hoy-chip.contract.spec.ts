import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { CalendarPickerComponent } from '../../shared/components/calendar-picker/calendar-picker.component';

const TEMPLATE_PATH = join(
  process.cwd(),
  'src/app/shared/components/calendar-picker/calendar-picker.component.html'
);

function civil(year: number, monthIndex: number, day: number): Date {
  return new Date(year, monthIndex, day);
}

function asPickerInternals(picker: CalendarPickerComponent): {
  navigatorLabel: () => string;
  _selectedDate: () => Date;
  pivotDate: () => Date;
} {
  return picker as unknown as {
    navigatorLabel: () => string;
    _selectedDate: () => Date;
    pivotDate: () => Date;
  };
}

describe('Calendar picker Hoy chip (#789)', () => {
  it('binds a computed navigator label instead of hardcoding Hoy', () => {
    const template = readFileSync(TEMPLATE_PATH, 'utf8');
    const goToTodayBlock = template.slice(
      template.indexOf('goToToday()'),
      template.indexOf('nextWeek()')
    );

    expect(template).toContain('(click)="goToToday()"');
    expect(goToTodayBlock).not.toMatch(/>\s*Hoy\s*</);
    expect(goToTodayBlock).toMatch(/\{\{\s*navigatorLabel\(\)\s*\}\}/);
  });

  it('shows Hoy when the selected date is today', () => {
    const picker = new CalendarPickerComponent();
    picker.selectedDate = new Date();

    expect(asPickerInternals(picker).navigatorLabel()).toBe('Hoy');
  });

  it('shows a real es-AR date when the selected date is not today', () => {
    const picker = new CalendarPickerComponent();
    picker.selectedDate = civil(2026, 8, 4);

    const label = asPickerInternals(picker).navigatorLabel();
    expect(label).not.toBe('Hoy');
    expect(label.toLowerCase()).toMatch(/4/);
    expect(label.toLowerCase()).toMatch(/sep/);
  });

  it('prevWeek moves selected and pivot back 7 days and emits dateChange', () => {
    const picker = new CalendarPickerComponent();
    const start = civil(2026, 8, 3);
    picker.selectedDate = start;
    picker['pivotDate'].set(start);

    const emitted: Date[] = [];
    picker.dateChange.subscribe((date) => emitted.push(date));
    picker.prevWeek();

    const expected = civil(2026, 7, 27);
    expect(emitted).toHaveLength(1);
    expect(emitted[0].toDateString()).toBe(expected.toDateString());
    expect(asPickerInternals(picker)._selectedDate().toDateString()).toBe(expected.toDateString());
    expect(asPickerInternals(picker).pivotDate().toDateString()).toBe(expected.toDateString());
  });

  it('nextWeek moves selected and pivot forward 7 days and emits dateChange', () => {
    const picker = new CalendarPickerComponent();
    const start = civil(2026, 8, 3);
    picker.selectedDate = start;
    picker['pivotDate'].set(start);

    const emitted: Date[] = [];
    picker.dateChange.subscribe((date) => emitted.push(date));
    picker.nextWeek();

    const expected = civil(2026, 8, 10);
    expect(emitted).toHaveLength(1);
    expect(emitted[0].toDateString()).toBe(expected.toDateString());
    expect(asPickerInternals(picker)._selectedDate().toDateString()).toBe(expected.toDateString());
    expect(asPickerInternals(picker).pivotDate().toDateString()).toBe(expected.toDateString());
  });

  it('goToToday sets selected and pivot to today and emits dateChange', () => {
    const picker = new CalendarPickerComponent();
    const otherDay = civil(2026, 8, 10);
    picker.selectedDate = otherDay;
    picker['pivotDate'].set(otherDay);

    const emitted: Date[] = [];
    picker.dateChange.subscribe((date) => emitted.push(date));
    picker.goToToday();

    const today = new Date();
    expect(emitted).toHaveLength(1);
    expect(emitted[0].toDateString()).toBe(today.toDateString());
    expect(asPickerInternals(picker)._selectedDate().toDateString()).toBe(today.toDateString());
    expect(asPickerInternals(picker).pivotDate().toDateString()).toBe(today.toDateString());
  });
});
