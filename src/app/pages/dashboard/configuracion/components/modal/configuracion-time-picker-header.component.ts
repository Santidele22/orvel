import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-configuracion-time-picker-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './configuracion-time-picker-header.component.tpl'
})
export class ConfiguracionTimePickerHeaderComponent {
  @Input({ required: true }) ctx!: any;
}
