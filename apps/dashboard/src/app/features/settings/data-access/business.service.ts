import { Injectable, signal, inject, computed } from '@angular/core';
import { Observable, from, throwError, map, tap } from 'rxjs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadDashboardRuntimeEnv } from '../../../core/runtime/dashboard-env';
import { isValidPublicBookingSlug, normalizePublicBookingSlug } from '../../../core/api/supabase-booking/public-booking-slug';
import { Business, BusinessSettings, WeekdayKey, WorkingDayHours, BusinessPublicView } from '../../../models/business.model';
import { AuthService } from '../../../services/auth.service';
import { ONBOARDING_PLAN_STORAGE_KEY, readPlanSelection } from '../../onboarding/data-access/onboarding-plan-storage';

export type ApiError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type ApiResponse<T> = {
  status: number;
  data?: T;
  error?: ApiError;
};

const PUBLIC_BOOKING_SETTINGS_COLUMNS = `
  business_id,
  business_name,
  slug,
  buffer_minutes,
  min_notice_minutes,
  slot_interval_minutes,
  working_hours,
  auto_confirm,
  cancelation_grace_period,
  allow_client_professional_selection
`;

@Injectable({
  providedIn: 'root'
})
export class BusinessService {
  private supabaseClient?: SupabaseClient;
  private businesses = signal<Business[]>([]);
  private activeBusinessId = signal<string | null>(null);
  private currentSettings = signal<BusinessSettings | null>(null);
  private authService = inject(AuthService);

  readonly items = this.businesses.asReadonly();
  readonly activeId = this.activeBusinessId.asReadonly();
  readonly settings = this.currentSettings.asReadonly();

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

  getSupabaseClient(): SupabaseClient | null {
    return this.supabaseClient || null;
  }

  setActiveBusiness(id: string) {
    this.activeBusinessId.set(id);
    localStorage.setItem('orvel.active_business_id', id);
  }

