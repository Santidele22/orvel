import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-configuracion-time-picker-minute-section',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './configuracion-time-picker-minute-section.component.tpl'
})
export class ConfiguracionTimePickerMinuteSectionComponent {
  @Input({ required: true }) ctx!: any;
  protected readonly Number = Number;
}
