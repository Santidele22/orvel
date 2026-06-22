import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { ORVEL_SECTION_PRIMITIVES } from '../../../../shared/dashboard-section-primitives/zen-section-primitives';

@Component({
  selector: 'app-configuracion-theme-zen',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './configuracion-zen-theme.component.html'
})
export class ConfiguracionZenThemeComponent {
  @Input({ required: true }) ctx!: any;

  readonly ui = ORVEL_SECTION_PRIMITIVES;

  get loading() { return this.ctx.loading; }
  get settingsForm() { return this.ctx.settingsForm; }
  get formMessage() { return this.ctx.formMessage; }
  get fieldErrors() { return this.ctx.fieldErrors; }
  get weekdayRows() { return this.ctx.weekdayRows; }
  get hasMultipleBusinesses() { return this.ctx.hasMultipleBusinesses; }
  get userBusinesses() { return this.ctx.userBusinesses; }
  get selectedBusinessId() { return this.ctx.selectedBusinessId; }
  get visibleTemplates() { return this.ctx.visibleTemplates; }
  get activeSettingsTab() { return this.ctx.activeSettingsTab; }
  get settingsTabs() { return this.ctx.settingsTabs; }
  get urlCopied() { return this.ctx.urlCopied; }
  get urlCopyFailed() { return this.ctx.urlCopyFailed; }
  
  publicBookingUrl() { return this.ctx.publicBookingUrl(); }
  hasPublicBookingUrl() { return this.ctx.hasPublicBookingUrl(); }
  copyBookingUrl(): void { this.ctx.copyBookingUrl(); }
  openPublicBookingPortal(event: MouseEvent): void { this.ctx.openPublicBookingPortal(event); }
  planDisplayLabel(): string { return this.ctx.planDisplayLabel(); }

  onSubmit(): void { this.ctx.onSubmit(); }
  onSelectedBusinessChange(value: string): void { this.ctx.onSelectedBusinessChange(value); }
  openTimePicker(dayKey: any, field: 'start' | 'end'): void { this.ctx.openTimePicker(dayKey, field); }
  formatTo12h(time: string): string { return this.ctx.formatTo12h(time); }
  hasInvalidWorkingHoursRange(dayKey: any): boolean { return this.ctx.hasInvalidWorkingHoursRange(dayKey); }
  setSettingsTab(tab: 'perfil' | 'negocio'): void { this.ctx.setSettingsTab(tab); }
  openAccountSettingsModal(): void { this.ctx.openAccountSettingsModal(); }
}