  loadBusinesses(): Observable<Business[]> {
    if (!this.supabaseClient) return throwError(() => new Error('Supabase not configured'));
    
    return from(
      this.supabaseClient.auth.getSession().then(({ data: { session } }) => {
        if (!session?.user?.id) throw new Error('Not authenticated');
        return this.supabaseClient!.from('businesses')
          .select('*')
          .eq('owner_id', session.user.id)
          .order('created_at', { ascending: true });
      })
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data as Business[];
      }),
      tap(businesses => {
        this.businesses.set(businesses);
        if (businesses.length > 0) {
          const stored = localStorage.getItem('orvel.active_business_id');
          const exists = businesses.find(b => b.id === stored);
          if (exists) {
            this.activeBusinessId.set(stored);
          } else {
            this.activeBusinessId.set(businesses[0].id);
          }
        } else {
          this.activeBusinessId.set(null);
        }
      })
    );
  }

  async loadFromSupabase(businessId: string): Promise<void> {
    if (!this.supabaseClient) return;

    const { data: businessData, error: businessError } = await this.supabaseClient
      .from('businesses')
      .select('*')
      .eq('id', businessId)
      .maybeSingle();

    if (businessError || !businessData) return;

    const { data: settingsData } = await this.supabaseClient
      .from('business_settings')
      .select('*')
      .eq('business_id', businessId)
      .maybeSingle();

    const { data: profileData } = await this.supabaseClient
      .from('profiles')
      .select('first_name, last_name, phone')
      .eq('id', businessId)
      .maybeSingle();

    this.currentSettings.set(this.mapToSettings(businessData, settingsData, profileData));
  }

  async saveToSupabase(businessId: string, settings: Partial<BusinessSettings>): Promise<{ source: string }> {
    if (!this.supabaseClient) return { source: 'error:no-supabase' };

    // Update businesses table
    if (settings.businessName) {
      await this.supabaseClient
        .from('businesses')
        .update({ name: settings.businessName })
        .eq('id', businessId);
    }

    // Update business_settings table
    const { error } = await this.supabaseClient
      .from('business_settings')
      .upsert({
        business_id: businessId,
        buffer_minutes: settings.bufferMinutes,
        min_notice_minutes: settings.minNoticeMinutes,
        slot_interval_minutes: settings.slotIntervalMinutes,
        working_hours: settings.workingHours,
        logo_url: settings.logoUrl,
        cover_url: settings.coverUrl,
        brand_color: settings.brandColor,
        whatsapp: settings.whatsapp,
        instagram: settings.instagram,
        support_email: settings.supportEmail,
        business_type: settings.businessType,
        cancelation_grace_period: settings.cancelationGracePeriod,
        auto_confirm: settings.autoConfirm,
        max_advance_days: settings.maxAdvanceDays,
        allow_multiple_services: settings.allowMultipleServices,
        cleanup_time_minutes: settings.cleanupTimeMinutes,
        capacity: settings.capacity,
        week_start_day: settings.weekStartDay,
        time_format: settings.timeFormat,
        first_name: settings.firstName,
        last_name: settings.lastName,
        phone: settings.phone
      });

    if (error) return { source: 'error:' + error.message };

    await this.loadFromSupabase(businessId);
    return { source: 'supabase' };
  }

  async save(businessId: string, settings: Partial<BusinessSettings>): Promise<{ source: string }> {
    return this.saveToSupabase(businessId, settings);
  }

  getSnapshot(): BusinessSettings | null {
    return this.currentSettings();
  }

  getDefaultWorkingHours(): Record<WeekdayKey, WorkingDayHours> {
    const days: WeekdayKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const defaultHours: Record<string, WorkingDayHours> = {};
    days.forEach(day => {
      defaultHours[day] = {
        enabled: day !== 'sunday',
        start: '09:00',
        end: '18:00'
      };
    });
    return defaultHours as Record<WeekdayKey, WorkingDayHours>;
  }

  private mapToSettings(business: any, settings: any, profile?: any): BusinessSettings {
    const defaultHours = this.getDefaultWorkingHours();
    return {
      businessName: business.name || '',
      slug: business.slug || '',
      bufferMinutes: settings?.buffer_minutes ?? 15,
      minNoticeMinutes: settings?.min_notice_minutes ?? 120,
      slotIntervalMinutes: settings?.slot_interval_minutes ?? 30,
      workingHours: settings?.working_hours ?? defaultHours,
      logoUrl: settings?.logo_url,
      coverUrl: settings?.cover_url,
      brandColor: settings?.brand_color,
      whatsapp: settings?.whatsapp,
      instagram: settings?.instagram,
      supportEmail: settings?.support_email,
      businessType: settings?.business_type ?? business?.business_type ?? business?.tipo_negocio ?? '',
      plan: this.resolveDisplayPlan(),
      cancelationGracePeriod: settings?.cancelation_grace_period,
      autoConfirm: settings?.auto_confirm,
      maxAdvanceDays: settings?.max_advance_days,
      allowMultipleServices: settings?.allow_multiple_services,
      cleanupTimeMinutes: settings?.cleanup_time_minutes,
      capacity: settings?.capacity ?? 1,
      weekStartDay: settings?.week_start_day,
      timeFormat: settings?.time_format,
      firstName: profile?.first_name ?? settings?.first_name ?? '',
      lastName: profile?.last_name ?? settings?.last_name ?? '',
      phone: profile?.phone ?? settings?.phone ?? ''
    };
  }

  private resolveDisplayPlan(): string {
    const authPlan = this.authService.user()?.plan;
    if (authPlan) return authPlan;

    if (typeof localStorage === 'undefined') return 'free';

    return readPlanSelection({
      getItem: (key: string) => localStorage.getItem(key === ONBOARDING_PLAN_STORAGE_KEY ? key : ONBOARDING_PLAN_STORAGE_KEY)
    }) ?? 'free';
  }

  canCreateNewBusiness(): boolean {
    const user = this.authService.user();
    if (!user) return false;
    
    const count = this.businesses().length;
    const plan = (user.plan || '').toUpperCase();

    // Check plan limits
    if (plan === 'FREE' || plan === 'STARTER' || plan === '') {
      if (count >= 1) {
        return false;
      }
    }

    return true;
  }

  async resolveBusinessBySlug(businessSlug: string): Promise<ApiResponse<BusinessPublicView>> {
    if (!this.supabaseClient) return { status: 500, error: { code: 'CONFIG_ERROR', message: 'Supabase not configured' } };

    try {
      const normalizedSlug = normalizePublicBookingSlug(businessSlug);

      if (!isValidPublicBookingSlug(normalizedSlug)) {
        return { status: 422, error: { code: 'VALIDATION_ERROR', message: 'Invalid booking link.' } };
      }

      const { data, error } = await this.supabaseClient.rpc('resolve_business_by_slug', {
        business_slug: normalizedSlug
      });

      if (error || !data) {
        return {
          status: 404,
          error: {
            code: 'BUSINESS_NOT_FOUND',
            message: `Business not found for slug: ${businessSlug}`
          }
        };
      }

      const { data: settingsData } = await this.supabaseClient
        .from('business_settings')
        .select(PUBLIC_BOOKING_SETTINGS_COLUMNS)
        .eq('business_id', data.id)
        .maybeSingle();

      return {
        status: 200,
        data: this.mapToPublicView(data, settingsData)
      };
    } catch (err) {
      return {
        status: 404,
        error: { code: 'UNKNOWN_ERROR', message: (err as Error).message }
      };
    }
  }

  private mapToPublicView(record: any, settings?: any): BusinessPublicView {
    const displayName = (settings?.business_name && settings.business_name.trim()) 
      ? settings.business_name 
      : record.name;

    return {
      id: record.id,
      slug: settings?.slug || record.slug,
      displayName: displayName,
      timezone: record.timezone || 'America/Argentina/Buenos_Aires',
      settings: {
        bufferMinutes: settings?.buffer_minutes ?? 15,
        minNoticeMinutes: settings?.min_notice_minutes ?? 120,
        slotIntervalMinutes: settings?.slot_interval_minutes ?? 30,
        workingHours: settings?.working_hours ?? this.getDefaultWorkingHours()
      },
      bookingPolicy: {
        autoConfirm: settings?.auto_confirm ?? true,
        cancellationWindowMinutes: settings?.cancelation_grace_period ?? 60,
        allowClientProfessionalSelection: settings?.allow_client_professional_selection ?? false
      }
    };
  }
}
