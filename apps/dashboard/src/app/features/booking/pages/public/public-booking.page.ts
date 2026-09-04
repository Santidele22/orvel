import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { BusinessService } from '../../../settings/data-access/business.service';
import { PublicBookingService } from '@orvel/booking/application';
import { ServicioService } from '../../../servicios/data-access/servicio.service';
import { validatePublicBookingForm } from './public-booking.validation';
import type { PublicSlot } from '@orvel/booking';
import type { WeekdayKey, WorkingDayHours } from '../../../../models/business.model';
import { DEFAULT_BUSINESS_TIMEZONE, buildPublicBookingDays, filterBookablePublicDays, getWeekdayKeyFromLocalCivilDate, toLocalCivilDate, type DayAvailability } from './public-booking-days';
import { emitPublicBookingFailureEvent } from '../../../../core/observability/public-booking-operational-events';
import { logMutationFailure } from '../../../../core/observability/mutation-error-log';
import { getPublicBookingSubmitErrorMessage, logPublicBookingSubmitFailure } from './public-booking-error-messages';
import {
  buildServiceDepositQuote,
  formatBusinessDepositRequiredBanner,
  formatDepositHoldExpiry,
  formatDepositMoney,
  formatServiceDepositPreview,
  readPublicDepositHold,
  type PublicDepositHoldView,
  type ServiceDepositQuote
} from './public-booking-deposit-hold';

type ReschedulePreload = {
  mode: 'reschedule';
  token: string;
};

@Component({
  selector: 'app-public-booking-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './public-booking.page.html'
})
export class PublicBookingPage implements OnInit {
  private readonly servicioService = inject(ServicioService);
  private readonly businessService = inject(BusinessService);
  private readonly publicBookingService = inject(PublicBookingService);
  private readonly route = inject(ActivatedRoute);

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly loadingSlots = signal(false);
  protected readonly loadingAvailability = signal(false);
  protected readonly businessName = signal('');
  protected readonly bookingConfirmed = signal(false);
  protected readonly bookingAwaitingApproval = signal(false);
  protected readonly depositHold = signal<PublicDepositHoldView | null>(null);
  protected readonly errorMessage = signal('');
  protected readonly availabilityErrorMessage = signal('');
  protected readonly serviceErrorMessage = signal('');
  
  protected readonly publicServices = signal<Array<{ id: string; name: string; price: number; duration: number }>>([]);
  protected readonly depositEnabled = signal(false);
  protected readonly depositPercent = signal(0);
  protected readonly expandedStep = signal<'service' | 'professional' | 'schedule' | 'contact'>('service');
  protected readonly selectedServiceId = signal<string>('');
  protected readonly availabilitySlots = signal<Array<Pick<PublicSlot, 'startsAtIso'> & { remainingCapacity: number }>>([]);
  protected readonly resolvedSlug = signal<string>('');
  protected readonly workingHours = signal<Partial<Record<WeekdayKey, WorkingDayHours>> | null>(null);
  protected readonly businessTimezone = signal<string>(DEFAULT_BUSINESS_TIMEZONE);
  protected readonly maxAdvanceDays = signal(30);

  protected readonly availableDays = signal<DayAvailability[]>([]);
  protected readonly bookableDays = computed(() => {
    if (this.loadingAvailability()) return [];
    return filterBookablePublicDays(this.availableDays());
  });
  protected readonly selectedDate = signal<string>(toLocalCivilDate(new Date(), DEFAULT_BUSINESS_TIMEZONE));
  protected readonly resolvedBusinessId = signal<string | null>(null);
  protected readonly rescheduleMode = signal(false);
  protected readonly rescheduleConfirmed = signal(false);
  protected readonly allowClientProfessionalSelection = signal(false);
  protected readonly publicProfessionals = signal<Array<{ id: string; name: string }>>([]);
  protected readonly selectedProfessionalId = signal('');
  protected readonly confirmedProfessionalName = signal('');
  protected readonly lockedProfessionalSlug = signal('');
  protected readonly lockedProfessionalServiceIds = signal<string[]>([]);
  protected readonly showProfessionalPicker = computed(() =>
    !this.lockedProfessionalSlug()
    && this.allowClientProfessionalSelection()
    && this.publicProfessionals().length >= 1
  );
  protected readonly selectedService = computed(() =>
    this.publicServices().find((service) => service.id === this.selectedServiceId()) ?? null
  );
  protected readonly professionalHints = signal<Record<string, string>>({});
  protected readonly professionalChoiceMade = signal(false);

