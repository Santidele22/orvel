import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ORVEL_SECTION_PRIMITIVES } from '../../../../shared/dashboard-section-primitives/zen-section-primitives';

@Component({
  selector: 'app-configuracion-theme-zen',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './configuracion-zen-theme.component.html'
})
export class ConfiguracionZenThemeComponent {
  @Input({ required: true }) ctx!: any;

  readonly ui = ORVEL_SECTION_PRIMITIVES;

  get loading() { return this.ctx.loading; }
  get loadError() { return this.ctx.loadError; }
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
  get teamProfessionals() { return this.ctx.teamProfessionals; }
  get teamServices() { return this.ctx.teamServices; }
  get teamDraftName() { return this.ctx.teamDraftName; }
  get teamSaving() { return this.ctx.teamSaving; }
  get teamWeekdays() { return this.ctx.teamWeekdays; }
  get expandedTeamId() { return this.ctx.expandedTeamId; }
  get editingTeamHoursId() { return this.ctx.editingTeamHoursId; }

  addTeamProfessional(): void { this.ctx.addTeamProfessional(); }
  saveTeamProfessional(professional: unknown): void { this.ctx.saveTeamProfessional(professional); }
  toggleTeamService(professional: unknown, serviceId: string): void { this.ctx.toggleTeamService(professional, serviceId); }
  professionalBookingUrl(slug: string): string { return this.ctx.professionalBookingUrl(slug); }
  copyProfessionalBookingUrl(slug: string): void { void this.ctx.copyProfessionalBookingUrl(slug); }
  hourForDay(professional: unknown, dayOfWeek: number) { return this.ctx.hourForDay(professional, dayOfWeek); }
  saveProfessionalHours(professional: unknown, dayOfWeek: number, patch: unknown): void {
    void this.ctx.saveProfessionalHours(professional, dayOfWeek, patch);
  }
  toggleTeamCard(id: string): void { this.ctx.toggleTeamCard(id); }
  toggleTeamHoursEditor(id: string): void { this.ctx.toggleTeamHoursEditor(id); }
  professionalInitials(name: string): string { return this.ctx.professionalInitials(name); }
  professionalAccent(index: number): string { return this.ctx.professionalAccent(index); }
  serviceSummary(professional: unknown): string { return this.ctx.serviceSummary(professional); }
  hoursSummary(professional: unknown) { return this.ctx.hoursSummary(professional); }
  persistAllowClientProfessionalSelection(enabled: boolean): void {
    this.ctx.persistAllowClientProfessionalSelection(enabled);
  }
  
  publicBookingUrl() { return this.ctx.publicBookingUrl(); }
  hasPublicBookingUrl() { return this.ctx.hasPublicBookingUrl(); }
  copyBookingUrl(): void { this.ctx.copyBookingUrl(); }
  openPublicBookingPortal(event: MouseEvent): void { this.ctx.openPublicBookingPortal(event); }
  planDisplayLabel(): string { return this.ctx.planDisplayLabel(); }

  retryLoadSettings(): void { this.ctx.retryLoadSettings(); }
  onSubmit(): void { this.ctx.onSubmit(); }
  onSelectedBusinessChange(value: string): void { this.ctx.onSelectedBusinessChange(value); }
  openTimePicker(dayKey: any, field: 'start' | 'end' | 'start2' | 'end2'): void { this.ctx.openTimePicker(dayKey, field); }
  formatTo12h(time: string): string { return this.ctx.formatTo12h(time); }
  hasInvalidWorkingHoursRange(dayKey: any): boolean { return this.ctx.hasInvalidWorkingHoursRange(dayKey); }
  hasWorkingDayCut(dayKey: any): boolean { return this.ctx.hasWorkingDayCut(dayKey); }
  addWorkingDayCut(dayKey: any): void { this.ctx.addWorkingDayCut(dayKey); }
  removeWorkingDayCut(dayKey: any): void { this.ctx.removeWorkingDayCut(dayKey); }
  removeWorkingDayInterval(dayKey: any, slot: 1 | 2): void { this.ctx.removeWorkingDayInterval(dayKey, slot); }
  copyHoursToAllDays(): void { this.ctx.copyHoursToAllDays(); }
  setSettingsTab(tab: 'perfil' | 'negocio' | 'equipo'): void { this.ctx.setSettingsTab(tab); }
  openAccountSettingsModal(): void { this.ctx.openAccountSettingsModal(); }
  openAccountCancellationModal(): void { this.ctx.openAccountCancellationModal(); }
}
