import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-configuracion-time-picker-confirm-action',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './configuracion-time-picker-confirm-action.component.tpl'
})
export class ConfiguracionTimePickerConfirmActionComponent {
  @Input({ required: true }) ctx!: any;
}
