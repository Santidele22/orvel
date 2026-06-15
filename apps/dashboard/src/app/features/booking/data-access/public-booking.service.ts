import { Injectable, inject } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadDashboardRuntimeEnv } from '../../../core/runtime/dashboard-env';
import { ApiResponse, ApiError } from '../../settings/data-access/business.service';

export interface PublicSlot {
  startsAtIso: string;
  endsAtIso: string;
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
}

export interface ManageBookingDetails {
  bookingId: string;
  businessId: string;
  serviceId: string;
  startsAtIso: string;
  canCancelOrReschedule: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class PublicBookingService {
  private supabaseClient?: SupabaseClient;

  constructor() {
    this.initSupabase();
  }

  private initSupabase() {
    const env = loadDashboardRuntimeEnv();
    if (env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      this.supabaseClient = createClient(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      );
    }
  }

  async queryPublicSlotAvailability(payload: { businessSlug: string; serviceId: string; dateIso: string }): Promise<ApiResponse<AvailabilityResponse>> {
    if (!this.supabaseClient) return { status: 500, error: { code: 'CONFIG_ERROR', message: 'Supabase not configured' } };

    try {
      const { data, error } = await this.supabaseClient.rpc('query_public_slot_availability', {
        business_slug: payload.businessSlug,
        service_id: payload.serviceId,
        date_iso: payload.dateIso
      });

      if (error) return { status: 400, error: this.mapRpcError(error) };

      const slots = (data as any[] || []).map(row => ({
        startsAtIso: new Date(row.starts_at_iso).toISOString(),
        endsAtIso: new Date(row.ends_at_iso).toISOString()
      }));

      return { status: 200, data: { slots } };
    } catch (err) {
      return { status: 400, error: { code: 'UNKNOWN_ERROR', message: (err as Error).message } };
    }
  }

  async createPublicBooking(payload: CreatePublicBookingPayload): Promise<ApiResponse<BookingResponse>> {
    if (!this.supabaseClient) return { status: 500, error: { code: 'CONFIG_ERROR', message: 'Supabase not configured' } };

    try {
      const { data, error } = await this.supabaseClient.rpc('create_public_booking', {
        business_slug: payload.businessSlug,
        service_id: payload.serviceId,
        starts_at_iso: payload.startsAtIso,
        client: {
          fullName: payload.client.fullName,
          email: payload.client.email,
          phone: payload.client.phone
        },
        notes: payload.notes
      });

      if (error) return { status: 400, error: this.mapRpcError(error) };

      const bookingId = (data as { booking_id: string }).booking_id;
      return {
        status: 201,
        data: {
          bookingId,
          status: 'confirmed',
          source: 'client-self-service'
        }
      };
    } catch (err) {
      return { status: 400, error: { code: 'UNKNOWN_ERROR', message: (err as Error).message } };
    }
  }

  async manageBookingByToken(token: string, nowIso: string): Promise<ApiResponse<ManageBookingDetails>> {
    if (!this.supabaseClient) return { status: 500, error: { code: 'CONFIG_ERROR', message: 'Supabase not configured' } };

    try {
      const { data, error } = await this.supabaseClient.rpc('manage_booking_by_token', {
        token,
        now_iso: nowIso
      });

      if (error) return { status: 400, error: this.mapRpcError(error) };

      const { data: bookingData } = await this.supabaseClient
        .from('bookings')
        .select('id, business_id, service_id, starts_at')
        .eq('manage_token', token)
        .maybeSingle();

      return {
        status: 200,
        data: {
          bookingId: (bookingData as any)?.id || '',
          businessId: (bookingData as any)?.business_id || '',
          serviceId: (bookingData as any)?.service_id || '',
          startsAtIso: (bookingData as any)?.starts_at || '',
          canCancelOrReschedule: true
        }
      };
    } catch (err) {
      return { status: 400, error: { code: 'UNKNOWN_ERROR', message: (err as Error).message } };
    }
  }

  async cancelBookingByToken(token: string, nowIso: string): Promise<ApiResponse<{ bookingId: string; status: string }>> {
    if (!this.supabaseClient) return { status: 500, error: { code: 'CONFIG_ERROR', message: 'Supabase not configured' } };

    try {
      const { data, error } = await this.supabaseClient.rpc('cancel_booking_by_token', {
        token,
        now_iso: nowIso
      });

      if (error) return { status: 400, error: this.mapRpcError(error) };

      return {
        status: 200,
        data: {
          bookingId: (data as any)?.booking_id || '',
          status: 'cancelled'
        }
      };
    } catch (err) {
      return { status: 400, error: { code: 'UNKNOWN_ERROR', message: (err as Error).message } };
    }
  }

  private mapRpcError(error: any): ApiError {
    const code = error.code || '';
    const message = error.message || 'Unknown error';
    
    if (message.includes('SLOT_CONFLICT')) return { code: 'SLOT_CONFLICT', message };
    if (message.includes('BLOCKED_TIME_COLLISION')) return { code: 'BLOCKED_TIME_COLLISION', message };
    if (message.includes('INVALID_TOKEN')) return { code: 'INVALID_TOKEN', message };
    if (message.includes('TOKEN_EXPIRED')) return { code: 'TOKEN_EXPIRED', message };
    if (message.includes('POLICY_WINDOW_CLOSED')) return { code: 'POLICY_WINDOW_CLOSED', message };
    
    return { code: 'VALIDATION_ERROR', message };
  }
}
