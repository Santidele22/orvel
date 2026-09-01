import type { SupabaseBookingGateway } from '../gateway-interface';
import type {
  ApiResponse,
  BusinessPublicView,
  ManageBookingDetails,
  PublicBookingPayload,
  PublicSlot
} from '../types';

export type { ManageBookingDetails, PublicSlot };
export type AvailabilityResponse = { slots: PublicSlot[] };
export type CreatePublicBookingPayload = PublicBookingPayload;
export type BookingResponse = {
  bookingId: string;
  status: string;
  source: string;
  manageToken?: string;
  professionalId?: string;
  professionalName?: string;
};

export class PublicBookingService {
  constructor(private readonly gateway: SupabaseBookingGateway) {}

  async resolveBusinessBySlug(payload: { businessSlug: string }): Promise<ApiResponse<BusinessPublicView>> {
    return this.gateway.resolveBusinessBySlug(payload);
  }

  async queryPublicSlotAvailability(payload: {
    businessSlug: string;
    serviceId: string;
    dateIso: string;
    professionalId?: string;
  }): Promise<ApiResponse<AvailabilityResponse>> {
    return this.gateway.queryPublicSlotAvailability(payload);
  }

  async createPublicBooking(payload: CreatePublicBookingPayload): Promise<ApiResponse<BookingResponse>> {
    return this.gateway.createPublicBooking(payload);
  }

  async manageBookingByToken(token: string, nowIso: string): Promise<ApiResponse<ManageBookingDetails>> {
    return this.gateway.manageBookingByToken({ token, nowIso });
  }

  async cancelBookingByToken(
    token: string,
    nowIso: string
  ): Promise<ApiResponse<{ bookingId: string; status: string }>> {
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
