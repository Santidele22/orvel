import { Injectable, inject } from '@angular/core';
import { RealSupabaseBookingGateway } from '@orvel/booking/infrastructure';
import type { ApiResponse, BusinessPublicView } from '@orvel/booking';

export interface PublicSlot {
  startsAtIso: string;
  endsAtIso: string;
  remainingCapacity?: number;
}

export interface AvailabilityResponse {
  slots: PublicSlot[];
}

export interface CreatePublicBookingPayload {
  businessSlug: string;
  serviceId: string;
  startsAtIso: string;
  client: {
    fullName: string;
    email: string;
    phone?: string;
  };
  notes?: string;
  professionalId?: string;
}

export interface BookingResponse {
  bookingId: string;
  status: string;
  source: string;
  manageToken?: string;
}

export interface ManageBookingDetails {
  bookingId: string;
  businessId: string;
  serviceId: string;
  startsAtIso: string;
  status?: string;
  canCancelOrReschedule: boolean;
  booking?: Record<string, unknown>;
  business?: Record<string, unknown>;
  service?: Record<string, unknown>;
  policy?: Record<string, unknown>;
  actions?: Record<string, unknown>;
}

@Injectable({
  providedIn: 'root'
})
export class PublicBookingService {
  private readonly gateway = inject(RealSupabaseBookingGateway);

  async resolveBusinessBySlug(payload: { businessSlug: string }): Promise<ApiResponse<BusinessPublicView>> {
    return this.gateway.resolveBusinessBySlug(payload);
  }

  async queryPublicSlotAvailability(payload: { businessSlug: string; serviceId: string; dateIso: string }): Promise<ApiResponse<AvailabilityResponse>> {
    return this.gateway.queryPublicSlotAvailability(payload);
  }

  async createPublicBooking(payload: CreatePublicBookingPayload): Promise<ApiResponse<BookingResponse>> {
    return this.gateway.createPublicBooking(payload);
  }

  async manageBookingByToken(token: string, nowIso: string): Promise<ApiResponse<ManageBookingDetails>> {
    return this.gateway.manageBookingByToken({ token, nowIso });
  }

  async cancelBookingByToken(token: string, nowIso: string): Promise<ApiResponse<{ bookingId: string; status: string }>> {
    return this.gateway.cancelBookingByToken({ token, nowIso });
  }

  async rescheduleBookingByToken(
    token: string,
    nowIso: string,
    startsAtIso: string
  ): Promise<ApiResponse<{ bookingId: string; startsAtIso: string }>> {
    return this.gateway.rescheduleBookingByToken({ token, nowIso, startsAtIso });
  }
}
