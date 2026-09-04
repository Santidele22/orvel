import { Injectable, signal, inject } from '@angular/core';
import { Observable, from, throwError, map, tap } from 'rxjs';
import { type SupabaseClient } from '@supabase/supabase-js';
import { loadDashboardRuntimeEnv } from '../../../core/runtime/dashboard-env';
import { createDashboardSupabaseClient } from '../../../core/runtime/supabase-client.factory';
import { isValidPublicBookingSlug, normalizePublicBookingSlug } from '@orvel/booking';
import { Business, BusinessSettings, WeekdayKey, WorkingDayHours, BusinessPublicView } from '../../../models/business.model';
import { getBranchContextService, registerSectionCacheInvalidator } from '../../../core/branches/branch-context.service';
import { AuthService } from '../../../services/auth.service';
import { ONBOARDING_PLAN_STORAGE_KEY, readPlanSelection } from '../../onboarding/data-access/onboarding-plan-storage';
import { emitPublicBookingFailureEvent } from '../../../core/observability/public-booking-operational-events';
import { ACTIVE_BUSINESS_STORAGE_KEY } from '../../../core/storage/browser-storage-keys';
import {
  mapNullableSettingsToFormDefaults,
  resolveWorkingHours
} from './map-nullable-settings-to-form-defaults';

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

type ActiveBusinessContext = {
  businessId: string;
  ownerId: string;
  slug?: string;
  name?: string;
};

const DEFAULT_BOOKING_POLICY = {
  bufferMinutes: 15,
  minNoticeMinutes: 120,
  slotIntervalMinutes: 30,
  cancellationWindowMinutes: 60,
  timezone: 'America/Argentina/Buenos_Aires'
} as const;

export class BusinessSettingsPersistenceError extends Error {
  constructor(
    message: string,
    readonly code: 'BUSINESS_NOT_FOUND' | 'BUSINESS_UPDATE_FAILED' | 'SETTINGS_SAVE_FAILED' | 'PROFILE_SAVE_FAILED' | 'AUTH_REQUIRED'
  ) {
    super(message);
    this.name = 'BusinessSettingsPersistenceError';
  }
}

@Injectable({
  providedIn: 'root'
})
export class BusinessService {
  private supabaseClient?: SupabaseClient;
  private businesses = signal<Business[]>([]);
  private activeBusinessId = signal<string | null>(null);
  private currentSettings = signal<BusinessSettings | null>(null);
  private persistenceError = signal<string | null>(null);
  private hydratedUserId: string | null = null;
  private settingsHydrateInFlight: Promise<void> | null = null;
  private authService = inject(AuthService);

  readonly items = this.businesses.asReadonly();
  readonly activeId = this.activeBusinessId.asReadonly();
  readonly settings = this.currentSettings.asReadonly();

  constructor() {
    this.initSupabase();
    registerSectionCacheInvalidator(() => this.clearCache());
  }

  hasHydratedSnapshot(userId: string): boolean {
    return this.hydratedUserId === userId && this.currentSettings() !== null;
  }

  clearHydration(): void {
    this.hydratedUserId = null;
    this.settingsHydrateInFlight = null;
  }

  invalidate(): void {
    this.hydratedUserId = null;
    this.settingsHydrateInFlight = null;
  }

  clearCache(): void {
    this.hydratedUserId = null;
    this.settingsHydrateInFlight = null;
    this.currentSettings.set(null);
  }

  private initSupabase() {
    const env = loadDashboardRuntimeEnv();
    if (env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      this.supabaseClient = createDashboardSupabaseClient({ env });
    }
  }

  getSupabaseClient(): SupabaseClient | null {
    return this.supabaseClient || null;
  }

  async listPublicProfessionalsForService(
    businessSlug: string,
    serviceId: string
  ): Promise<Array<{ id: string; name: string }>> {
    if (!this.supabaseClient) return [];
    const { data, error } = await this.supabaseClient.rpc('list_public_professionals_for_service', {
      business_slug: normalizePublicBookingSlug(businessSlug),
      service_id: serviceId
    });
    if (error || !Array.isArray(data)) return [];
    return data.map((row: { id: string; name: string }) => ({
      id: String(row.id),
      name: String(row.name)
    }));
  }

