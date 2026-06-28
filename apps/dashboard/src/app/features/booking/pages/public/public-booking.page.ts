import { CommonModule } from '@angular/common';
import { Component, OnInit, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { BusinessService } from '../../../settings/data-access/business.service';
import { PublicBookingService } from '../../data-access/public-booking.service';
import { ServicioService } from '../../../servicios/data-access/servicio.service';
import { validatePublicBookingForm } from './public-booking.validation';
import type { PublicSlot } from '../../../../core/api/supabase-booking.api';
import type { WeekdayKey, WorkingDayHours } from '../../../../models/business.model';
import { DEFAULT_BUSINESS_TIMEZONE, buildPublicBookingDays, getWeekdayKeyFromLocalCivilDate, toLocalCivilDate, type DayAvailability } from './public-booking-days';
import { emitPublicBookingFailureEvent } from '../../../../core/observability/public-booking-operational-events';

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
  protected readonly errorMessage = signal('');
  protected readonly availabilityErrorMessage = signal('');
  protected readonly serviceErrorMessage = signal('');
  
  protected readonly publicServices = signal<any[]>([]);
  protected readonly selectedServiceId = signal<string>('');
  protected readonly availabilitySlots = signal<Array<Pick<PublicSlot, 'startsAtIso'> & { remainingCapacity: number }>>([]);
  protected readonly resolvedSlug = signal<string>('');
  protected readonly workingHours = signal<Partial<Record<WeekdayKey, WorkingDayHours>> | null>(null);
  protected readonly businessTimezone = signal<string>(DEFAULT_BUSINESS_TIMEZONE);

  protected readonly availableDays = signal<DayAvailability[]>([]);
  protected readonly selectedDate = signal<string>(toLocalCivilDate(new Date(), DEFAULT_BUSINESS_TIMEZONE));
  protected readonly resolvedBusinessId = signal<string | null>(null);

  // Validation errors per field
  protected readonly fieldErrors = signal<Record<string, string>>({});
  
  // Form controls for validation
  protected selectedSlot = '';
  protected firstName = '';
  protected lastName = '';
  protected whatsapp = '';
  protected email = '';
  protected notes = '';

  async ngOnInit(): Promise<void> {
    await this.loadPortal();
  }

  protected async retryPortalLoad(): Promise<void> {
    await this.loadPortal();
  }

  private async loadPortal(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    this.availabilityErrorMessage.set('');
    this.serviceErrorMessage.set('');
    this.bookingConfirmed.set(false);
    this.publicServices.set([]);
    this.selectedServiceId.set('');
    this.availabilitySlots.set([]);
    this.availableDays.set([]);
    this.resolvedSlug.set('');
    this.resolvedBusinessId.set(null);
    this.businessName.set('');
    this.workingHours.set(null);
    this.selectedSlot = '';

    const slug = this.route.snapshot.paramMap.get('slug') ?? '';
    const response = await this.businessService.resolveBusinessBySlug(slug);

    if (response.data) {
      this.resolvedSlug.set(response.data.slug);
      this.businessName.set(response.data.displayName);
      this.resolvedBusinessId.set(response.data.id);
      this.businessTimezone.set(response.data.timezone || DEFAULT_BUSINESS_TIMEZONE);
      
      this.workingHours.set(response.data.settings.workingHours);
      this.initAvailableDays();
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
        const mapped = services.map((s: any) => ({ 
          id: s.id, 
          name: s.nombre || s.name || 'Servicio sin nombre', 
          price: s.precio || s.price || 0,
          duration: s.duration_minutes || s.duration || 30
        }));
        this.publicServices.set(mapped);
        this.selectedServiceId.set(mapped[0].id);
        await this.loadAvailability();
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
    await this.loadAvailability();
  }

  // Trigger availability check when service is selected
  async loadAvailability() {
    const slug = (this.resolvedSlug() || this.route.snapshot.paramMap.get('slug')) ?? '';
    const serviceId = this.selectedServiceId();
    if (!slug || !serviceId) return;

    this.loadingSlots.set(true);
    this.availabilityErrorMessage.set('');
    const date = this.selectedDate();

    try {
      const response = await this.publicBookingService.queryPublicSlotAvailability({
        businessSlug: slug,
        serviceId,
        dateIso: date
      });

      if (response.error || response.status < 200 || response.status >= 300) {
        emitPublicBookingFailureEvent({ stage: 'availability', status: response.status, code: response.error?.code });
        this.availabilitySlots.set([]);
        this.updateDayAvailability(date, false);
        this.selectedSlot = '';
        this.availabilityErrorMessage.set('No pudimos consultar los horarios disponibles. Intentá nuevamente.');
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
        // No slots available for this date - clear slots but don't block the dropdown
        this.availabilitySlots.set([]);
        this.updateDayAvailability(date, false);
        this.selectedSlot = '';
      }
    } catch (error) {
      emitPublicBookingFailureEvent({ stage: 'availability', code: 'AVAILABILITY_LOOKUP_FAILED', status: 503 });
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

  protected async submitBooking(): Promise<void> {
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
      const response = await this.publicBookingService.createPublicBooking({
        businessSlug: (this.resolvedSlug() || this.route.snapshot.paramMap.get('slug')) ?? '',
        serviceId: this.selectedServiceId(),
        startsAtIso: this.selectedSlot,
        client: {
          fullName: `${this.firstName.trim()} ${this.lastName.trim()}`,
          email: this.email,
          phone: this.whatsapp
        },
        notes: this.notes
      });

      if (response.data?.status === 'confirmed') {
        this.bookingConfirmed.set(true);
        window.dispatchEvent(new CustomEvent('booking.created', {
          detail: {
            status: 'confirmed',
            startsAtIso: this.selectedSlot
          }
        }));
      } else {
        emitPublicBookingFailureEvent({ stage: 'submit', status: response.status, code: response.error?.code, retryable: true });
        this.errorMessage.set('No pudimos confirmar la reserva. Revisá los datos e intentá nuevamente.');
        this.bookingConfirmed.set(false);
      }
    } catch {
      emitPublicBookingFailureEvent({ stage: 'submit', status: 503, code: 'PUBLIC_BOOKING_SUBMIT_FAILED', retryable: true });
      this.errorMessage.set('No pudimos confirmar la reserva. Revisá los datos e intentá nuevamente.');
      this.bookingConfirmed.set(false);
    } finally {
      this.submitting.set(false);
    }
  }

  private initAvailableDays() {
    const days = buildPublicBookingDays(this.workingHours(), new Date(), this.businessTimezone());
    this.availableDays.set(days);
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
        const response = await this.publicBookingService.queryPublicSlotAvailability({
          businessSlug: slug,
          serviceId,
          dateIso: day.date
        });

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
        failedAvailabilityChecks = true;
        emitPublicBookingFailureEvent({ stage: 'availability', code: 'AVAILABILITY_LOOKUP_FAILED', status: 503 });
        days[i] = { ...day, hasAvailability: false };
        if (day.date === this.selectedDate()) {
          this.availabilitySlots.set([]);
          this.selectedSlot = '';
        }
      }
    }));

    this.availableDays.set(days);
    if (failedAvailabilityChecks) {
      this.availabilityErrorMessage.set('No pudimos consultar los horarios disponibles. Intentá nuevamente.');
    }
    this.loadingAvailability.set(false);
  }

  protected async selectDate(date: string) {
    const day = this.availableDays().find(candidate => candidate.date === date);
    if (day && this.isDayDisabled(day)) return;

    this.selectedDate.set(date);
    await this.loadAvailability();
  }

  // Validate all required fields
  private validateForm(): boolean {
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

  // Check if form is ready for submission
  canSubmit(): boolean {
    return !!(
      !this.submitting() && 
      this.selectedSlot && 
      this.isSelectedDateAvailable() &&
      this.availabilitySlots().some(slot => slot.startsAtIso === this.selectedSlot) &&
      this.selectedServiceId() && 
      this.firstName?.trim() && 
      this.lastName?.trim() && 
      this.whatsapp?.trim() && 
      this.email?.trim() &&
      Object.keys(this.fieldErrors()).length === 0
    );
  }
}
