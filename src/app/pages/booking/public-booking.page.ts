import { CommonModule } from '@angular/common';
import { Component, OnInit, signal, inject } from '@angular/core';
import { FormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { resolveBusinessBySlug } from '../../core/api/supabase-booking.api';
import { ServicioService } from '../../services/servicio.service';
import { validatePublicBookingForm } from './public-booking.validation';

interface DayAvailability {
  date: string;
  label: string;
  weekday: string;
  hasAvailability: boolean;
}

@Component({
  selector: 'app-public-booking-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './public-booking.page.html'
})
export class PublicBookingPage implements OnInit {
  private readonly servicioService = inject(ServicioService);
  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly loadingSlots = signal(false);
  protected readonly loadingAvailability = signal(false);
  protected readonly businessName = signal('');
  protected readonly bookingConfirmed = signal(false);
  protected readonly errorMessage = signal('');
  
  protected readonly publicServices = signal<any[]>([]);
  protected readonly selectedServiceId = signal<string>('');
  protected readonly availabilitySlots = signal<Array<{ startsAtIso: string; remainingCapacity: number }>>([]);
  protected readonly resolvedSlug = signal<string>('');

  protected readonly availableDays = signal<DayAvailability[]>([]);
  protected readonly selectedDate = signal<string>(new Date().toISOString().split('T')[0]);
  protected readonly resolvedBusinessId = signal<string | null>(null);

  // Validation errors per field
  protected readonly fieldErrors = signal<Record<string, string>>({});
  
  // Track which days have been checked for availability
  private daysWithAvailability = new Set<string>();

  // Form controls for validation
  protected selectedSlot = '';
  protected firstName = '';
  protected lastName = '';
  protected whatsapp = '';
  protected email = '';
  protected notes = '';

  constructor(private readonly route: ActivatedRoute) {}

  formatSlot(iso: string): string {
    const date = new Date(iso);
    return date.toLocaleString('es-AR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  async ngOnInit(): Promise<void> {
    const slug = this.route.snapshot.paramMap.get('slug') ?? '';
    const response = await resolveBusinessBySlug({ businessSlug: slug });

    if (response.data) {
      this.resolvedSlug.set(response.data.slug);
      
      // Use displayName if available, fallback to name or slug
      const name = response.data.displayName || (response.data as any).name || response.data.slug;
      this.businessName.set(name);
      this.resolvedBusinessId.set(response.data.id);
      
      this.initAvailableDays();
      await this.loadServices(response.data.id);
    } else {
      this.errorMessage.set(response.error?.message ?? 'Negocio no encontrado.');
      
      // development fallback for any slug if not found in DB
      const isDev = false; // Disable component-level fallback to avoid confusion
      if (isDev) {
        const fallbackName = slug.charAt(0).toUpperCase() + slug.slice(1);
        this.businessName.set(fallbackName);
        this.errorMessage.set('');
        this.initAvailableDays();
        await this.loadAvailability();
      }
    }

    this.loading.set(false);
  }

  async loadServices(businessId: string) {
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
        // No services found
      }
    } catch (error) {
      // Error in loadServices
    }
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
    const date = this.selectedDate();
    
    try {
      const { queryPublicSlotAvailability } = await import('../../core/api/supabase-booking.api');
      const response = await queryPublicSlotAvailability({
        businessSlug: slug,
        serviceId,
        dateIso: date
      });

      if (response.data?.slots && response.data.slots.length > 0) {
        const slots = response.data.slots.map(s => ({
          startsAtIso: s.startsAtIso,
          remainingCapacity: Math.max(1, Number((s as any).remainingCapacity ?? (s as any).remaining_capacity ?? 0))
        }));
        this.availabilitySlots.set(slots);
        this.selectedSlot = slots[0]?.startsAtIso || '';
      } else {
        // No slots available for this date - clear slots but don't block the dropdown
        this.availabilitySlots.set([]);
        this.selectedSlot = '';
      }
    } catch (error) {
      // Error loading availability
      // Allow user to try - clear slots but don't block
      this.availabilitySlots.set([]);
      this.selectedSlot = '';
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
    
    this.submitting.set(true);
    this.errorMessage.set('');

    const { createPublicBooking } = await import('../../core/api/supabase-booking.api');
    const response = await createPublicBooking({
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
          bookingId: response.data.bookingId,
          startsAtIso: this.selectedSlot
        }
      }));
    } else {
      this.errorMessage.set(response.error?.message ?? 'No se pudo confirmar la reserva.');
      this.bookingConfirmed.set(false);
    }

    this.submitting.set(false);
  }

  private initAvailableDays() {
    const days: DayAvailability[] = [];
    const today = new Date();
    // Start from today, next 14 days
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const iso = d.toISOString().split('T')[0];
      days.push({
        date: iso,
        label: d.getDate().toString(),
        weekday: d.toLocaleString('es-AR', { weekday: 'short' }).toUpperCase().replace('.', ''),
        hasAvailability: true // ALL days clickable by default, check updates later
      });
    }
    this.availableDays.set(days);
    if (!this.selectedDate()) {
      this.selectedDate.set(days[0].date);
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

    const { queryPublicSlotAvailability } = await import('../../core/api/supabase-booking.api');
    const days = [...this.availableDays()];

    // Parallelize availability checks for performance (Day indicators)
    await Promise.all(days.map(async (day, i) => {
      try {
        const response = await queryPublicSlotAvailability({
          businessSlug: slug,
          serviceId,
          dateIso: day.date
        });

        const hasSlots = !!(response.data?.slots && response.data.slots.length > 0);
        days[i] = { ...day, hasAvailability: hasSlots };
        
        if (hasSlots) {
          this.daysWithAvailability.add(day.date);
        }
      } catch (error) {
        // Error checking availability
      }
    }));

    this.availableDays.set(days);
    this.loadingAvailability.set(false);
  }

  protected async selectDate(date: string) {
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
    return !day.hasAvailability;
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
      serviceId: this.selectedServiceId(),
      slotIso: this.selectedSlot
    };
  }

  // Check if form is ready for submission
  canSubmit(): boolean {
    return !!(
      !this.submitting() && 
      this.selectedSlot && 
      this.selectedServiceId() && 
      this.firstName?.trim() && 
      this.lastName?.trim() && 
      this.whatsapp?.trim() && 
      this.email?.trim() &&
      Object.keys(this.fieldErrors()).length === 0
    );
  }
}
