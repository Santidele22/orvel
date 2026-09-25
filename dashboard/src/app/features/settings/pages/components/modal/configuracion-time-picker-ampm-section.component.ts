import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-configuracion-time-picker-ampm-section',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './configuracion-time-picker-ampm-section.component.tpl'
})
export class ConfiguracionTimePickerAmPmSectionComponent {
  @Input({ required: true }) ctx!: any;
}