  async resolvePublicProfessional(
    businessSlug: string,
    professionalSlug: string
  ): Promise<{ id: string; name: string; slug: string; serviceIds: string[] } | null> {
    if (!this.supabaseClient) return null;
    const { data, error } = await this.supabaseClient.rpc('resolve_public_professional', {
      business_slug: normalizePublicBookingSlug(businessSlug),
      professional_slug: normalizePublicBookingSlug(professionalSlug)
    });
    if (error || !data || typeof data !== 'object') return null;
    const row = data as Record<string, unknown>;
    return {
      id: String(row['id'] ?? ''),
      name: String(row['name'] ?? ''),
      slug: String(row['slug'] ?? ''),
      serviceIds: Array.isArray(row['service_ids']) ? (row['service_ids'] as string[]).map(String) : []
    };
  }

  async listBusinessProfessionals(businessId: string): Promise<Array<{
    id: string;
    name: string;
    slug: string;
    phone: string | null;
    email: string | null;
    active: boolean;
    serviceIds: string[];
  }>> {
    if (!this.supabaseClient) return [];
    const { data, error } = await this.supabaseClient.rpc('list_business_professionals', {
      p_business_id: businessId
    });
    if (error || !Array.isArray(data)) return [];
    return data.map((row: Record<string, unknown>) => ({
      id: String(row['id']),
      name: String(row['name'] ?? ''),
      slug: String(row['slug'] ?? ''),
      phone: (row['phone'] as string | null) ?? null,
      email: (row['email'] as string | null) ?? null,
      active: row['active'] !== false,
      serviceIds: Array.isArray(row['service_ids']) ? (row['service_ids'] as string[]).map(String) : []
    }));
  }

  async listProfessionalHours(professionalId: string): Promise<Array<{ dayOfWeek: number; start: string; end: string }>> {
    if (!this.supabaseClient) return [];
    const { data, error } = await this.supabaseClient.rpc('list_professional_hours', {
      p_professional_id: professionalId
    });
    if (error || !Array.isArray(data)) return [];
    return data.map((row: Record<string, unknown>) => ({
      dayOfWeek: Number(row['day_of_week']),
      start: String(row['start_time'] ?? '').slice(0, 5),
      end: String(row['end_time'] ?? '').slice(0, 5)
    }));
  }

  async replaceProfessionalHours(
    professionalId: string,
    hours: Array<{ dayOfWeek: number; start: string; end: string; enabled: boolean }>
  ): Promise<void> {
    if (!this.supabaseClient) return;
    const { error } = await this.supabaseClient.rpc('replace_professional_hours', {
      p_professional_id: professionalId,
      p_hours: hours.map((hour) => ({
        day_of_week: hour.dayOfWeek,
        start: hour.start,
        end: hour.end,
        enabled: hour.enabled
      }))
    });
    if (error) throw error;
  }

  async upsertBusinessProfessional(payload: {
    businessId: string;
    id?: string | null;
    name: string;
    phone?: string | null;
    email?: string | null;
    active?: boolean;
    serviceIds?: string[];
  }): Promise<string | null> {
    if (!this.supabaseClient) return null;
    const { data, error } = await this.supabaseClient.rpc('upsert_business_professional', {
      p_business_id: payload.businessId,
      p_id: payload.id || null,
      p_name: payload.name,
      p_phone: payload.phone ?? null,
      p_email: payload.email ?? null,
      p_active: payload.active ?? true,
      p_service_ids: payload.serviceIds ?? []
    });
    if (error) throw error;
    return data ? String(data) : null;
  }