  // Validation errors per field
  protected readonly fieldErrors = signal<Record<string, string>>({});
  
  // Form controls for validation
  protected selectedSlot = '';
  protected firstName = '';
  protected lastName = '';
  protected whatsapp = '';
  protected email = '';
  protected notes = '';
  private rescheduleToken = '';
  private rescheduleTokenLoaded = false;
  private preloadServiceId = '';
  private preloadStartsAtIso = '';

  async ngOnInit(): Promise<void> {
    await this.loadPortal();
  }

  protected async retryPortalLoad(): Promise<void> {
    await this.loadPortal();
  }

  protected serviceDepositPreview(): string | null {
    const service = this.selectedService();
    if (!service || !this.depositEnabled()) {
      return null;
    }
    return formatServiceDepositPreview(service.price, this.depositPercent());
  }

  protected serviceDepositQuote(): ServiceDepositQuote | null {
    const service = this.selectedService();
    if (!service || !this.depositEnabled()) {
      return null;
    }
    return buildServiceDepositQuote(service.name, service.price, this.depositPercent());
  }

  protected formatDepositMoney(amount: number): string {
    return formatDepositMoney(amount);
  }

  protected businessDepositBanner(): string | null {
    if (!this.depositEnabled()) {
      return null;
    }
    return formatBusinessDepositRequiredBanner(this.depositPercent());
  }

  protected depositHoldExpiryLabel(): string {
    const iso = this.depositHold()?.expiresAtIso;
    if (!iso) {
      return '';
    }
    return formatDepositHoldExpiry(iso);
  }

  protected dismissBookingSuccess(): void {
    this.bookingConfirmed.set(false);
    this.bookingAwaitingApproval.set(false);
    this.depositHold.set(null);
  }

  private async loadPortal(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    this.availabilityErrorMessage.set('');
    this.serviceErrorMessage.set('');
    this.bookingConfirmed.set(false);
    this.bookingAwaitingApproval.set(false);
    this.depositHold.set(null);
    this.rescheduleConfirmed.set(false);
    this.publicServices.set([]);
    this.selectedServiceId.set('');
    this.availabilitySlots.set([]);
    this.availableDays.set([]);
    this.resolvedSlug.set('');
    this.resolvedBusinessId.set(null);
    this.businessName.set('');
    this.workingHours.set(null);
    this.maxAdvanceDays.set(30);
    this.depositEnabled.set(false);
    this.depositPercent.set(0);
    this.selectedSlot = '';
    this.allowClientProfessionalSelection.set(false);
    this.publicProfessionals.set([]);
    this.selectedProfessionalId.set('');
    this.confirmedProfessionalName.set('');
    this.lockedProfessionalSlug.set('');
    this.lockedProfessionalServiceIds.set([]);
    this.professionalChoiceMade.set(false);
    this.applyReschedulePreload();

    const slug = this.route.snapshot.paramMap.get('slug') ?? '';
    const professionalSlugParam = this.route.snapshot.paramMap.get('professionalSlug') ?? '';
    const professionalSlug = professionalSlugParam && professionalSlugParam !== slug ? professionalSlugParam : '';
    const response = await this.businessService.resolveBusinessBySlug(slug);

    if (response.data) {
      this.resolvedSlug.set(response.data.slug);
      this.businessName.set(response.data.displayName);
      this.resolvedBusinessId.set(response.data.id);
      this.businessTimezone.set(response.data.timezone || DEFAULT_BUSINESS_TIMEZONE);
      
      this.workingHours.set(response.data.settings.workingHours);
      this.maxAdvanceDays.set(response.data.settings.maxAdvanceDays ?? 30);
      this.depositEnabled.set(response.data.settings.depositEnabled === true);
      this.depositPercent.set(Number(response.data.settings.depositPercent ?? 0));
      this.allowClientProfessionalSelection.set(
        response.data.bookingPolicy?.allowClientProfessionalSelection === true
      );
      if (professionalSlug.trim()) {
        const professional = await this.businessService.resolvePublicProfessional(slug, professionalSlug);
        if (!professional) {
          this.errorMessage.set('No encontramos a ese profesional.');
          this.resolvedBusinessId.set(null);
          this.loading.set(false);
          return;
        }
        this.lockedProfessionalSlug.set(professional.slug);
        this.selectedProfessionalId.set(professional.id);
        this.professionalChoiceMade.set(true);
        this.confirmedProfessionalName.set(professional.name);
        this.lockedProfessionalServiceIds.set(professional.serviceIds);
        this.businessName.set(`${response.data.displayName} · ${professional.name}`);
      }
      this.initAvailableDays();
      if (this.rescheduleMode()) {
        const loaded = await this.loadTokenBackedReschedulePreload(response.data.id);
        if (!loaded) {
          this.loading.set(false);
          return;
        }
      }

      await this.loadServices(response.data.id);
    } else {
      emitPublicBookingFailureEvent({
        stage: 'resolver',
        status: response.status,
        code: response.error?.code ?? 'PUBLIC_RESOLVER_UNAVAILABLE',
        retryable: response.status !== 404 && response.error?.code !== 'BUSINESS_NOT_FOUND'
      });
      this.errorMessage.set(response.error?.code === 'BUSINESS_NOT_FOUND' || response.status === 404
        ? 'Negocio no encontrado.'
        : 'No pudimos cargar el portal de reservas. Intentá nuevamente en unos minutos.');
    }

    this.loading.set(false);
  }

