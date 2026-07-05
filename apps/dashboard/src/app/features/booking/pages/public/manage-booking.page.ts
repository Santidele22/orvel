import { CommonModule } from '@angular/common';
import { Component, OnInit, signal, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { emitPublicBookingFailureEvent } from '../../../../core/observability/public-booking-operational-events';
import { PublicBookingService, type ManageBookingDetails } from '../../data-access/public-booking.service';

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
  private readonly router = inject(Router);

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
  protected readonly bookingId = signal('');
  protected readonly bookingDetails = signal<ManageBookingDetails | null>(null);

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('token') ?? '';

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

    const details = this.bookingDetails();
    const businessSlug = pickOptionalText(details?.business, ['slug', 'businessSlug', 'business_slug']);
    if (!details || !businessSlug) {
      this.applyFailClosedError('BACKEND_UNAVAILABLE');
      return;
    }

    await this.router.navigate(['/booking', businessSlug], {
      queryParams: {
        mode: 'reschedule',
        token
      }
    });
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
    this.invalidToken.set(code === 'INVALID_TOKEN' || !code);
    this.expiredToken.set(code === 'TOKEN_EXPIRED');
    this.revokedToken.set(code === 'TOKEN_REVOKED');
    this.alreadyCancelled.set(code === 'BOOKING_ALREADY_CANCELLED');
    this.policyWindowClosed.set(code === 'POLICY_WINDOW_CLOSED');
    this.cancelled.set(code === 'BOOKING_ALREADY_CANCELLED');
  }
}