  setActiveBusiness(id: string) {
    this.activeBusinessId.set(id);
    localStorage.setItem(ACTIVE_BUSINESS_STORAGE_KEY, id);
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
        getBranchContextService().clearSessionBusinessIdentity();
        if (businesses.length > 0) {
          const stored = localStorage.getItem(ACTIVE_BUSINESS_STORAGE_KEY);
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

  async loadFromSupabase(businessId: string, forceReload = false): Promise<void> {
    if (!forceReload && this.settingsHydrateInFlight) {
      return this.settingsHydrateInFlight;
    }

    const load = (async () => {
    this.persistenceError.set(null);

    if (!this.supabaseClient) {
      throw this.failLoad('No se pudo conectar con el servidor.', 'BUSINESS_NOT_FOUND');
    }

    const context = await this.resolveActiveBusinessContext(businessId);
    if (!forceReload && this.hasHydratedSnapshot(context.ownerId)) {
      return;
    }
    const resolvedBusinessId = context.businessId;
    const cachedIdentity = getBranchContextService().peekSessionBusinessIdentity();
    const cachedRow = cachedIdentity
      && cachedIdentity.ownerId === context.ownerId
      && cachedIdentity.businessId === resolvedBusinessId
      ? {
          id: cachedIdentity.businessId,
          owner_id: cachedIdentity.ownerId,
          slug: cachedIdentity.slug,
          name: cachedIdentity.name
        }
      : null;

    let businessData = cachedRow;
    if (!businessData) {
      const { data, error: businessError } = await this.supabaseClient
        .from('businesses')
        .select('*')
        .eq('id', resolvedBusinessId)
        .maybeSingle();

      if (businessError || !data) {
        throw this.failLoad('No se encontró el negocio activo.', 'BUSINESS_NOT_FOUND');
      }
      businessData = data;
    }

    const { data: settingsData } = await this.supabaseClient
      .from('business_settings')
      .select('*')
      .eq('business_id', resolvedBusinessId)
      .maybeSingle();

    const { data: profileData } = await this.supabaseClient
      .from('profiles')
      .select('first_name, last_name, phone')
      .eq('id', context.ownerId)
      .maybeSingle();

    this.currentSettings.set(this.mapToSettings(businessData, settingsData, profileData));
    this.hydratedUserId = context.ownerId;
    })().finally(() => {
      if (this.settingsHydrateInFlight === load) this.settingsHydrateInFlight = null;
    });
    this.settingsHydrateInFlight = load;
    return load;
  }

  async saveToSupabase(businessId: string, settings: Partial<BusinessSettings>): Promise<{ source: string }> {
    this.persistenceError.set(null);

    if (!this.supabaseClient) {
      throw this.failLoad('No se pudo conectar con el servidor.', 'SETTINGS_SAVE_FAILED');
    }

    const context = await this.resolveActiveBusinessContext(businessId);
    const resolvedBusinessId = context.businessId;

    const { error: profileError } = await this.supabaseClient
      .from('profiles')
      .update({
        first_name: settings.firstName ?? '',
        last_name: settings.lastName ?? '',
        phone: settings.phone ?? ''
      })
      .eq('id', context.ownerId);

    if (profileError) {
      throw this.failLoad('No se pudo guardar el perfil.', 'PROFILE_SAVE_FAILED');
    }

    // Update businesses table
    if (settings.businessName) {
      const { error: businessUpdateError } = await this.supabaseClient
        .from('businesses')
        .update({ name: settings.businessName })
        .eq('id', resolvedBusinessId);

      if (businessUpdateError) {
        throw new BusinessSettingsPersistenceError(
          'No se pudo actualizar el negocio. Los cambios no fueron guardados.',
          'BUSINESS_UPDATE_FAILED'
        );
      }

      const cached = getBranchContextService().peekSessionBusinessIdentity();
      if (cached && cached.businessId === resolvedBusinessId) {
        getBranchContextService().rememberSessionBusinessIdentity({
          ...cached,
          name: settings.businessName
        });
      }
    }

    // Update business_settings table
    const { error } = await this.supabaseClient
      .from('business_settings')
      .upsert({
        business_id: resolvedBusinessId,
        support_email: settings.supportEmail,
        buffer_minutes: settings.bufferMinutes,
        min_notice_minutes: settings.minNoticeMinutes,
        slot_interval_minutes: settings.slotIntervalMinutes,
        working_hours: settings.workingHours,
        business_type: settings.businessType,
        cancellation_window_minutes: settings.cancelationGracePeriod,
        auto_confirm: settings.autoConfirm,
        max_advance_days: settings.maxAdvanceDays,
        capacity: settings.capacity,
        allow_client_professional_selection: settings.allowClientProfessionalSelection ?? false,
        deposit_enabled: settings.depositEnabled ?? false,
        deposit_percent: settings.depositPercent ?? 0,
        deposit_alias: settings.depositAlias ?? '',
        deposit_cbu: settings.depositCbu ?? ''
      });

    if (error) {
      throw new BusinessSettingsPersistenceError(
        'No se pudo guardar la configuración. Los cambios locales se mantienen sin confirmar.',
        'SETTINGS_SAVE_FAILED'
      );
    }

    this.invalidate();
    await this.loadFromSupabase(resolvedBusinessId, true);
    return { source: 'supabase' };
  }

  async save(businessId: string, settings: Partial<BusinessSettings>): Promise<{ source: string }> {
    return this.saveToSupabase(businessId, settings);
  }

  getSnapshot(): BusinessSettings | null {
    return this.currentSettings();
  }

  lastPersistenceError(): string | null {
    return this.persistenceError();
  }

  async getActiveBusinessId(candidateBusinessOrUserId?: string): Promise<string> {
    return (await this.resolveActiveBusinessContext(candidateBusinessOrUserId)).businessId;
  }

  private async resolveActiveBusinessContext(candidateBusinessOrUserId?: string): Promise<ActiveBusinessContext> {
    if (!this.supabaseClient) {
      throw new BusinessSettingsPersistenceError('No se pudo conectar con el servidor.', 'BUSINESS_NOT_FOUND');
    }

    const { data: { session } } = await this.supabaseClient.auth.getSession();
    const ownerId = session?.user?.id ?? this.authService.user()?.id;

    if (!ownerId) {
      throw new BusinessSettingsPersistenceError('No se encontró sesión de usuario.', 'AUTH_REQUIRED');
    }

    const preferredBusinessId = this.activeBusinessId() ?? localStorage.getItem(ACTIVE_BUSINESS_STORAGE_KEY) ?? candidateBusinessOrUserId;
    const branchContext = getBranchContextService();
    let cached = branchContext.peekSessionBusinessIdentity();
    if (!cached) {
      await branchContext.getActiveBusinessId();
      cached = branchContext.peekSessionBusinessIdentity();
    }
    if (
      cached
      && cached.ownerId === ownerId
      && (!preferredBusinessId || preferredBusinessId === cached.businessId || preferredBusinessId === ownerId)
    ) {
      this.activeBusinessId.set(cached.businessId);
      localStorage.setItem(ACTIVE_BUSINESS_STORAGE_KEY, cached.businessId);
      return {
        businessId: cached.businessId,
        ownerId,
        slug: cached.slug,
        name: cached.name
      };
    }

    const { data: ownedBusinesses, error } = await this.supabaseClient
      .from('businesses')
      .select('id, owner_id, slug, name')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new BusinessSettingsPersistenceError('No se pudo resolver el negocio activo.', 'BUSINESS_NOT_FOUND');
    }

    const businesses = (ownedBusinesses ?? []) as Array<{ id: string; owner_id?: string; slug?: string; name?: string }>;
    const resolved = businesses.find(business => business.id === preferredBusinessId)
      ?? businesses.find(business => business.id === candidateBusinessOrUserId)
      ?? businesses[0];

    if (!resolved?.id) {
      throw new BusinessSettingsPersistenceError('No se encontró un negocio activo para la sesión.', 'BUSINESS_NOT_FOUND');
    }

    this.activeBusinessId.set(resolved.id);
    localStorage.setItem(ACTIVE_BUSINESS_STORAGE_KEY, resolved.id);
    getBranchContextService().rememberSessionBusinessIdentity({
      ownerId,
      businessId: resolved.id,
      slug: resolved.slug,
      name: resolved.name
    });

    return { businessId: resolved.id, ownerId, slug: resolved.slug, name: resolved.name };
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

  private failLoad(
    message: string,
    code: BusinessSettingsPersistenceError['code']
  ): BusinessSettingsPersistenceError {
    const error = new BusinessSettingsPersistenceError(message, code);
    this.persistenceError.set(error.message);
    return error;
  }

  private mapToSettings(business: any, settings: any, profile?: any): BusinessSettings {
    const defaultHours = this.getDefaultWorkingHours();
    const formDefaults = mapNullableSettingsToFormDefaults(settings, defaultHours);
    return {
      businessName: business.name || '',
      slug: business.slug || '',
      bufferMinutes: settings?.buffer_minutes ?? DEFAULT_BOOKING_POLICY.bufferMinutes,
      minNoticeMinutes: settings?.min_notice_minutes ?? DEFAULT_BOOKING_POLICY.minNoticeMinutes,
      slotIntervalMinutes: settings?.slot_interval_minutes ?? DEFAULT_BOOKING_POLICY.slotIntervalMinutes,
      workingHours: formDefaults.workingHours,
      logoUrl: settings?.logo_url,
      coverUrl: settings?.cover_url,
      brandColor: settings?.brand_color,
      whatsapp: settings?.whatsapp,
      instagram: settings?.instagram,
      supportEmail: settings?.support_email,
      businessType: settings?.business_type ?? business?.business_type ?? business?.tipo_negocio ?? '',
      plan: this.resolveDisplayPlan(),
      cancelationGracePeriod: formDefaults.cancelationGracePeriod,
      autoConfirm: settings?.auto_confirm,
      maxAdvanceDays: formDefaults.maxAdvanceDays,
      allowMultipleServices: settings?.allow_multiple_services,
      cleanupTimeMinutes: formDefaults.cleanupTimeMinutes,
      capacity: formDefaults.capacity,
      allowClientProfessionalSelection: settings?.allow_client_professional_selection ?? false,
      depositEnabled: settings?.deposit_enabled ?? false,
      depositPercent: Number(settings?.deposit_percent ?? 0),
      depositAmountPesos: settings?.deposit_amount_pesos == null ? null : Number(settings.deposit_amount_pesos),
      depositAlias: settings?.deposit_alias ?? '',
      depositCbu: settings?.deposit_cbu ?? '',
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
    if (!this.supabaseClient) {
      emitPublicBookingFailureEvent({ stage: 'resolver', code: 'CONFIG_ERROR', status: 500 });
      return { status: 500, error: { code: 'CONFIG_ERROR', message: 'Supabase not configured' } };
    }

    try {
      const normalizedSlug = normalizePublicBookingSlug(businessSlug);

      if (!isValidPublicBookingSlug(normalizedSlug)) {
        return { status: 422, error: { code: 'VALIDATION_ERROR', message: 'Invalid booking link.' } };
      }

      const { data, error } = await this.supabaseClient.rpc('resolve_business_by_slug', {
        business_slug: normalizedSlug
      });

      if (error) {
        const errorCode = typeof error.code === 'string' ? error.code : '';
        const errorMessage = typeof error.message === 'string' ? error.message : '';

        if (errorCode === 'BUSINESS_NOT_FOUND' || errorMessage.includes('BUSINESS_NOT_FOUND')) {
          return {
            status: 404,
            error: {
              code: 'BUSINESS_NOT_FOUND',
              message: `Business not found for slug: ${businessSlug}`
            }
          };
        }

        emitPublicBookingFailureEvent({ stage: 'resolver', code: 'PUBLIC_RESOLVER_UNAVAILABLE', status: 503 });
        return {
          status: 503,
          error: {
            code: 'PUBLIC_RESOLVER_UNAVAILABLE',
            message: 'Public booking is temporarily unavailable.'
          }
        };
      }

      if (!data) {
        return {
          status: 404,
          error: {
            code: 'BUSINESS_NOT_FOUND',
            message: `Business not found for slug: ${businessSlug}`
          }
        };
      }

      return {
        status: 200,
        data: this.mapToPublicView(data)
      };
    } catch {
      emitPublicBookingFailureEvent({ stage: 'resolver', code: 'PUBLIC_RESOLVER_UNAVAILABLE', status: 503 });
      return {
        status: 503,
        error: { code: 'PUBLIC_RESOLVER_UNAVAILABLE', message: 'Public booking is temporarily unavailable.' }
      };
    }
  }

  private mapToPublicView(record: any): BusinessPublicView {
    const settings = record?.settings ?? {};
    const bookingPolicy = record?.bookingPolicy ?? record?.booking_policy ?? {};

    return {
      id: record.id,
      slug: record.slug,
      displayName: record.name,
      timezone: record.timezone || DEFAULT_BOOKING_POLICY.timezone,
      settings: {
        bufferMinutes: settings?.bufferMinutes ?? settings?.buffer_minutes ?? DEFAULT_BOOKING_POLICY.bufferMinutes,
        minNoticeMinutes: settings?.minNoticeMinutes ?? settings?.min_notice_minutes ?? DEFAULT_BOOKING_POLICY.minNoticeMinutes,
        slotIntervalMinutes: settings?.slotIntervalMinutes ?? settings?.slot_interval_minutes ?? DEFAULT_BOOKING_POLICY.slotIntervalMinutes,
        maxAdvanceDays: settings?.maxAdvanceDays ?? settings?.max_advance_days ?? 30,
        workingHours: resolveWorkingHours(
          settings?.workingHours ?? settings?.working_hours,
          this.getDefaultWorkingHours()
        ),
        depositEnabled: settings?.depositEnabled ?? settings?.deposit_enabled ?? false,
        depositPercent: Number(settings?.depositPercent ?? settings?.deposit_percent ?? 0)
      },
      bookingPolicy: {
        autoConfirm: bookingPolicy?.autoConfirm ?? bookingPolicy?.auto_confirm ?? true,
        cancellationWindowMinutes: bookingPolicy?.cancellationWindowMinutes ?? bookingPolicy?.cancellation_window_minutes ?? DEFAULT_BOOKING_POLICY.cancellationWindowMinutes,
        allowClientProfessionalSelection: bookingPolicy?.allowClientProfessionalSelection ?? bookingPolicy?.allow_client_professional_selection ?? false
      }
    };
  }
}