  async loadServices(businessId: string) {
    this.serviceErrorMessage.set('');
    this.publicServices.set([]);
    this.selectedServiceId.set('');
    this.availabilitySlots.set([]);
    this.selectedSlot = '';

    try {
      const services = await firstValueFrom(this.servicioService.getByBusinessId(businessId));
      
      if (services && services.length > 0) {
        // Mapeamos al formato que espera el template (id, name, price, duration)
        const allowedServiceIds = this.lockedProfessionalServiceIds();
        const mapped = services
          .filter((s: any) => this.isPublicServiceActive(s))
          .filter((s: any) => !this.lockedProfessionalSlug() || allowedServiceIds.includes(s.id))
          .map((s: any) => ({
            id: s.id,
            name: s.nombre || s.name || 'Servicio sin nombre',
            price: s.precio || s.price || 0,
            duration: s.duration_minutes || s.duration || 30
          }));

        if (mapped.length === 0) {
          this.serviceErrorMessage.set('No hay servicios disponibles para reservar en este momento.');
          return;
        }

        this.publicServices.set(mapped);
        const preloadService = this.preloadServiceId && mapped.some((service) => service.id === this.preloadServiceId)
          ? this.preloadServiceId
          : mapped[0].id;
        this.selectedServiceId.set(preloadService);
        if (this.preloadStartsAtIso) {
          this.selectedDate.set(this.preloadStartsAtIso.split('T')[0]);
        }
        await this.loadProfessionalsForSelectedService();
        if (this.canShowScheduleStep()) {
          await this.loadAvailability();
        }
      } else {
        this.serviceErrorMessage.set('No hay servicios disponibles para reservar en este momento.');
      }
    } catch (error) {
      emitPublicBookingFailureEvent({ stage: 'service', code: 'SERVICE_LOAD_FAILED', status: 503 });
      this.serviceErrorMessage.set('No pudimos cargar los servicios disponibles. Intentá nuevamente.');
    }
  }

  protected async retryLoadServices(): Promise<void> {
    const businessId = this.resolvedBusinessId();
    if (!businessId) return;

    await this.loadServices(businessId);
  }

  async onServiceChange() {
    this.selectedSlot = '';
    this.loadingAvailability.set(true);
    if (!this.lockedProfessionalSlug()) {
      this.selectedProfessionalId.set('');
      this.professionalChoiceMade.set(false);
    }
    await this.loadProfessionalsForSelectedService();
    if (this.canShowScheduleStep()) {
      await this.loadAvailability();
    } else {
      this.availabilitySlots.set([]);
      this.loadingAvailability.set(false);
    }
    this.expandedStep.set(this.canShowProfessionalStep() ? 'professional' : 'schedule');
  }

  protected async onProfessionalChange(professionalId: string): Promise<void> {
    this.selectedProfessionalId.set(professionalId);
    this.professionalChoiceMade.set(true);
    this.selectedSlot = '';
    this.loadingAvailability.set(true);
    await this.loadAvailability();
    this.expandedStep.set('schedule');
  }

  protected onSlotChange(): void {
    if (this.selectedSlot) {
      this.expandedStep.set('contact');
    }
  }

  protected openStep(step: 'service' | 'professional' | 'schedule' | 'contact'): void {
    this.expandedStep.set(step);
  }

  protected isStepOpen(step: 'service' | 'professional' | 'schedule' | 'contact'): boolean {
    return this.expandedStep() === step;
  }

