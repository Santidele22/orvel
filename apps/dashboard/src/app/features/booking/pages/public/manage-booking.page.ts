import { CommonModule } from '@angular/common';
import { Component, OnInit, signal, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { emitPublicBookingFailureEvent } from '../../../../core/observability/public-booking-operational-events';
import { PublicBookingService, type ManageBookingDetails, type PublicSlot } from '../../data-access/public-booking.service';

type ManageErrorCode =
  | 'INVALID_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_REVOKED'
  | 'BOOKING_ALREADY_CANCELLED'
  | 'POLICY_WINDOW_CLOSED'
  | 'BACKEND_UNAVAILABLE'
  | 'SLOT_CONFLICT'
  | 'BLOCKED_TIME_COLLISION';

const CLOSED_STATUSES = new Set(['cancelled', 'canceled']);

function pickText(record: Record<string, unknown> | undefined, keys: string[], fallback = 'No informado'): string {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  return fallback;
}

function pickOptionalText(record: Record<string, unknown> | undefined, keys: string[]): string {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  return '';
}

@Component({
  selector: 'app-manage-booking-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './manage-booking.page.html'
})
export class ManageBookingPage implements OnInit {
  private readonly publicBookingService = inject(PublicBookingService);
  private readonly route = inject(ActivatedRoute);

  protected readonly loading = signal(true);
  protected readonly invalidToken = signal(false);
  protected readonly expiredToken = signal(false);
  protected readonly revokedToken = signal(false);
  protected readonly alreadyCancelled = signal(false);
  protected readonly policyWindowClosed = signal(false);
  protected readonly canCancelOrReschedule = signal(false);
  protected readonly canReschedule = signal(false);
  protected readonly cancelling = signal(false);
  protected readonly cancelled = signal(false);
  protected readonly rescheduled = signal(false);
  protected readonly reschedulePickerOpen = signal(false);
  protected readonly loadingRescheduleAvailability = signal(false);
  protected readonly submittingReschedule = signal(false);
  protected readonly rescheduleAvailabilityUnavailable = signal(false);
  protected readonly rescheduleRequired = signal(false);
  protected readonly rescheduleStale = signal(false);
  protected readonly availableRescheduleSlots = signal<PublicSlot[]>([]);
  protected readonly selectedDate = signal('');
  protected readonly selectedSlot = signal('');
  protected readonly requestedAction = signal<'reschedule' | null>(null);
  protected readonly bookingId = signal('');
  protected readonly bookingDetails = signal<ManageBookingDetails | null>(null);
  protected readonly hasLoadedAvailability = signal(false);

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('token') ?? '';
    const action = this.route.snapshot.queryParamMap.get('action') ?? '';
    this.requestedAction.set(action.toLowerCase() === 'reschedule' ? 'reschedule' : null);

    if (!token) {
      this.invalidToken.set(true);
      this.loading.set(false);
      return;
    }

    const response = await this.publicBookingService.manageBookingByToken(
      token,
      new Date().toISOString()
    );

    if (response.data) {
      this.applyManageDetails(response.data);
      this.loading.set(false);
      await this.openRequestedRescheduleAction();
      return;
    }

    const failureCode = response.error?.code as ManageErrorCode | undefined;
    emitPublicBookingFailureEvent({
      stage: 'service',
      code: failureCode ?? 'MANAGE_TOKEN_LOAD_FAILED',
      status: response.status,
      retryable: failureCode === 'BACKEND_UNAVAILABLE' || !failureCode
    });
    this.applyFailClosedError(failureCode);
    this.loading.set(false);
  }

  protected async handleCancel(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!token || !this.canCancelOrReschedule()) {
      this.applyFailClosedError(!token ? 'INVALID_TOKEN' : 'POLICY_WINDOW_CLOSED');
      return;
    }

    this.cancelling.set(true);
    const response = await this.publicBookingService.cancelBookingByToken(token, new Date().toISOString());
    this.cancelling.set(false);

    if (response.data?.status === 'cancelled') {
      this.cancelled.set(true);
      this.canCancelOrReschedule.set(false);
      this.canReschedule.set(false);
      return;
    }

    this.applyFailClosedError(response.error?.code as ManageErrorCode | undefined);
  }

  protected async handleReschedule(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!token || !this.canReschedule()) {
      this.applyFailClosedError(!token ? 'INVALID_TOKEN' : 'POLICY_WINDOW_CLOSED');
      return;
    }

    this.reschedulePickerOpen.set(true);
    this.rescheduleRequired.set(false);
    this.rescheduleStale.set(false);
    this.rescheduleAvailabilityUnavailable.set(false);
    this.selectedDate.set(this.currentDateInputValue());
    await this.loadPublicRescheduleSlots();
  }

  private async openRequestedRescheduleAction(): Promise<void> {
    if (this.requestedAction() !== 'reschedule') return;

    if (!this.canReschedule()) {
      if (this.canCancelOrReschedule()) return;
      this.policyWindowClosed.set(true);
      return;
    }

    await this.handleReschedule();
  }

  protected async onRescheduleDateChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    this.selectedDate.set(input.value);
    this.selectedSlot.set('');
    this.hasLoadedAvailability.set(false);
    await this.loadPublicRescheduleSlots();
  }

  protected selectRescheduleSlot(startsAtIso: string): void {
    this.selectedSlot.set(startsAtIso);
    this.rescheduleRequired.set(false);
    this.rescheduleStale.set(false);
  }

  protected async submitReschedule(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!token || !this.canReschedule()) {
      this.applyFailClosedError(!token ? 'INVALID_TOKEN' : 'POLICY_WINDOW_CLOSED');
      return;
    }

    const selectedSlot = this.selectedSlot();
    if (!this.selectedDate() || !selectedSlot) {
      this.rescheduleRequired.set(true);
      return;
    }

    if (!this.hasLoadedAvailability() || !this.isSelectedSlotAvailable(selectedSlot)) {
      this.rescheduleStale.set(true);
      return;
    }

    this.submittingReschedule.set(true);
    const nowIso = new Date().toISOString();
    const response = await this.publicBookingService.rescheduleBookingByToken(token, nowIso, selectedSlot);
    this.submittingReschedule.set(false);

    if (response.data?.startsAtIso) {
      this.rescheduled.set(true);
      this.reschedulePickerOpen.set(false);
      this.canCancelOrReschedule.set(false);
      this.canReschedule.set(false);
      this.bookingDetails.update((details) => details ? { ...details, startsAtIso: response.data!.startsAtIso } : details);
      return;
    }

    emitPublicBookingFailureEvent({
      stage: 'submit',
      code: response.error?.code ?? 'RESCHEDULE_SUBMIT_FAILED',
      status: response.status,
      retryable: true
    });
    this.applyFailClosedError(response.error?.code as ManageErrorCode | undefined);
  }

  protected businessLabel(): string {
    return pickText(this.bookingDetails()?.business, ['name', 'displayName', 'display_name', 'businessName', 'business_name'], 'Negocio');
  }

  protected serviceLabel(): string {
    return pickText(this.bookingDetails()?.service, ['name', 'displayName', 'display_name', 'serviceName', 'service_name'], this.bookingDetails()?.serviceId ?? 'Servicio');
  }

  protected statusLabel(): string {
    return this.bookingDetails()?.status ?? pickText(this.bookingDetails()?.booking, ['status'], 'confirmada');
  }

  protected startsAtLabel(): string {
    const startsAtIso = this.bookingDetails()?.startsAtIso;

    if (!startsAtIso) {
      return 'Horario no informado';
    }

    return new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(startsAtIso));
  }

  protected slotLabel(startsAtIso: string): string {
    const date = new Date(startsAtIso);
    if (Number.isNaN(date.getTime())) {
      return startsAtIso;
    }

    return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }

  protected canSubmitReschedule(): boolean {
    return Boolean(
      this.canReschedule()
      && !this.submittingReschedule()
      && !this.rescheduleAvailabilityUnavailable()
      && this.hasLoadedAvailability()
      && this.isSelectedSlotAvailable(this.selectedSlot())
    );
  }

  private async loadPublicRescheduleSlots(): Promise<void> {
    const details = this.bookingDetails();
    const businessSlug = pickOptionalText(details?.business, ['slug', 'businessSlug', 'business_slug']);
    const serviceId = details?.serviceId ?? '';
    const dateIso = this.selectedDate();

    this.availableRescheduleSlots.set([]);
    this.selectedSlot.set('');
    this.rescheduleRequired.set(false);
    this.rescheduleStale.set(false);
    this.hasLoadedAvailability.set(false);

    if (!businessSlug || !serviceId || !dateIso) {
      this.rescheduleAvailabilityUnavailable.set(true);
      return;
    }

    this.loadingRescheduleAvailability.set(true);
    try {
      const response = await this.publicBookingService.queryPublicSlotAvailability({
        businessSlug,
        serviceId,
        dateIso
      });

      if (response.error) {
        emitPublicBookingFailureEvent({
          stage: 'availability',
          code: response.error.code ?? 'AVAILABILITY_LOOKUP_FAILED',
          status: response.status,
          retryable: true
        });
        this.rescheduleAvailabilityUnavailable.set(true);
        this.hasLoadedAvailability.set(false);
        return;
      }

      const slots = response.data?.slots ?? [];
      this.availableRescheduleSlots.set(slots);
      this.hasLoadedAvailability.set(true);
      this.rescheduleAvailabilityUnavailable.set(slots.length === 0);
    } catch {
      emitPublicBookingFailureEvent({
        stage: 'availability',
        code: 'AVAILABILITY_LOOKUP_FAILED',
        status: 503,
        retryable: true
      });
      this.rescheduleAvailabilityUnavailable.set(true);
      this.hasLoadedAvailability.set(false);
    } finally {
      this.loadingRescheduleAvailability.set(false);
    }
  }

  private isSelectedSlotAvailable(selectedStartsAtIso: string): boolean {
    return this.availableRescheduleSlots().some((slot) => slot.startsAtIso === selectedStartsAtIso);
  }

  private currentDateInputValue(): string {
    const startsAtIso = this.bookingDetails()?.startsAtIso;
    if (startsAtIso) {
      return startsAtIso.split('T')[0];
    }

    return new Date().toISOString().split('T')[0];
  }

  private applyManageDetails(details: ManageBookingDetails): void {
    const status = (details.status ?? pickText(details.booking, ['status'], '')).toLowerCase();

    this.bookingDetails.set(details);
    this.bookingId.set(details.bookingId);
    this.cancelled.set(CLOSED_STATUSES.has(status));
    this.canCancelOrReschedule.set(Boolean(details.canCancelOrReschedule && !CLOSED_STATUSES.has(status)));
    const backendCanReschedule = typeof details.actions?.['canReschedule'] === 'boolean'
      ? details.actions['canReschedule']
      : details.canCancelOrReschedule;
    this.canReschedule.set(Boolean(backendCanReschedule && !CLOSED_STATUSES.has(status)));
  }

  private applyFailClosedError(code: ManageErrorCode | undefined): void {
    this.canCancelOrReschedule.set(false);
    this.canReschedule.set(false);
    this.reschedulePickerOpen.set(false);
    this.hasLoadedAvailability.set(false);
    this.invalidToken.set(code === 'INVALID_TOKEN' || !code);
    this.expiredToken.set(code === 'TOKEN_EXPIRED');
    this.revokedToken.set(code === 'TOKEN_REVOKED');
    this.alreadyCancelled.set(code === 'BOOKING_ALREADY_CANCELLED');
    this.policyWindowClosed.set(code === 'POLICY_WINDOW_CLOSED');
    this.rescheduleAvailabilityUnavailable.set(code === 'BACKEND_UNAVAILABLE');
    this.rescheduleStale.set(code === 'SLOT_CONFLICT' || code === 'BLOCKED_TIME_COLLISION');
    this.cancelled.set(code === 'BOOKING_ALREADY_CANCELLED');
  }
}
