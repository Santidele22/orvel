import { Injectable } from '@angular/core';
import * as supabaseBookingApi from '../../../core/api/supabase-booking.api';
import type { ApiResponse, BusinessPublicView } from '../../../core/api/supabase-booking.api';

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
  async resolveBusinessBySlug(payload: { businessSlug: string }): Promise<ApiResponse<BusinessPublicView>> {
    return supabaseBookingApi.resolveBusinessBySlug(payload);
  }

  async queryPublicSlotAvailability(payload: { businessSlug: string; serviceId: string; dateIso: string }): Promise<ApiResponse<AvailabilityResponse>> {
    return supabaseBookingApi.queryPublicSlotAvailability(payload);
  }

  async createPublicBooking(payload: CreatePublicBookingPayload): Promise<ApiResponse<BookingResponse>> {
    return supabaseBookingApi.createPublicBooking(payload);
  }

  async manageBookingByToken(token: string, nowIso: string): Promise<ApiResponse<ManageBookingDetails>> {
    return supabaseBookingApi.manageBookingByToken({ token, nowIso });
  }

  async cancelBookingByToken(token: string, nowIso: string): Promise<ApiResponse<{ bookingId: string; status: string }>> {
    return supabaseBookingApi.cancelBookingByToken({ token, nowIso });
  }

  async rescheduleBookingByToken(
    token: string,
    nowIso: string,
    startsAtIso: string
  ): Promise<ApiResponse<{ bookingId: string; startsAtIso: string }>> {
    return supabaseBookingApi.rescheduleBookingByToken({ token, nowIso, startsAtIso });
  }
}
