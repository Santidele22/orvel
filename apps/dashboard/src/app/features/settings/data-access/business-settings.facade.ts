import { Injectable, signal, inject } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadDashboardRuntimeEnv } from '../../../core/runtime/dashboard-env';
import { AuthService } from '../../../services/auth.service';
import { isAllowedOnboardingBusinessType } from '../../onboarding/data-access/business-type-defaults';

export type WeekdayKey =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export type WorkingDayHours = {
  enabled: boolean;
  start: string;
  end: string;
};

export type BusinessSettingsState = {
  businessName: string;
  slug: string;
  bufferMinutes: number;
  minNoticeMinutes: number;
  slotIntervalMinutes: number;
  workingHours: Record<WeekdayKey, WorkingDayHours>;
  
  // Visual Identity
  logoUrl?: string;
  coverUrl?: string;
  brandColor?: string;

  // Contact Info
  whatsapp?: string;
  instagram?: string;
  supportEmail?: string;

  // Subscription
  plan: 'basic' | 'zen' | 'pro';

  // Booking Policies
  cancelationGracePeriod?: number; // hours
  autoConfirm: boolean;
  maxAdvanceDays: number;

  // Logistics
  allowMultipleServices: boolean;
  cleanupTimeMinutes: number;
  capacity: number; // Employee count for bookings (min 1)

  // Regional
  weekStartDay: 'monday' | 'sunday';
  timeFormat: '12h' | '24h';

  // User Profile (Personal)
  firstName?: string;
  lastName?: string;
  phone?: string;
  
  updatedAt: string;
};

type BusinessSettingsSupabaseRow = {
  id?: string;
  business_id?: string;
  business_name?: string;
  buffer_minutes?: number;
  min_notice_minutes?: number;
  slot_interval_minutes?: number;
  working_hours?: Record<WeekdayKey, WorkingDayHours>;
  
  // Visual Identity
  logo_url?: string;
  cover_url?: string;
  brand_color?: string;

  // Contact Info
  whatsapp?: string;
  instagram?: string;
  support_email?: string;

  // Subscription
  plan?: 'basic' | 'zen' | 'pro';

  // Booking Policies
  cancelation_grace_period?: number;
  auto_confirm?: boolean;
  max_advance_days?: number;

  // Logistics
  allow_multiple_services?: boolean;
  cleanup_time_minutes?: number;
  capacity?: number; // Employee count for bookings

  // Regional
  week_start_day?: 'monday' | 'sunday';
  time_format?: '12h' | '24h';

  // Row mapping for Profile (from join or separate query)
  first_name?: string;
  last_name?: string;
  profile_phone?: string;

  slug?: string;
  updated_at?: string;
};

export type PersistedSettingsIdentity = {
  id: string;
  businessId: string;
  updatedAt: string;
  source: string;
};

const DEFAULT_WORKING_HOURS: Record<WeekdayKey, WorkingDayHours> = {
  monday: { enabled: true, start: '09:00', end: '18:00' },
  tuesday: { enabled: true, start: '09:00', end: '18:00' },
  wednesday: { enabled: true, start: '09:00', end: '18:00' },
  thursday: { enabled: true, start: '09:00', end: '18:00' },
  friday: { enabled: true, start: '09:00', end: '18:00' },
  saturday: { enabled: true, start: '10:00', end: '14:00' },
  sunday: { enabled: false, start: '00:00', end: '00:00' }
};

@Injectable({ providedIn: 'root' })
export class BusinessSettingsFacade {
  private readonly STORAGE_KEY = 'atelier_business_settings';
  private readonly settings = signal<BusinessSettingsState | null>(this.loadFromStorage());
  private readonly syncing = signal(false);
  private readonly persistenceError = signal<string | null>(null);
  private readonly authService = inject(AuthService);
  private supabaseClient?: SupabaseClient;

  readonly state = this.settings.asReadonly();