  protected selectedProfessionalLabel(): string {
    const id = this.selectedProfessionalId();
    if (!id) {
      return 'Cualquier profesional';
    }
    return this.publicProfessionals().find((professional) => professional.id === id)?.name ?? 'Profesional';
  }

  protected selectedScheduleLabel(): string {
    const date = this.selectedDate();
    const slot = this.selectedSlot;
    if (!date || !slot) {
      return 'Elegí día y horario';
    }
    const day = this.bookableDays().find((item) => item.date === date);
    const time = this.formatSlot(slot).split(' - ')[1] || this.formatSlot(slot);
    return `${day?.weekday ?? date} ${day?.label ?? ''} · ${time}`.trim();
  }

  protected canShowProfessionalStep(): boolean {
    return Boolean(this.selectedServiceId()) && this.showProfessionalPicker();
  }

  protected canShowScheduleStep(): boolean {
    if (!this.selectedServiceId()) return false;
    if (this.showProfessionalPicker() && !this.professionalChoiceMade()) return false;
    return true;
  }

  protected canShowContactStep(): boolean {
    return this.canShowScheduleStep() && Boolean(this.selectedSlot);
  }

  private async loadProfessionalsForSelectedService(): Promise<void> {
    const slug = this.resolvedSlug();
    const serviceId = this.selectedServiceId();
    if (!slug || !serviceId || !this.allowClientProfessionalSelection() || this.lockedProfessionalSlug()) {
      this.publicProfessionals.set([]);
      return;
    }

    const professionals = await this.businessService.listPublicProfessionalsForService(slug, serviceId);
    this.publicProfessionals.set(professionals);
    if (!this.lockedProfessionalSlug()) {
      this.selectedProfessionalId.set('');
      this.professionalChoiceMade.set(false);
    }
    void this.refreshProfessionalHints(professionals);
  }

  private async refreshProfessionalHints(professionals: Array<{ id: string; name: string }>): Promise<void> {
    const serviceId = this.selectedServiceId();
    if (!serviceId || professionals.length === 0) {
      this.professionalHints.set({});
      return;
    }

    const days = this.availableDays().filter((day) => day.isWorkingDay).slice(0, 7);
    const today = toLocalCivilDate(new Date(), this.businessTimezone());
    const hints = await Promise.all(professionals.map(async (professional) => {
      for (const day of days) {
        const response = await this.publicBookingService.queryPublicSlotAvailability(
          this.availabilityQuery(serviceId, day.date, professional.id)
        );
        const slot = response.data?.slots?.find((item) => (item.remainingCapacity ?? 0) > 0);
        if (slot) {
          const time = this.formatSlot(slot.startsAtIso);
          const when = day.date === today ? `hoy ${time}` : `${day.weekday} ${day.label} · ${time}`;
          return [professional.id, `Próximo lugar: ${when}`] as const;
        }
      }
      return [professional.id, 'Sin turnos esta semana'] as const;
    }));

    this.professionalHints.set(Object.fromEntries(hints));
  }

