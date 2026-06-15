import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { ConfiguracionTimePickerAmPmSectionComponent } from './modal/configuracion-time-picker-ampm-section.component';
import { ConfiguracionTimePickerConfirmActionComponent } from './modal/configuracion-time-picker-confirm-action.component';
import { ConfiguracionTimePickerHeaderComponent } from './modal/configuracion-time-picker-header.component';
import { ConfiguracionTimePickerHourSectionComponent } from './modal/configuracion-time-picker-hour-section.component';
import { ConfiguracionTimePickerMinuteSectionComponent } from './modal/configuracion-time-picker-minute-section.component';

@Component({
  selector: 'app-configuracion-time-modal',
  standalone: true,
  imports: [
    CommonModule,
    ConfiguracionTimePickerHeaderComponent,
    ConfiguracionTimePickerHourSectionComponent,
    ConfiguracionTimePickerMinuteSectionComponent,
    ConfiguracionTimePickerAmPmSectionComponent,
    ConfiguracionTimePickerConfirmActionComponent
  ],
  templateUrl: './configuracion-time-picker-modal.component.tpl'
})
export class ConfiguracionTimePickerModalComponent {
  @Input({ required: true }) ctx!: any;

  protected readonly Number = Number;

  get isInk() {
    return this.ctx.isInk;
  }

  get isTimePickerOpen() {
    return this.ctx.isTimePickerOpen;
  }

  get editingField() {
    return this.ctx.editingField;
  }

  get selectedAmPm() {
    return this.ctx.selectedAmPm;
  }

  get selectedHour() {
    return this.ctx.selectedHour;
  }

  get selectedMinute() {
    return this.ctx.selectedMinute;
  }

  closeTimePicker(): void {
    this.ctx.closeTimePicker();
  }

  confirmTimeChange(): void {
    this.ctx.confirmTimeChange();
  }
}
