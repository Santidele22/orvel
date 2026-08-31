import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal, effect } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { BusinessService } from '../data-access/business.service';
import { BusinessSettings, WeekdayKey, WorkingDayHours } from '../../../models/business.model';
import {
  getVisibleTemplates,
  updateBusinessName,
  type UserBusiness,
  type TemplateOption
} from '../../../core/business/business-template-visibility-rules';
import { ThemeService } from '../../../core/theming/theme.service';
import { ConfiguracionZenThemeComponent } from './themes/configuracion-zen-theme.component';
import { ConfiguracionTimePickerModalComponent } from './components/configuracion-time-picker-modal.component';
import { ORVEL_SECTION_PRIMITIVES } from '../../../shared/dashboard-section-primitives/zen-section-primitives';
import { AuthService } from '../../../services/auth.service';
import { logMutationFailure } from '../../../core/observability/mutation-error-log';
import { validateConfiguracionForm } from './configuracion.validation';
import {
  addClockMinutes,
  persistWorkingHoursRecord,
  workingDayHoursToFormValue,
  workingHoursToFormValue
} from '../data-access/resolve-working-day-intervals';
import { buildPublicBookingUrl } from '../../../core/booking/public-booking-url';
import {
  requestSubscriptionCancellation,
  RequestSubscriptionCancellationError
} from '../../billing/data-access/payments/subscriptions/request-subscription-cancellation.api';

type WeekdayRow = {
  key: WeekdayKey;
  label: string;
};

type WorkingHoursTimeField = 'start' | 'end' | 'start2' | 'end2';