  save(payload: Omit<BusinessSettingsState, 'updatedAt'>): BusinessSettingsState {
    const persisted: BusinessSettingsState = {
      ...payload,
      updatedAt: new Date().toISOString()
    };

    this.settings.set(persisted);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(persisted));
    return persisted;
  }

  getSnapshot(): BusinessSettingsState | null {
    return this.settings();
  }

  getDefaultWorkingHours(): Record<WeekdayKey, WorkingDayHours> {
    return structuredClone(DEFAULT_WORKING_HOURS);
  }

  syncFormState(): BusinessSettingsState {
    const snapshot = this.settings() ?? this.loadFromStorage();
    if (snapshot) {
      this.settings.set(snapshot);
      return snapshot;
    }

    const fallback = this.buildDefaultState();
    this.settings.set(fallback);
    return fallback;
  }

  lastPersistenceError(): string | null {
    return this.persistenceError();
  }

  isSyncing(): boolean {
    return this.syncing();
  }

  /**
   * Asegura que el usuario administrador tenga un perfil en la tabla public.profiles
   */
  private async ensureUserProfile(userId: string, data: { nombre?: string, apellido?: string }) {
    const supabase = this.getSupabaseClient();
    if (!supabase) return;
    
    // Check if profile exists
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single();

    if (!profile) {
      console.log(`[Facade] Creating NEW profile for user: ${userId}`);
      await supabase
        .from('profiles')
        .insert({
          id: userId,
          first_name: data.nombre || '',
          last_name: data.apellido || '',
          updated_at: new Date().toISOString()
        });
    }
  }

  async loadFromSupabase(businessId: string): Promise<BusinessSettingsState & PersistedSettingsIdentity> {
    this.syncing.set(true);
    this.persistenceError.set(null);

    try {
      const supabase = this.getSupabaseClient();
      if (supabase) {
        // Auto-Onboarding: Asegurar que el registro del negocio existe
        await this.ensureBusinessRecord(supabase, businessId);

        // DB-FIX: Sincronizar perfiles para que "Usuarios" (dueños) existan en el esquema público
        const user = this.authService.user();
        if (user) {
          await this.ensureUserProfile(businessId, { 
            nombre: user.nombre, 
            apellido: user.apellido 
          });
        }

        const { data, error } = await supabase
          .from('business_settings')
          .select('*')
          .eq('business_id', businessId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!error && data) {
          const row = data as BusinessSettingsSupabaseRow;
          
          // También cargar el slug desde la tabla businesses Y el perfil desde profiles
          // OJO: Podríamos usar un JOIN pero para máxima compatibilidad y robustez hacemos consultas paralelas o secuenciales
          const { data: bizData } = await supabase
            .from('businesses')
            .select('slug')
            .eq('id', businessId)
            .maybeSingle();

          const { data: profileData } = await supabase
            .from('profiles')
            .select('first_name, last_name, phone')
            .eq('id', businessId) // El id del perfil es el mismo que businessId/userId en este sistema
            .maybeSingle();

          if (profileData) {
            row.first_name = profileData.first_name;
            row.last_name = profileData.last_name;
            row.profile_phone = profileData.phone;
          }

          const persisted = this.mapFromSupabaseRow(row, businessId, bizData?.slug);
          this.settings.set(persisted);
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(persisted));
          return {
            ...persisted,
            id: String((data as BusinessSettingsSupabaseRow).id ?? businessId),
            businessId,
            source: 'supabase'
          };
        }

        if (error) {
          this.persistenceError.set(error.message);
        }
      }

      // Explicit fallback: Supabase unavailable/offline/timeout -> localStorage snapshot.
      const fallbackState = this.settings() ?? this.loadFromStorage() ?? this.buildDefaultState();
      this.settings.set(fallbackState);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(fallbackState));
      return {
        ...fallbackState,
        id: businessId,
        businessId,
        source: 'local-fallback'
      };
    } catch (error) {
      this.persistenceError.set(this.extractErrorMessage(error));
      const fallbackState = this.settings() ?? this.loadFromStorage() ?? this.buildDefaultState();
      this.settings.set(fallbackState);
      return {
        ...fallbackState,
        id: businessId,
        businessId,
        source: 'local-fallback'
      };
    } finally {
      this.syncing.set(false);
    }
  }

  async saveToSupabase(
    businessId: string,
    payload: Omit<BusinessSettingsState, 'updatedAt'>
  ): Promise<PersistedSettingsIdentity> {
    this.syncing.set(true);
    this.persistenceError.set(null);

    try {
      const persistedLocal = this.save(payload);
      const supabase = this.getSupabaseClient();

      if (supabase) {
        // Ensure business record exists before saving (critical for first-time saves)
        // Pass the NEW businessName from payload, not the old auth name
        await this.ensureBusinessRecord(supabase, businessId, persistedLocal.businessName);

        const savePayload = {
          business_id: businessId,
          business_name: persistedLocal.businessName,
          buffer_minutes: persistedLocal.bufferMinutes,
          min_notice_minutes: persistedLocal.minNoticeMinutes,
          slot_interval_minutes: persistedLocal.slotIntervalMinutes,
          working_hours: persistedLocal.workingHours,

          logo_url: persistedLocal.logoUrl,
          cover_url: persistedLocal.coverUrl,
          brand_color: persistedLocal.brandColor,
          whatsapp: persistedLocal.whatsapp,
          instagram: persistedLocal.instagram,
          support_email: persistedLocal.supportEmail,
          plan: persistedLocal.plan,
          capacity: persistedLocal.capacity >= 1 ? persistedLocal.capacity : 1,
          cancelation_grace_period: persistedLocal.cancelationGracePeriod,
          auto_confirm: persistedLocal.autoConfirm,
          max_advance_days: persistedLocal.maxAdvanceDays,
          allow_multiple_services: persistedLocal.allowMultipleServices,
          cleanup_time_minutes: persistedLocal.cleanupTimeMinutes,
          week_start_day: persistedLocal.weekStartDay,
          time_format: persistedLocal.timeFormat,

          updated_at: persistedLocal.updatedAt,
          slug: persistedLocal.slug || this.generateSlugFromName(persistedLocal.businessName)
        };

        // 1. SIEMPRE intentar actualizar el nombre y slug en la tabla principal 'businesses'
        // Lo hacemos PRIMERO para asegurar la identidad del negocio y la URL de booking.
        // NOTA: Un TRIGGER en la base de datos (fn_sync_business_identity) se encargará de
        // propagar estos cambios a 'business_settings' automáticamente, asegurando coherencia total.
        const slugToSync = savePayload.slug;
        console.log(`[Facade] Identity Sync: Updating businesses table for ${businessId}...`, { slug: slugToSync, name: persistedLocal.businessName });
        
        const { error: bizUpdateError } = await supabase
          .from('businesses')
          .update({ 
            slug: slugToSync, 
            name: persistedLocal.businessName,
            updated_at: new Date().toISOString()
          })
          .eq('id', businessId);
        
        if (bizUpdateError) {
          console.error('[Facade] Identity Sync Error (businesses table):', bizUpdateError);
          // OJO: Si falla la tabla principal, es un error crítico para el SEO/Booking
          // pero permitimos que intente guardar los settings para no perder cambios locales
        } else {
          console.log('[Facade] Identity Sync Success: businesses table updated.');
        }

        // 1b. Sincronizar PERFIL PERSONAL en 'profiles'
        console.log(`[Facade] Profile Sync: Updating profiles table for ${businessId}...`);
        const { error: profileUpdateError } = await supabase
          .from('profiles')
          .update({
            first_name: persistedLocal.firstName,
            last_name: persistedLocal.lastName,
            phone: persistedLocal.phone,
            updated_at: new Date().toISOString()
          })
          .eq('id', businessId);
        
        if (profileUpdateError) {
          console.error('[Facade] Profile Sync Error (profiles table):', profileUpdateError);
        }

        // 2. Intentar guardar el resto de la configuración en 'business_settings'
        // Nos aseguramos de enviar los datos que el usuario editó
        console.log(`[Facade] Settings Save: Upserting to business_settings for ${businessId}...`);
        const { data, error } = await supabase
          .from('business_settings')
          .upsert(savePayload, { onConflict: 'business_id' })
          .select('business_id, updated_at, business_name, slug')
          .maybeSingle();

        if (error) {
          console.error('❌ [Facade] CRITICAL: Error saving to business_settings table:', error);
          this.persistenceError.set(error.message);
          
          return {
            id: businessId,
            businessId,
            updatedAt: persistedLocal.updatedAt,
            source: 'error-supabase-settings'
          };
        }

        console.log('[Facade] Settings Save Success: business_settings updated.');
        const row = data as BusinessSettingsSupabaseRow;
        
        // Actualizamos el signal local con lo que realmente quedó en DB
        const finalSlug = row?.slug || slugToSync;
        const finalName = row?.business_name || persistedLocal.businessName;
        
        this.settings.update(s => s ? { ...s, businessName: finalName, slug: finalSlug } : s);

        return {
          id: businessId,
          businessId: String(row?.business_id ?? businessId),
          updatedAt: String(row?.updated_at ?? persistedLocal.updatedAt),
          source: 'supabase'
        };
      }


      return {
        id: businessId,
        businessId,
        updatedAt: persistedLocal.updatedAt,
        source: 'remote-fallback-local-storage'
      };
    } catch (error) {
      this.persistenceError.set(this.extractErrorMessage(error));
      return {
        id: businessId,
        businessId,
        updatedAt: new Date().toISOString(),
        source: 'remote-fallback-local-storage'
      };
    } finally {
      this.syncing.set(false);
    }
  }

  private async ensureBusinessRecord(supabase: SupabaseClient, businessId: string, businessName?: string): Promise<void> {
    const authUser = this.authService.user();
    if (!businessName && !this.hasCompletedMandatoryOnboarding()) {
      console.warn('[Facade] Skipping business auto-repair because onboardingCompleted, plan or businessType metadata is incomplete. Redirecting to /auth/onboarding is required.');
      return;
    }

    // 1. First, check if the record already exists
    const { data: existing, error: fetchError } = await supabase
      .from('businesses')
      .select('id, name, slug')
      .eq('id', businessId)
      .maybeSingle();

    if (fetchError) {
      console.error('[Facade] Error checking for existing business record:', fetchError);
      return;
    }

    // 2. If it exists, ensure business_settings also exists (auto-repair for partial data)
    if (existing) {
      console.log(`[Facade] Business record already exists for ${businessId}: "${existing.name}" (${existing.slug})`);
      
      // Still ensure business_settings exists (can happen if businesses table was partially populated)
      await this.ensureBusinessSettings(supabase, businessId, existing.slug, existing.name);
      return;
    }

    // 3. Only if it doesn't exist, create it with the persisted onboarding identity.
    const name = businessName || authUser?.negocioNombre || `Negocio ${businessId}`;
    const slug = this.generateSlugFromName(name);

    console.log(`[Facade] Creating NEW business record: ${businessId} (${slug}) - "${name}"`);
    
    // DB-FIX: Sincronizar con el owner_id para formalizar la propiedad
    const { error: insertError } = await supabase
      .from('businesses')
      .insert({
        id: businessId,
        slug: slug,
        name: name,
        timezone: 'America/Argentina/Buenos_Aires',
        owner_id: businessId // Usamos el ID del usuario como propietario inicial
      });
    
    if (insertError) {
      console.error('[Facade] Failed to create business record:', insertError);
    } else {
      console.log('[Facade] Business record created successfully');
      
      // DB-FIX: Sincronizar perfiles para que "Usuarios" existan en el esquema público
      await this.ensureUserProfile(businessId, { 
        nombre: name.split(' ')[0], 
        apellido: name.split(' ').slice(1).join(' ') 
      });

      // Now ensure default settings exist for this new business
      await this.ensureBusinessSettings(supabase, businessId, slug, name);
    }
  }

  private async ensureBusinessSettings(supabase: SupabaseClient, businessId: string, slug: string, businessName: string): Promise<void> {
    // Check if settings exist
    const { data: existing, error: fetchError } = await supabase
      .from('business_settings')
      .select('business_id')
      .eq('business_id', businessId)
      .maybeSingle();

    if (fetchError) {
      console.error('[Facade] Error checking for existing business settings:', fetchError);
      return;
    }

    if (!existing) {
      console.log(`[Facade] Creating default settings for business: ${businessId}`);
      // Create default settings
      const defaultHours = structuredClone(DEFAULT_WORKING_HOURS);
      const { error } = await supabase
        .from('business_settings')
        .insert({
          business_id: businessId,
          slug: slug,
          business_name: businessName,
          working_hours: defaultHours,
          buffer_minutes: 15,
          min_notice_minutes: 120,
          slot_interval_minutes: 30,
          capacity: 1,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('[Facade] Failed to create business_settings:', error);
      } else {
        console.log('[Facade] Business settings created with defaults');
      }
    }
  }

  private loadFromStorage(): BusinessSettingsState | null {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  private getSupabaseClient(): SupabaseClient | null {
    try {
      if (!this.supabaseClient) {
        const env = loadDashboardRuntimeEnv();
        this.supabaseClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
      }
      return this.supabaseClient;
    } catch {
      return null;
    }
  }

  private mapFromSupabaseRow(row: BusinessSettingsSupabaseRow, businessId: string, slug?: string): BusinessSettingsState {
    const user = this.authService.user();
    const fallbackName = user?.negocioNombre || `Negocio ${businessId}`;
    const fallbackSlug = this.generateSlugFromName(fallbackName);

    return {
      businessName: (row.business_name && row.business_name.trim()) ? row.business_name : fallbackName,
      slug: slug || fallbackSlug,
      bufferMinutes: Number.isFinite(row.buffer_minutes) ? Number(row.buffer_minutes) : 10,
      minNoticeMinutes: Number.isFinite(row.min_notice_minutes) ? Number(row.min_notice_minutes) : 120,
      slotIntervalMinutes: Number.isFinite(row.slot_interval_minutes) ? Number(row.slot_interval_minutes) : 30,
      workingHours: row.working_hours ?? structuredClone(DEFAULT_WORKING_HOURS),
      
      logoUrl: row.logo_url ?? '',
      coverUrl: row.cover_url ?? '',
      brandColor: row.brand_color ?? '#2F7D6B',
      whatsapp: row.whatsapp ?? '',
      instagram: row.instagram ?? '',
      supportEmail: row.support_email ?? '',
      plan: row.plan ?? 'zen',
      cancelationGracePeriod: row.cancelation_grace_period ?? 24,
      autoConfirm: row.auto_confirm ?? true,
      maxAdvanceDays: row.max_advance_days ?? 90,
      allowMultipleServices: row.allow_multiple_services ?? true,
      cleanupTimeMinutes: row.cleanup_time_minutes ?? 0,
      capacity: (row.capacity !== undefined && Number.isFinite(row.capacity) && row.capacity >= 1) ? Number(row.capacity) : 1,
      weekStartDay: row.week_start_day ?? 'monday',
      timeFormat: row.time_format ?? '12h',

      // Profile Fields
      firstName: row.first_name ?? user?.nombre ?? '',
      lastName: row.last_name ?? user?.apellido ?? '',
      phone: row.profile_phone ?? user?.telefono ?? '',
      
      updatedAt: String(row.updated_at ?? new Date().toISOString())
    };
  }

  private buildDefaultState(): BusinessSettingsState {
    const user = this.authService.user();
    const name = user?.negocioNombre || 'Completar onboarding';
    return {
      businessName: name,
      slug: this.generateSlugFromName(name),
      bufferMinutes: 10,
      minNoticeMinutes: 120,
      slotIntervalMinutes: 30,
      workingHours: structuredClone(DEFAULT_WORKING_HOURS),
      brandColor: '#2F7D6B',
      plan: 'zen',
      autoConfirm: true,
      maxAdvanceDays: 90,
      allowMultipleServices: true,
      cleanupTimeMinutes: 0,
      capacity: 1,
      weekStartDay: 'monday',
      timeFormat: '12h',

      // Profile Fallbacks
      firstName: user?.nombre ?? '',
      lastName: user?.apellido ?? '',
      phone: user?.telefono ?? '',

      updatedAt: new Date().toISOString()
    };
  }

  private generateSlugFromName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .normalize('NFD')                     // Eliminar acentos
      .replace(/[\u0300-\u036f]/g, '')      // Eliminar acentos
      .replace(/[^a-z0-9]+/g, '-')         // Reemplazar caracteres no alfanuméricos por guiones
      .replace(/^-+|-+$/g, '') || 'mi-salon'; // Eliminar guiones al inicio/final o fallback
  }

  private hasCompletedMandatoryOnboarding(): boolean {
    const user = this.authService.user();
    const plan = String(user?.plan ?? '').trim().toUpperCase();
    const hasPersistedPlan = ['STARTER', 'GROWTH', 'PRO', 'BASIC', 'MEDIUM', 'FREE'].includes(plan) && plan !== 'FREE';
    return Boolean(user?.negocioNombre?.trim()) && hasPersistedPlan && isAllowedOnboardingBusinessType(user?.tipoNegocio);
  }

  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    return 'Unknown persistence error';
  }
}
