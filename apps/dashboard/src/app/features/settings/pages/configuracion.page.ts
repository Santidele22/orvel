import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal, effect } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { BusinessService } from '../data-access/business.service';
import type { BusinessSettingsState } from '../data-access/business-settings.facade';
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
import { validateConfiguracionForm } from './configuracion.validation';

type WeekdayRow = {
  key: WeekdayKey;
  label: string;
};

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

    // Contact Info
    whatsapp: [''],
    instagram: [''],
    supportEmail: ['', [Validators.email]],

    // Personal Profile
    firstName: ['', [Validators.required]],
    lastName: ['', [Validators.required]],
    phone: [''],

    // Subscription
    plan: ['zen' as 'basic' | 'zen' | 'pro'],

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

  // DB-FIX-007: Public Booking Link (Dynamic Slug via Signals)
  private readonly businessNameValue = toSignal(this.settingsForm.controls.businessName.valueChanges, {
    initialValue: this.settingsForm.controls.businessName.value
  });

  readonly publicBookingUrl = computed(() => {
    const bizName = this.businessNameValue() || this.settingsForm.controls.businessName.value || 'mi-salon';
    const slug = bizName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return `${window.location.origin}/booking/${slug}`;
  });

  readonly urlCopied = signal(false);

  copyBookingUrl(): void {
    navigator.clipboard.writeText(this.publicBookingUrl());
    this.urlCopied.set(true);
    setTimeout(() => this.urlCopied.set(false), 2000);
  }

  get isZen() { return this.themeService.activeTheme() === 'zen'; }
  get isIndustrial() { return false; }
  get isChic() { return false; }
  get isInk() { return false; }

  protected readonly Number = Number;
  protected readonly Math = Math;
  readonly viewModel = this;

  readonly loading = signal(true);
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
  protected editingField = signal<'start' | 'end' | null>(null);
  readonly selectedAmPm = signal<'AM' | 'PM'>('AM');
  readonly selectedHour = signal<number>(9);
  readonly selectedMinute = signal<number>(0);
  readonly isAccountSettingsModalOpen = signal(false);
  readonly isResetSent = signal(false);
  readonly resetError = signal<string | null>(null);

  // Mock user businesses - in real app would come from auth service
  // Real user businesses derived from current session
  readonly userBusinesses = computed<UserBusiness[]>(() => {
    const user = this.authService.user();
    if (!user) return [];
    return [{ id: user.id || 'default', name: user.negocioNombre || 'Mi Negocio' }];
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
      bufferMinutes: saved.bufferMinutes,
      minNoticeMinutes: saved.minNoticeMinutes,
      slotIntervalMinutes: saved.slotIntervalMinutes,
      workingHours: saved.workingHours,
      firstName: saved.firstName,
      lastName: saved.lastName,
      phone: saved.phone,
      capacity: saved.capacity ?? 1
    });
  }

  revertAccountSettingsDraft(): void {
    this.restoreSavedAccountSettings();
  }

  openTimePicker(dayKey: WeekdayKey, field: 'start' | 'end'): void {
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

    try {
      this.loading.set(true);
      const result = await this.facade.saveToSupabase(user.id, {
        businessName: values.businessName.trim(),
        bufferMinutes: values.bufferMinutes,
        minNoticeMinutes: values.minNoticeMinutes,
        slotIntervalMinutes: values.slotIntervalMinutes,
        workingHours: values.workingHours,
        logoUrl: values.logoUrl,
        coverUrl: values.coverUrl,
        brandColor: values.brandColor,
        whatsapp: values.whatsapp,
        instagram: values.instagram,
        supportEmail: values.supportEmail,
        plan: values.plan,
        cancelationGracePeriod: values.cancelationGracePeriod,
        autoConfirm: values.autoConfirm,
        maxAdvanceDays: values.maxAdvanceDays,
        allowMultipleServices: values.allowMultipleServices,
        cleanupTimeMinutes: values.cleanupTimeMinutes,
        capacity: values.capacity,
        weekStartDay: values.weekStartDay,
        timeFormat: values.timeFormat,
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone,
        slug: values.businessName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      });

      this.savedState.set(this.facade.getSnapshot());
      
      if (result.source.includes('error')) {
        this.formMessage.set(`Hubo un problema al guardar parte de la configuración (${result.source}). Los cambios locales se mantienen.`);
      } else {
        this.formMessage.set('Configuración guardada exitosamente.');
      }
    } catch (error) {
      this.formMessage.set('Error al guardar en el servidor. Intente de nuevo.');
      console.error('Error saving settings:', error);
    } finally {
      this.loading.set(false);
    }
  }

  private createDayGroup(day: WorkingDayHours) {
    const group = this.formBuilder.nonNullable.group({
      enabled: [day.enabled],
      start: [day.start, [Validators.required]],
      end: [day.end, [Validators.required]]
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
      
      return startMinutes < endMinutes ? null : { invalidRange: true };
    });

    return group;
  }

  private async loadDefaults(): Promise<void> {
    // Si la sesión no está lista, esperar un momento (evita carrera crítica)
    if (!this.authService.user()) {
       await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    const user = this.authService.user();
    if (user) {
      try {
        await this.facade.loadFromSupabase(user.id);
      } catch (error) {
        console.error('Error loading settings from Supabase:', error);
      }
    }

    const saved = this.facade.getSnapshot();
    const defaultHours = this.facade.getDefaultWorkingHours();

    if (saved && saved.slug && saved.slug !== 'id-pendiente') {
      console.log('[Configuracion] Patching form with saved settings:', saved.businessName);
      this.settingsForm.patchValue(saved);
      this.savedState.set(saved);
    } else {
      // Prioridad: Metadatos reales del usuario desde el registro (Día 0)
      console.log('[Configuracion] No saved settings, using defaults');
      const bizName = user?.negocioNombre || 'Mi Negocio';
      
      this.settingsForm.patchValue({
        businessName: bizName,
        bufferMinutes: 15,
        minNoticeMinutes: 120,
        slotIntervalMinutes: 30,
        capacity: 1,
        workingHours: defaultHours
      } as any);
      this.savedState.set(null);
    }
    
    this.loading.set(false);
  }
}