@Component({
  selector: 'app-configuracion-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ConfiguracionZenThemeComponent,
    ConfiguracionTimePickerModalComponent
  ],
  templateUrl: './configuracion.page.html'
})
export class ConfiguracionPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly facade = inject(BusinessService);
  protected readonly themeService = inject(ThemeService);
  protected readonly authService = inject(AuthService);

  readonly settingsForm = this.formBuilder.nonNullable.group({
    businessName: ['', [Validators.required, Validators.maxLength(80)]],
    bufferMinutes: [10, [Validators.required, Validators.min(0)]],
    minNoticeMinutes: [120, [Validators.required, Validators.min(0)]],
    slotIntervalMinutes: [30, [Validators.required, Validators.min(0)]],

    // Visual Identity
    logoUrl: [''],
    coverUrl: [''],
    brandColor: ['#2F7D6B'],

    // Business Identity
    businessType: [''],

    // Contact Info
    whatsapp: [''],
    instagram: [''],
    supportEmail: ['', [Validators.email]],

    // Personal Profile
    firstName: [''],
    lastName: [''],
    phone: [''],

    // Subscription
    plan: ['zen' as string],

    // Booking Policies
    cancelationGracePeriod: [24, [Validators.min(0)]],
    autoConfirm: [true],
    maxAdvanceDays: [90, [Validators.min(1)]],

    // Logistics
    allowMultipleServices: [true],
    cleanupTimeMinutes: [0, [Validators.min(0)]],
    capacity: [1, [Validators.required, Validators.min(1)]], // Employee count for bookings

    // Regional
    weekStartDay: ['monday' as 'monday' | 'sunday'],
    timeFormat: ['12h' as '12h' | '24h'],

    workingHours: this.formBuilder.nonNullable.group({
      monday: this.createDayGroup({ enabled: true, start: '09:00', end: '18:00' }),
      tuesday: this.createDayGroup({ enabled: true, start: '09:00', end: '18:00' }),
      wednesday: this.createDayGroup({ enabled: true, start: '09:00', end: '18:00' }),
      thursday: this.createDayGroup({ enabled: true, start: '09:00', end: '18:00' }),
      friday: this.createDayGroup({ enabled: true, start: '09:00', end: '18:00' }),
      saturday: this.createDayGroup({ enabled: true, start: '10:00', end: '14:00' }),
      sunday: this.createDayGroup({ enabled: false, start: '00:00', end: '00:00' })
    })
  });

  readonly publicBookingUrl = computed(() => {
    const slug = this.publicBookingSlug();
    if (!slug) {
      return 'Link de reservas no disponible';
    }

    return buildPublicBookingUrl(slug);
  });

  readonly hasPublicBookingUrl = computed(() => Boolean(this.publicBookingSlug()));

  readonly urlCopied = signal(false);
  readonly urlCopyFailed = signal(false);
  private hydratedUserId: string | null = null;

  constructor() {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => {
        const tab = params.get('tab');
        if (tab === 'perfil' || tab === 'negocio') {
          this.activeSettingsTab.set(tab);
        }
      });

    effect(() => {
      const userId = this.authService.user()?.id;
      if (userId) {
        void this.hydrateBusinessSettings(userId);
      }
    });
  }
  async copyBookingUrl(): Promise<void> {
    this.urlCopyFailed.set(false);
    if (!this.hasPublicBookingUrl() || !navigator.clipboard?.writeText) {
      this.urlCopyFailed.set(true);
      return;
    }

    try {
      await navigator.clipboard.writeText(this.publicBookingUrl());
      this.urlCopied.set(true);
      setTimeout(() => this.urlCopied.set(false), 2000);
    } catch {
      this.urlCopied.set(false);
      this.urlCopyFailed.set(true);
    }
  }

  openPublicBookingPortal(event: MouseEvent): void {
    if (!this.hasPublicBookingUrl()) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  private publicBookingSlug(): string {
    const slug = this.savedState()?.slug?.trim() || this.facade.settings()?.slug?.trim() || '';
    return slug && slug !== 'id-pendiente' ? slug : '';
  }

  get isZen() { return this.themeService.activeTheme() === 'zen'; }
  get isIndustrial() { return false; }
  get isChic() { return false; }
  get isInk() { return false; }

  protected readonly Number = Number;
  protected readonly Math = Math;
  readonly viewModel = this;

  planDisplayLabel(): string {
    return this.normalizePlanDisplay(this.settingsForm.controls.plan.value);
  }

  private normalizePlanDisplay(plan: unknown): string {
    const normalized = String(plan ?? '').trim().toUpperCase();
    if (normalized === 'FREE') {
      return 'Free';
    }

    return normalized ? normalized.charAt(0) + normalized.slice(1).toLowerCase() : 'Free';
  }

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly formMessage = signal('');
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly savedState = signal<BusinessSettings | null>(null);
  readonly ui = ORVEL_SECTION_PRIMITIVES;
  readonly settingsTabs = [
    { key: 'perfil', label: 'Perfil', icon: 'ri-user-line' },
    { key: 'negocio', label: 'Negocio', icon: 'ri-store-2-line' }
  ] as const;
  readonly activeSettingsTab = signal<'perfil' | 'negocio'>('perfil');

  // Time Picker Modal State
  readonly isTimePickerOpen = signal(false);
  readonly editingDay = signal<WeekdayKey | null>(null);
  protected editingField = signal<WorkingHoursTimeField | null>(null);
  readonly selectedAmPm = signal<'AM' | 'PM'>('AM');
  readonly selectedHour = signal<number>(9);
  readonly selectedMinute = signal<number>(0);
  readonly isAccountSettingsModalOpen = signal(false);
  readonly isAccountCancellationModalOpen = signal(false);
  readonly isSettingsSavedModalOpen = signal(false);
  readonly isResetSent = signal(false);
  readonly resetError = signal<string | null>(null);
  readonly accountCancellationError = signal<string | null>(null);
  readonly accountCancellationMessage = signal<string | null>(null);
  readonly accountCancellationSubmitted = signal(false);
  readonly attemptedSubmit = signal(false);

  // Mock user businesses - in real app would come from auth service
  // Real user businesses derived from current session
  readonly userBusinesses = computed<UserBusiness[]>(() => {
    const user = this.authService.user();
    if (!user) return [];
    return [{ id: user.id || 'default', name: user.negocioNombre?.trim() || 'Sucursal sin nombre' }];
  });

  // Mock templates - in real app would come from template service
  readonly allTemplates = computed<TemplateOption[]>(() => {
    const user = this.authService.user();
    if (!user) return [];
    return [{ id: `tpl-${user.tipoNegocio}`, businessId: user.id, label: `Template: ${user.tipoNegocio}` }];
  });

  // Selected business ID for template visibility
  readonly selectedBusinessId = computed<string | null>(() => this.authService.user()?.id || null);

  // Computed: whether user has multiple businesses
  readonly hasMultipleBusinesses = computed(() => this.userBusinesses().length > 1);

  // Computed: visible templates based on selected business
  readonly visibleTemplates = computed(() =>
    getVisibleTemplates({
      userBusinesses: this.userBusinesses(),
      selectedBusinessId: this.selectedBusinessId(),
      templates: this.allTemplates()
    })
  );

  // Computed: visible business name from saved state
  readonly visibleBusinessName = computed(
    () => this.savedState()?.businessName || ''
  );

  onSelectedBusinessChange(businessId: string): void {
    // Only handling single business for now via Auth token
  }

  setSettingsTab(tab: 'perfil' | 'negocio'): void {
    this.activeSettingsTab.set(tab);
  }

  openAccountSettingsModal(): void {
    this.isAccountSettingsModalOpen.set(true);
  }

  cancelAccountSettingsModal(): void {
    this.isAccountSettingsModalOpen.set(false);
    // Reset secondary states after animation
    setTimeout(() => {
      this.isResetSent.set(false);
      this.resetError.set(null);
    }, 300);
  }

  openAccountCancellationModal(): void {
    this.accountCancellationError.set(null);
    this.accountCancellationMessage.set(null);
    this.accountCancellationSubmitted.set(false);
    this.isAccountCancellationModalOpen.set(true);
  }

  cancelAccountCancellationModal(): void {
    this.isAccountCancellationModalOpen.set(false);
    setTimeout(() => {
      this.accountCancellationError.set(null);
      this.accountCancellationMessage.set(null);
      this.accountCancellationSubmitted.set(false);
    }, 300);
  }

  closeSettingsSavedModal(): void {
    this.isSettingsSavedModalOpen.set(false);
  }

  async confirmAccountCancellation(): Promise<void> {
    const user = this.authService.user();
    if (!user) {
      this.accountCancellationError.set('No se encontró sesión de usuario. Volvé a iniciar sesión.');
      return;
    }

    this.loading.set(true);
    this.accountCancellationError.set(null);
    this.accountCancellationMessage.set(null);

    try {
      const activeBusinessId = await this.facade.getActiveBusinessId(user.id);
      if (!activeBusinessId) {
        this.accountCancellationError.set('No pudimos identificar tu negocio activo. Reintentá en unos segundos.');
        return;
      }

      const result = await requestSubscriptionCancellation({
        businessId: activeBusinessId,
        reason: 'manual_request',
        mode: 'account_cancellation'
      });

      this.accountCancellationSubmitted.set(true);
      this.accountCancellationMessage.set(
        result.accountClosureAt
          ? `Listo. Registramos tu pedido de baja. Santi la procesa a mano. Tu cuenta queda activa hasta ${this.formatAccountClosureDate(result.accountClosureAt)}.`
          : result.message
      );
    } catch (error) {
      this.accountCancellationError.set(
        error instanceof RequestSubscriptionCancellationError
          ? error.message
          : 'No pudimos solicitar la baja de la cuenta. Contactá soporte.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  async sendPasswordResetEmail(): Promise<void> {
    const user = this.authService.user();
    if (!user?.email) return;

    this.loading.set(true);
    this.resetError.set(null);

    const result = await this.authService.requestPasswordReset(user.email);
    
    this.loading.set(false);
    if (result.success) {
      this.isResetSent.set(true);
    } else {
      this.resetError.set(result.error || 'Ocurrió un error inesperado');
    }
  }

  saveAccountSettingsFromModal(): void {
    this.sendPasswordResetEmail();
  }

  private formatAccountClosureDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'el final del período pago';
    }

    return new Intl.DateTimeFormat('es-AR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    }).format(date);
  }

  resetAccountSettingsDraft(): void {
    this.settingsForm.reset();
  }

  restoreSavedAccountSettings(): void {
    const saved = this.savedState();
    if (!saved) {
      return;
    }

    this.settingsForm.patchValue({
      businessName: saved.businessName,
      businessType: saved.businessType ?? '',
      bufferMinutes: saved.bufferMinutes,
      minNoticeMinutes: saved.minNoticeMinutes,
      slotIntervalMinutes: saved.slotIntervalMinutes,
      workingHours: workingHoursToFormValue(saved.workingHours),
      firstName: saved.firstName,
      lastName: saved.lastName,
      phone: saved.phone,
      whatsapp: saved.whatsapp,
      instagram: saved.instagram,
      supportEmail: saved.supportEmail,
      plan: saved.plan,
      capacity: saved.capacity ?? 1
    });
  }

  revertAccountSettingsDraft(): void {
    this.restoreSavedAccountSettings();
  }

  openTimePicker(dayKey: WeekdayKey, field: 'start' | 'end' | 'start2' | 'end2'): void {
    const currentVal = this.settingsForm.get(`workingHours.${dayKey}.${field}`)?.value as string;
    if (currentVal) {
      const [h, m] = currentVal.split(':').map(Number);
      this.selectedAmPm.set(h >= 12 ? 'PM' : 'AM');
      const displayHour = h % 12 || 12;
      this.selectedHour.set(displayHour);
      this.selectedMinute.set(m);
    }
    
    this.editingDay.set(dayKey);
    this.editingField.set(field);
    this.isTimePickerOpen.set(true);
  }

  confirmTimeChange(): void {
    const day = this.editingDay();
    const field = this.editingField();
    if (!day || !field) return;

    let h = Math.max(1, Math.min(12, Number(this.selectedHour())));
    const m = Math.max(0, Math.min(59, Number(this.selectedMinute())));
    const ampm = this.selectedAmPm();

    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;

    const formattedTime = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    this.settingsForm.get(`workingHours.${day}.${field}`)?.setValue(formattedTime);
    this.markWorkingDayInteracted(day);
    this.closeTimePicker();
  }

  closeTimePicker(): void {
    this.isTimePickerOpen.set(false);
    this.editingDay.set(null);
    this.editingField.set(null);
  }

  formatTo12h(time: string): string {
    if (!time) return '--:--';
    const [h, m] = time.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 || 12;
    return `${displayHour}:${m.toString().padStart(2, '0')} ${ampm}`;
  }

  hasInvalidWorkingHoursRange(dayKey: WeekdayKey): boolean {
    const control = this.settingsForm.get(`workingHours.${dayKey}`);
    return Boolean(control?.hasError('invalidRange') && (control.touched || control.dirty || this.attemptedSubmit()));
  }

  readonly weekdayRows: WeekdayRow[] = [
    { key: 'monday', label: 'Monday / Lunes' },
    { key: 'tuesday', label: 'Tuesday / Martes' },
    { key: 'wednesday', label: 'Wednesday / Miércoles' },
    { key: 'thursday', label: 'Thursday / Jueves' },
    { key: 'friday', label: 'Friday / Viernes' },
    { key: 'saturday', label: 'Saturday / Sábado' },
    { key: 'sunday', label: 'Sunday / Domingo' }
  ];


  readonly hasSavedData = computed(() => this.savedState() !== null);

  get controls() {
    return this.settingsForm.controls;
  }

  async ngOnInit(): Promise<void> {
    await this.loadDefaults();
  }

  async onSubmit(): Promise<void> {
    this.attemptedSubmit.set(true);
    this.formMessage.set('');
    this.fieldErrors.set({});
    const user = this.authService.user();
    if (!user) {
      this.formMessage.set('No se encontró sesión de usuario.');
      return;
    }

    const validation = validateConfiguracionForm(this.settingsForm.getRawValue());
    if (!validation.isValid) {
      this.fieldErrors.set(validation.fieldErrors);
      this.settingsForm.markAllAsTouched();
      this.formMessage.set('Formulario inválido. Revisa los campos marcados.');
      return;
    }

    if (this.settingsForm.invalid) {
      this.settingsForm.markAllAsTouched();
      const invalidFields = Object.keys(this.controls).filter(key => this.controls[key as keyof typeof this.controls].invalid);
      this.formMessage.set(`Formulario inválido. Revisa: ${invalidFields.join(', ')}`);
      return;
    }

    const values = this.settingsForm.getRawValue();

    if (values.bufferMinutes < 0 || values.minNoticeMinutes < 0 || values.slotIntervalMinutes < 0) {
      this.controls.bufferMinutes.setErrors({ invalid: true });
      this.controls.minNoticeMinutes.setErrors({ invalid: true });
      this.controls.slotIntervalMinutes.setErrors({ invalid: true });
      this.formMessage.set('Los minutos no pueden ser negativos.');
      return;
    }

    let activeBusinessId: string | undefined;
    try {
      this.loading.set(true);
      activeBusinessId = await this.facade.getActiveBusinessId(user.id);
      if (!activeBusinessId) {
        this.formMessage.set('No se pudo identificar el negocio activo. Volvé a intentar en unos segundos.');
        return;
      }

      await this.facade.save(activeBusinessId, {
        businessName: values.businessName.trim(),
        bufferMinutes: values.bufferMinutes,
        minNoticeMinutes: values.minNoticeMinutes,
        slotIntervalMinutes: values.slotIntervalMinutes,
        workingHours: persistWorkingHoursRecord(values.workingHours),
        supportEmail: values.supportEmail,
        businessType: values.businessType,
        plan: values.plan,
        cancelationGracePeriod: values.cancelationGracePeriod,
        autoConfirm: values.autoConfirm,
        maxAdvanceDays: values.maxAdvanceDays,
        capacity: values.capacity,
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone
      });

      this.savedState.set(this.facade.getSnapshot());
      this.settingsForm.markAsPristine();
      this.formMessage.set('Configuración guardada exitosamente.');
      this.isSettingsSavedModalOpen.set(true);
    } catch (error) {
      this.formMessage.set('No se pudo guardar la configuración. Revisá tu conexión e intentá nuevamente.');
      logMutationFailure({
        operation: 'business_settings.update',
        error,
        ids: { businessId: activeBusinessId }
      });
    } finally {
      this.loading.set(false);
    }
  }

  hasWorkingDayCut(dayKey: WeekdayKey): boolean {
    const start2 = this.settingsForm.get(`workingHours.${dayKey}.start2`)?.value as string | undefined;
    const end2 = this.settingsForm.get(`workingHours.${dayKey}.end2`)?.value as string | undefined;
    return Boolean(start2 && end2);
  }

  addWorkingDayCut(dayKey: WeekdayKey): void {
    const group = this.settingsForm.get(`workingHours.${dayKey}`);
    if (!group || this.hasWorkingDayCut(dayKey) || !group.get('enabled')?.value) {
      return;
    }

    const end = String(group.get('end')?.value ?? '18:00');
    group.get('start2')?.setValue(end);
    group.get('end2')?.setValue(addClockMinutes(end, 240));
    this.markWorkingDayInteracted(dayKey);
  }

  removeWorkingDayCut(dayKey: WeekdayKey): void {
    const group = this.settingsForm.get(`workingHours.${dayKey}`);
    if (!group) {
      return;
    }

    group.get('start2')?.setValue('');
    group.get('end2')?.setValue('');
    this.markWorkingDayInteracted(dayKey);
  }

  private createDayGroup(day: WorkingDayHours) {
    const formDay = workingDayHoursToFormValue(day);
    const group = this.formBuilder.nonNullable.group({
      enabled: [formDay.enabled],
      start: [formDay.start, [Validators.required]],
      end: [formDay.end, [Validators.required]],
      start2: [formDay.start2],
      end2: [formDay.end2]
    });

    // Add cross-field validator for start < end
    group.addValidators((control) => {
      const g = control as FormGroup;
      const enabled = g.get('enabled')?.value;
      
      // If day is disabled, the range doesn't matter for validation purposes
      if (!enabled) return null;

      const start = g.get('start')?.value;
      const end = g.get('end')?.value;
      
      if (!start || !end) return null;
      
      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = end.split(':').map(Number);
      const startMinutes = sh * 60 + sm;
      const endMinutes = eh * 60 + em;
      const start2 = g.get('start2')?.value as string | undefined;
      const end2 = g.get('end2')?.value as string | undefined;

      if (!start2 || !end2) {
        return startMinutes < endMinutes ? null : { invalidRange: true };
      }

      const [sh2, sm2] = start2.split(':').map(Number);
      const [eh2, em2] = end2.split(':').map(Number);
      const start2Minutes = sh2 * 60 + sm2;
      const end2Minutes = eh2 * 60 + em2;

      if (!(startMinutes < endMinutes) || !(start2Minutes < end2Minutes) || start2Minutes < endMinutes) {
        return { invalidRange: true };
      }

      return null;
    });

    return group;
  }

  private markWorkingDayInteracted(dayKey: WeekdayKey): void {
    const dayGroup = this.settingsForm.get(`workingHours.${dayKey}`);
    dayGroup?.markAsDirty();
    dayGroup?.markAsTouched();
    dayGroup?.updateValueAndValidity({ onlySelf: true });
  }

  private async loadDefaults(): Promise<void> {
    const user = this.authService.user();
    if (user) {
      await this.hydrateBusinessSettings(user.id);
      return;
    }

    this.patchDefaultSettings();
    this.loading.set(false);
  }

  retryLoadSettings(): void {
    this.hydratedUserId = null;
    this.facade.clearHydration();
    this.loadError.set(null);
    const userId = this.authService.user()?.id;
    if (userId) {
      void this.hydrateBusinessSettings(userId);
    }
  }

  private async hydrateBusinessSettings(userId: string): Promise<void> {
    if (this.facade.hasHydratedSnapshot(userId) && !this.loadError()) {
      const cached = this.facade.getSnapshot();
      if (cached) {
        this.patchHydratedSettings(cached);
        this.savedState.set(cached);
      }
      this.loading.set(false);
      return;
    }

    this.hydratedUserId = userId;
    this.loadError.set(null);

    try {
      this.loading.set(true);
      const activeBusinessId = await this.facade.getActiveBusinessId(userId);
      await this.facade.loadFromSupabase(activeBusinessId);
      const persistenceError = this.facade.lastPersistenceError();
      if (persistenceError) {
        this.loadError.set(persistenceError);
        this.savedState.set(null);
        this.loading.set(false);
        return;
      }
    } catch (error) {
      this.loadError.set(
        error instanceof Error && error.message
          ? error.message
          : 'No pudimos cargar la configuración'
      );
      this.savedState.set(null);
      this.loading.set(false);
      return;
    }

    const saved = this.facade.getSnapshot();

    if (saved) {
      this.patchHydratedSettings(saved);
      this.savedState.set(saved);
    } else {
      this.loadError.set('No pudimos cargar la configuración');
      this.savedState.set(null);
    }

    this.loading.set(false);
  }

  private patchHydratedSettings(saved: BusinessSettings): void {
    this.settingsForm.patchValue({
      ...saved,
      workingHours: workingHoursToFormValue(saved.workingHours)
    } as never);
  }

  private patchDefaultSettings(): void {
    const user = this.authService.user();
    const defaultHours = this.facade.getDefaultWorkingHours();

    // Prioridad: Metadatos reales del usuario desde el registro (Día 0)
    console.log('[Configuracion] No saved settings, using defaults');
    this.settingsForm.patchValue({
      businessName: user?.negocioNombre?.trim() ?? '',
      businessType: user?.tipoNegocio ?? '',
      firstName: user?.nombre ?? '',
      lastName: user?.apellido ?? '',
      phone: user?.telefono ?? '',
      plan: user?.plan || 'free',
      bufferMinutes: 15,
      minNoticeMinutes: 120,
      slotIntervalMinutes: 30,
      capacity: 1,
      workingHours: defaultHours
    } as any);
  }
}