  protected professionalInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  }

  private availabilityQuery(serviceId: string, dateIso: string, professionalId = this.selectedProfessionalId().trim()) {
    return {
      businessSlug: this.resolvedSlug() || this.route.snapshot.paramMap.get('slug') || '',
      serviceId,
      dateIso,
      ...(professionalId ? { professionalId } : {})
    };
  }

  // Trigger availability check when service is selected
  async loadAvailability() {
    const slug = (this.resolvedSlug() || this.route.snapshot.paramMap.get('slug')) ?? '';
    const serviceId = this.selectedServiceId();
    if (!slug || !serviceId) return;

    if (!this.hasSelectedPublicService(serviceId)) {
      this.availabilitySlots.set([]);
      this.updateDayAvailability(this.selectedDate(), false);
      this.selectedSlot = '';
      return;
    }

    this.loadingSlots.set(true);
    this.availabilityErrorMessage.set('');
    const date = this.selectedDate();

    try {
      const response = await this.publicBookingService.queryPublicSlotAvailability(
        this.availabilityQuery(serviceId, date)
      );

      if (!this.isCurrentPublicServiceSelection(serviceId)) {
        return;
      }

      if (response.error || response.status < 200 || response.status >= 300) {
        emitPublicBookingFailureEvent({ stage: 'availability', status: response.status, code: response.error?.code });
        logMutationFailure({
          operation: 'query_public_slot_availability',
          response,
          ids: { businessId: this.resolvedBusinessId() || undefined }
        });
        this.availabilitySlots.set([]);
        this.updateDayAvailability(date, false);
        this.selectedSlot = '';
        this.availabilityErrorMessage.set(
          response.error?.code === 'PUBLIC_TURNERO_DISABLED'
            ? getPublicBookingSubmitErrorMessage(response.error)
            : 'No pudimos consultar los horarios disponibles. Intentá nuevamente.'
        );
        return;
      }

      if (response.data?.slots && response.data.slots.length > 0 && this.isConfiguredWorkingDate(date)) {
        const slots = response.data.slots.map(s => ({
          startsAtIso: s.startsAtIso,
          remainingCapacity: s.remainingCapacity ?? 0
        }));
        this.availabilitySlots.set(slots);
        this.updateDayAvailability(date, true);
        const preloadedSlot = this.preloadStartsAtIso && slots.some(slot => slot.startsAtIso === this.preloadStartsAtIso)
          ? this.preloadStartsAtIso
          : '';
        this.selectedSlot = preloadedSlot || slots[0]?.startsAtIso || '';
      } else {
        // No slots available for this date - clear slots but don't block the dropdown
        this.availabilitySlots.set([]);
        this.updateDayAvailability(date, false);
        this.selectedSlot = '';
      }
    } catch (error) {
      if (!this.isCurrentPublicServiceSelection(serviceId)) {
        return;
      }
      emitPublicBookingFailureEvent({ stage: 'availability', code: 'AVAILABILITY_LOOKUP_FAILED', status: 503 });
      logMutationFailure({
        operation: 'query_public_slot_availability',
        error,
        ids: { businessId: this.resolvedBusinessId() || undefined }
      });
      this.availabilitySlots.set([]);
      this.updateDayAvailability(date, false);
      this.selectedSlot = '';
      this.availabilityErrorMessage.set('No pudimos consultar los horarios disponibles. Intentá nuevamente.');
    } finally {
      this.loadingSlots.set(false);
    }
    
    // Also check days availability in background (don't await - let it run in background)
    this.checkDaysAvailability();
  }

  private isPublicServiceActive(service: Record<string, unknown>): boolean {
    return service['activo'] !== false && service['is_active'] !== false;
  }

  private hasSelectedPublicService(serviceId: string): boolean {
    return this.publicServices().some(service => service.id === serviceId);
  }

  private isCurrentPublicServiceSelection(serviceId: string): boolean {
    return this.selectedServiceId() === serviceId && this.hasSelectedPublicService(serviceId);
  }

  protected async submitBooking(): Promise<void> {
    if (this.rescheduleMode() && (!this.rescheduleToken || !this.rescheduleTokenLoaded)) {
      this.errorMessage.set('No pudimos validar el link de reprogramación. Volvé a abrir el link privado de gestión del turno.');
      this.submitting.set(false);
      return;
    }

    // Validate form before submitting
    if (!this.validateForm()) {
      this.errorMessage.set('Por favor completa todos los campos requeridos.');
      this.submitting.set(false);
      return;
    }

    if (!this.canSubmit()) {
      this.errorMessage.set('Seleccioná un horario disponible antes de confirmar la reserva.');
      this.submitting.set(false);
      return;
    }
    
    this.submitting.set(true);
    this.errorMessage.set('');

    try {
      if (this.rescheduleMode()) {
        const response = await this.publicBookingService.rescheduleBookingByToken(
          this.rescheduleToken,
          new Date().toISOString(),
          this.selectedSlot
        );

        if (response.data?.startsAtIso) {
          this.bookingConfirmed.set(true);
          this.rescheduleConfirmed.set(true);
          this.preloadStartsAtIso = response.data.startsAtIso;
          this.clearTransientRescheduleTokenFromUrl();
          return;
        }

        emitPublicBookingFailureEvent({ stage: 'submit', status: response.status, code: response.error?.code, retryable: true });
        this.errorMessage.set(getPublicBookingSubmitErrorMessage(response.error));
        this.bookingConfirmed.set(false);
        return;
      }

      const selectedProfessionalId = this.selectedProfessionalId().trim();
      const response = await this.publicBookingService.createPublicBooking({
        businessSlug: (this.resolvedSlug() || this.route.snapshot.paramMap.get('slug')) ?? '',
        serviceId: this.selectedServiceId(),
        startsAtIso: this.selectedSlot,
        client: {
          fullName: `${this.firstName.trim()} ${this.lastName.trim()}`,
          email: this.email,
          phone: this.whatsapp
        },
        notes: this.notes,
        ...(selectedProfessionalId ? { professionalId: selectedProfessionalId } : {})
      });

      if (response.data?.status === 'confirmed' || response.data?.status === 'pending') {
        this.bookingConfirmed.set(true);
        this.bookingAwaitingApproval.set(response.data.status === 'pending');
        this.depositHold.set(readPublicDepositHold(response.data));
        this.confirmedProfessionalName.set(
          response.data.professionalName
          || this.publicProfessionals().find((professional) => professional.id === selectedProfessionalId)?.name
          || ''
        );
        window.dispatchEvent(new CustomEvent('booking.created', {
          detail: {
            status: response.data.status,
            startsAtIso: this.selectedSlot
          }
        }));
      } else {
        emitPublicBookingFailureEvent({ stage: 'submit', status: response.status, code: response.error?.code, retryable: true });
        logPublicBookingSubmitFailure({ response });
        this.errorMessage.set(getPublicBookingSubmitErrorMessage(response.error));
        this.bookingConfirmed.set(false);
      }
    } catch (error) {
      emitPublicBookingFailureEvent({ stage: 'submit', status: 503, code: 'PUBLIC_BOOKING_SUBMIT_FAILED', retryable: true });
      logPublicBookingSubmitFailure({ caughtError: error });
      this.errorMessage.set(getPublicBookingSubmitErrorMessage());
      this.bookingConfirmed.set(false);
    } finally {
      this.submitting.set(false);
    }
  }

  private initAvailableDays() {
    const days = buildPublicBookingDays(this.workingHours(), new Date(), this.businessTimezone(), this.maxAdvanceDays() + 1);
    this.availableDays.set(days);
    this.loadingAvailability.set(true);
    const firstWorkingDay = days.find(day => day.isWorkingDay);
    if (firstWorkingDay) {
      this.selectedDate.set(firstWorkingDay.date);
    }
  }

  // Check availability for all days in background (run AFTER days are clickable)
  async checkDaysAvailability() {
    this.loadingAvailability.set(true);
    const serviceId = this.selectedServiceId();
    if (!serviceId) {
      this.loadingAvailability.set(false);
      return;
    }

    if (!this.hasSelectedPublicService(serviceId)) {
      this.availabilitySlots.set([]);
      this.selectedSlot = '';
      this.loadingAvailability.set(false);
      return;
    }

    const slug = this.resolvedSlug();
    if (!slug) {
      this.loadingAvailability.set(false);
      return;
    }

    const days = [...this.availableDays()];
    let failedAvailabilityChecks = false;

    // Parallelize availability checks for performance (Day indicators)
    await Promise.all(days.map(async (day, i) => {
      try {
      const response = await this.publicBookingService.queryPublicSlotAvailability(
        this.availabilityQuery(serviceId, day.date)
      );

        if (!this.isCurrentPublicServiceSelection(serviceId)) {
          return;
        }

        if (response.error || (typeof response.status === 'number' && (response.status < 200 || response.status >= 300))) {
          failedAvailabilityChecks = true;
          emitPublicBookingFailureEvent({ stage: 'availability', status: response.status, code: response.error?.code });
          days[i] = { ...day, hasAvailability: false };
          if (day.date === this.selectedDate()) {
            this.availabilitySlots.set([]);
            this.selectedSlot = '';
          }
          return;
        }

        const isWorkingDay = this.isConfiguredWorkingDate(day.date);
        const hasSlots = isWorkingDay && !!(response.data?.slots && response.data.slots.length > 0);
        days[i] = { ...day, hasAvailability: hasSlots };
        if (day.date === this.selectedDate() && !hasSlots) {
          this.availabilitySlots.set([]);
          this.selectedSlot = '';
        }

      } catch (error) {
        if (!this.isCurrentPublicServiceSelection(serviceId)) {
          return;
        }
        failedAvailabilityChecks = true;
      emitPublicBookingFailureEvent({ stage: 'availability', code: 'AVAILABILITY_LOOKUP_FAILED', status: 503 });
        days[i] = { ...day, hasAvailability: false };
        if (day.date === this.selectedDate()) {
          this.availabilitySlots.set([]);
          this.selectedSlot = '';
        }
      }
    }));

    if (!this.isCurrentPublicServiceSelection(serviceId)) {
      this.loadingAvailability.set(false);
      return;
    }

    this.availableDays.set(days);
    if (failedAvailabilityChecks) {
      this.availabilityErrorMessage.set('No pudimos consultar los horarios disponibles. Intentá nuevamente.');
    }

    const bookable = filterBookablePublicDays(days);
    const selectedIsBookable = bookable.some(day => day.date === this.selectedDate());
    if (!selectedIsBookable) {
      const nextBookable = bookable[0];
      if (nextBookable) {
        this.selectedDate.set(nextBookable.date);
        this.loadingAvailability.set(false);
        await this.loadAvailabilityForSelectedDate();
        return;
      }
      this.availabilitySlots.set([]);
      this.selectedSlot = '';
    }

    this.loadingAvailability.set(false);
  }

  private async loadAvailabilityForSelectedDate(): Promise<void> {
    const slug = (this.resolvedSlug() || this.route.snapshot.paramMap.get('slug')) ?? '';
    const serviceId = this.selectedServiceId();
    const date = this.selectedDate();
    if (!slug || !serviceId || !this.hasSelectedPublicService(serviceId)) {
      this.availabilitySlots.set([]);
      this.selectedSlot = '';
      return;
    }

    this.loadingSlots.set(true);
    try {
      const response = await this.publicBookingService.queryPublicSlotAvailability(
        this.availabilityQuery(serviceId, date)
      );

      if (!this.isCurrentPublicServiceSelection(serviceId)) {
        return;
      }

      if (response.error || response.status < 200 || response.status >= 300) {
        this.availabilitySlots.set([]);
        this.selectedSlot = '';
        return;
      }

      if (response.data?.slots && response.data.slots.length > 0 && this.isConfiguredWorkingDate(date)) {
        const slots = response.data.slots.map(s => ({
          startsAtIso: s.startsAtIso,
          remainingCapacity: s.remainingCapacity ?? 0
        }));
        this.availabilitySlots.set(slots);
        this.updateDayAvailability(date, true);
        this.selectedSlot = slots[0]?.startsAtIso || '';
      } else {
        this.availabilitySlots.set([]);
        this.updateDayAvailability(date, false);
        this.selectedSlot = '';
      }
    } catch {
      if (!this.isCurrentPublicServiceSelection(serviceId)) {
        return;
      }
      this.availabilitySlots.set([]);
      this.selectedSlot = '';
    } finally {
      this.loadingSlots.set(false);
    }
  }

  protected async selectDate(date: string) {
    const day = this.availableDays().find(candidate => candidate.date === date);
    if (day && this.isDayDisabled(day)) return;

    this.selectedDate.set(date);
    await this.loadAvailability();
  }

  // Validate all required fields
  private validateForm(): boolean {
    if (this.rescheduleMode()) {
      const errors: Record<string, string> = {};
      if (!this.selectedServiceId()) errors['service'] = 'Seleccioná un servicio.';
      if (!this.selectedSlot) errors['slot'] = 'Seleccioná un horario disponible.';
      this.fieldErrors.set(errors);
      return Object.keys(errors).length === 0;
    }

    const result = validatePublicBookingForm(this.getValidationInput());
    this.fieldErrors.set(result.fieldErrors);
    return result.isValid;
  }

  isDayDisabled(day: DayAvailability): boolean {
    return !day.isWorkingDay || !day.hasAvailability;
  }

  private isConfiguredWorkingDate(dateIso: string): boolean {
    return this.workingHours()?.[getWeekdayKeyFromLocalCivilDate(dateIso)]?.enabled === true;
  }

  private isSelectedDateAvailable(): boolean {
    const selectedDate = this.selectedDate();
    const selectedDay = this.availableDays().find(day => day.date === selectedDate);

    return this.isConfiguredWorkingDate(selectedDate) && selectedDay?.hasAvailability === true;
  }

  private updateDayAvailability(dateIso: string, hasAvailability: boolean): void {
    this.availableDays.set(this.availableDays().map(day => day.date === dateIso
      ? { ...day, hasAvailability: day.isWorkingDay && hasAvailability }
      : day
    ));
  }

  protected formatSlot(startsAtIso: string): string {
    const date = new Date(startsAtIso);

    if (Number.isNaN(date.getTime())) {
      return startsAtIso;
    }

    return date.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Validate individual field on blur for real-time feedback
  validateFieldOnBlur(fieldName: string, value: string) {
    const fullValidation = validatePublicBookingForm(this.getValidationInput());
    const errors: Record<string, string> = { ...this.fieldErrors() };
    const fieldError = fullValidation.fieldErrors[fieldName];

    if (fieldError) {
      errors[fieldName] = fieldError;
    } else {
      delete errors[fieldName];
    }

    this.fieldErrors.set(errors);
  }

  private getValidationInput() {
    return {
      firstName: this.firstName,
      lastName: this.lastName,
      whatsapp: this.whatsapp,
      email: this.email,
      notes: this.notes,
      serviceId: this.selectedServiceId(),
      slotIso: this.selectedSlot
    };
  }

  private getQueryParam(name: string): string {
    return this.route.snapshot.queryParamMap?.get(name) ?? '';
  }

  private clearTransientRescheduleTokenFromUrl(): void {
    if (typeof window === 'undefined' || typeof window.history?.replaceState !== 'function') return;

    const slug = this.resolvedSlug() || this.route.snapshot.paramMap.get('slug') || '';
    window.history.replaceState(null, '', slug ? `/booking/${slug}` : window.location.pathname);
  }

  private applyReschedulePreload(): void {
    const preload = this.readReschedulePreload();
    if (!preload) {
      this.rescheduleMode.set(false);
      this.rescheduleToken = '';
      this.rescheduleTokenLoaded = false;
      this.preloadServiceId = '';
      this.preloadStartsAtIso = '';
      return;
    }

    this.rescheduleMode.set(true);
    this.rescheduleToken = preload.token.trim();
    this.rescheduleTokenLoaded = false;
    this.preloadServiceId = '';
    this.preloadStartsAtIso = '';
    if (!this.rescheduleToken) {
      this.errorMessage.set('No pudimos validar el link de reprogramación. Volvé a abrir el link privado de gestión del turno.');
    }
  }

  private async loadTokenBackedReschedulePreload(expectedBusinessId: string): Promise<boolean> {
    if (!this.rescheduleToken) {
      this.failClosedReschedulePreload();
      return false;
    }

    const response = await this.publicBookingService.manageBookingByToken(
      this.rescheduleToken,
      new Date().toISOString()
    );

    const details = response.data;
    if (
      response.error ||
      !details?.serviceId ||
      !details.startsAtIso ||
      (details.businessId && details.businessId !== expectedBusinessId)
    ) {
      emitPublicBookingFailureEvent({
        stage: 'service',
        status: response.status,
        code: response.error?.code ?? 'RESCHEDULE_TOKEN_LOAD_FAILED',
        retryable: response.status >= 500 || !response.error?.code
      });
      this.failClosedReschedulePreload();
      return false;
    }

    this.preloadServiceId = details.serviceId;
    this.preloadStartsAtIso = details.startsAtIso;
    this.rescheduleTokenLoaded = true;
    return true;
  }

  private failClosedReschedulePreload(): void {
    this.rescheduleTokenLoaded = false;
    this.preloadServiceId = '';
    this.preloadStartsAtIso = '';
    this.selectedServiceId.set('');
    this.availabilitySlots.set([]);
    this.selectedSlot = '';
    this.errorMessage.set('No pudimos validar el link de reprogramación. Volvé a abrir el link privado de gestión del turno.');
  }

  private readReschedulePreload(): ReschedulePreload | null {
    if (this.getQueryParam('mode') !== 'reschedule') return null;

    return {
      mode: 'reschedule',
      token: this.getQueryParam('token')
    };
  }

  // Check if form is ready for submission
  canSubmit(): boolean {
    if (this.rescheduleMode()) {
      return !!(
        !this.submitting() &&
        this.rescheduleToken &&
        this.rescheduleTokenLoaded &&
        this.selectedSlot &&
        this.isSelectedDateAvailable() &&
        this.availabilitySlots().some(slot => slot.startsAtIso === this.selectedSlot) &&
        this.selectedServiceId() &&
        this.hasSelectedPublicService(this.selectedServiceId()) &&
        this.canShowScheduleStep() &&
        Object.keys(this.fieldErrors()).length === 0
      );
    }

    return !!(
      !this.submitting() && 
      this.selectedSlot && 
      this.isSelectedDateAvailable() &&
      this.availabilitySlots().some(slot => slot.startsAtIso === this.selectedSlot) &&
      this.selectedServiceId() &&
      this.hasSelectedPublicService(this.selectedServiceId()) &&
      this.canShowContactStep() &&
      this.firstName?.trim() && 
      this.lastName?.trim() && 
      this.whatsapp?.trim() && 
      this.email?.trim() &&
      Object.keys(this.fieldErrors()).length === 0
    );
  }
}
