import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-configuracion-time-picker-hour-section',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './configuracion-time-picker-hour-section.component.tpl'
})
export class ConfiguracionTimePickerHourSectionComponent {
  @Input({ required: true }) ctx!: any;
  protected readonly Number = Number;
}
