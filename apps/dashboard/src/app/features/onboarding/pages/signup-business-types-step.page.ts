/**
 * Signup Business Types Step Page - Pure Business Logic
 *
 * Contains the pure class without Angular dependencies.
 * This file can be imported by tests without Angular compilation.
 */
import type { PlanCode } from '../../../core/plans/plan-entitlements';
import { normalizePlanCode } from '../../../core/plans/plan-entitlements';
import {
  getAllowedBusinessTypesForPlan,
  getPlanEntitlementsFromCatalog,
  resolveBusinessTypeCodeFromCatalog
} from '../../../core/catalog/reference-catalog';
import { getRuntimeReferenceCatalogSnapshot } from '../../../core/catalog/reference-catalog.gateway';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG } from '../../../core/auth/supabase-config';
import {
  type BusinessTypeCode,
  ONBOARDING_BUSINESS_TYPES_STORAGE_KEY,
  persistBusinessTypes,
  readBusinessTypes
} from '../data-access/onboarding-business-types-storage';
import { readPlanSelection } from '../data-access/onboarding-plan-storage';
import {
  buildInitialBusinessSettingsForOnboarding,
  isAllowedOnboardingBusinessType,
  type OnboardingBusinessType
} from '../data-access/business-type-defaults';
import {
  ONBOARDING_DASHBOARD_CUE_KEY,
  markWelcomeEmailTriggeredOnce,
  setCurrentStep
} from '../data-access/onboarding-flow-state';

// All available business types
export type BusinessType = {
  code: BusinessTypeCode;
  label: string;
};

// Storage key for test injection
const TEST_STORAGE_KEY = '__test_storage__';
const LEGACY_CREDENTIALS_STORAGE_KEY = 'turnea.onboarding.credentials';
const CREDENTIALS_STORAGE_KEY = 'turnea.onboarding.credentials.v1';
const REFERENCE_CATALOG = getRuntimeReferenceCatalogSnapshot();

type OnboardingCompletionInput = {
  plan: PlanCode | null;
  businessType: BusinessTypeCode;
  storage: Pick<Storage, 'getItem'>;
};

type OnboardingCompletionHandler = (input: OnboardingCompletionInput) => Promise<boolean>;

function mapToPersistedBusinessType(type: BusinessTypeCode): OnboardingBusinessType | null {
  const normalized = toBusinessTypeCode(type);
  return normalized && isAllowedOnboardingBusinessType(normalized) ? (normalized as OnboardingBusinessType) : null;
}

function toBusinessTypeCode(code: unknown): BusinessTypeCode | null {
  const resolved = resolveBusinessTypeCodeFromCatalog(REFERENCE_CATALOG, code);
  return resolved ? (resolved.toLowerCase() as BusinessTypeCode) : null;
}

function allowedBusinessTypeCodesForPlan(plan: PlanCode | null): BusinessTypeCode[] {
  return getAllowedBusinessTypesForPlan(REFERENCE_CATALOG, plan ?? 'STARTER')
    .map((type) => toBusinessTypeCode(type.code))
    .filter((code): code is BusinessTypeCode => code !== null);
}

function readBusinessName(storage: Pick<Storage, 'getItem'>): string {
  for (const key of [CREDENTIALS_STORAGE_KEY, LEGACY_CREDENTIALS_STORAGE_KEY]) {
    const raw = storage.getItem(key);
    if (!raw) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const value = parsed['business_name'] ?? parsed['businessName'] ?? parsed['negocioNombre'];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    } catch {
      // Ignore malformed local onboarding drafts.
    }
  }

  return 'Turnea Business';
}

export function createSupabaseOnboardingCompletionHandler(): OnboardingCompletionHandler {
  const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
    auth: {
      flowType: 'pkce',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined
    }
  });

  return async ({ plan, businessType, storage }) => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const session = sessionData?.session;
    if (sessionError || !session?.access_token || !session.user?.id) {
      return false;
    }

    const persistedBusinessType = mapToPersistedBusinessType(businessType);
    if (!persistedBusinessType) {
      return false;
    }

    const canonicalPlan = normalizePlanCode(plan);
    const businessName = readBusinessName(storage);
    const defaults = buildInitialBusinessSettingsForOnboarding({
      businessId: session.user.id,
      businessName,
      businessType: persistedBusinessType,
      plan: canonicalPlan
    });

    const { error: businessError } = await supabase
      .from('businesses')
      .upsert(
        {
          id: defaults.businessId,
          slug: defaults.slugSeed,
          name: defaults.businessName,
          timezone: 'America/Argentina/Buenos_Aires',
          capacity: defaults.capacity,
          owner_id: defaults.businessId
        },
        { onConflict: 'id' }
      );

    if (businessError) {
      return false;
    }

    const { error: settingsError } = await supabase
      .from('business_settings')
      .upsert(
        {
          business_id: defaults.businessId,
          business_name: defaults.businessName,
          slug: defaults.slugSeed,
          plan: defaults.plan.toLowerCase(),
          capacity: defaults.capacity,
          buffer_minutes: defaults.bufferMinutes,
          min_notice_minutes: defaults.minNoticeMinutes,
          slot_interval_minutes: defaults.slotIntervalMinutes,
          working_hours: defaults.workingHours,
          updated_at: defaults.updatedAt
        },
        { onConflict: 'business_id' }
      );

    if (settingsError) {
      return false;
    }

    const { error: metadataError } = await supabase.auth.updateUser({
      data: {
        onboardingCompleted: true,
        onboarding_completed: true,
        plan: defaults.plan,
        tipoNegocio: defaults.businessType,
        businessType: defaults.businessType,
        business_type: defaults.businessType
      }
    });

    return !metadataError;
  };
}

/**
 * Gets test storage from globalThis (vitest pattern)
 */
function getTestStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  try {
    const testStorage = (globalThis as Record<string, unknown>)[TEST_STORAGE_KEY];
    if (testStorage && typeof testStorage === 'object') {
      return testStorage as Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
    }
  } catch {
    // Ignore access errors
  }
  return null;
}

/**
 * Sets the test storage
 */
export function setTestStorage(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null): void {
  if (storage) {
    (globalThis as Record<string, unknown>)[TEST_STORAGE_KEY] = storage;
  } else {
    delete (globalThis as Record<string, unknown>)[TEST_STORAGE_KEY];
  }
}

/**
 * Signup Business Types Step Page - Pure Business Logic Class
 *
 * Step 3 of the onboarding flow - Business Types Selection.
 * User must select 1+ business types allowed by their plan.
 * Plan is selected in Step 1.
 *
 * Flow:
 * 1. Filter available types by plan (Step 1 selection)
 * 2. User selects 1+ business types
 * 3. Real-time UI updates
 * 4. Continue button enabled when 1+ selected
 * 5. On submit, persist all onboarding data
 * 6. Navigate based on plan (FREE→dashboard, paid→billing)
 */
export class SignupBusinessTypesStepPage {
  // Selected types by user
  protected _selectedTypes: BusinessTypeCode[] = [];
  
  // UI state
  protected isLoading = false;
  protected errorMessage = '';
  protected successMessage = '';
  protected showWelcomeModal = false;
  
  // Router reference for navigation
  private routerRef: { navigateByUrl: (url: string) => void } | null = null;
  private onboardingCompletionHandler: OnboardingCompletionHandler | null = null;

  /**
   * Sets the router instance (for testability and production)
   */
  setRouter(router: { navigateByUrl: (url: string) => void }): void {
    this.routerRef = router;
  }

  setOnboardingCompletionHandler(handler: OnboardingCompletionHandler | null): void {
    this.onboardingCompletionHandler = handler;
  }

  /**
   * Gets the selected plan from Step 1
   */
  getSelectedPlan(): PlanCode | null {
    const storage = this.getStorage();
    if (!storage) {
      return 'STARTER'; // Default to canonical starter plan if no storage available
    }
    return readPlanSelection(storage) ?? 'STARTER';
  }

  /**
   * Gets the allowed business types for the selected plan
   * Computed fresh each time - no caching
   */
  get allowedTypes(): BusinessType[] {
    const plan = this.getSelectedPlan();
    
    return getAllowedBusinessTypesForPlan(REFERENCE_CATALOG, plan ?? 'STARTER')
      .map((type): BusinessType | null => {
        const code = toBusinessTypeCode(type.code);
        return code ? { code, label: type.label } : null;
      })
      .filter((type): type is BusinessType => type !== null);
  }

  /**
   * Gets the maximum number of types allowed for current plan
   */
  getMaxTypes(): number {
    const plan = this.getSelectedPlan();
    return getPlanEntitlementsFromCatalog(REFERENCE_CATALOG, plan ?? 'STARTER')?.maxRubros ?? 1;
  }

  /**
   * Gets the selected business types
   */
  get selectedTypes(): BusinessTypeCode[] {
    return [...this._selectedTypes];
  }

  /**
   * Checks if a business type can be selected
   * @param type - The business type code
   */
  canSelect(type: BusinessTypeCode): boolean {
    const plan = this.getSelectedPlan();
    const allowedCodes = allowedBusinessTypeCodesForPlan(plan);
    return allowedCodes.includes(type);
  }

  /**
   * Checks if a business type is currently selected
   * @param type - The business type code
   */
  isTypeSelected(type: BusinessTypeCode): boolean {
    return this._selectedTypes.includes(type);
  }

  /**
   * Toggles a business type selection
   * @param type - The business type code to toggle
   */
  toggleType(type: BusinessTypeCode): void {
    // Cannot select disallowed types
    if (!this.canSelect(type)) {
      return;
    }

    const index = this._selectedTypes.indexOf(type);
    if (index >= 0) {
      // Already selected, remove it
      this._selectedTypes.splice(index, 1);
    } else {
      // Check if we've reached the max limit
      if (this._selectedTypes.length >= this.getMaxTypes()) {
        return; // Cannot select more types
      }
      // Add to selection
      this._selectedTypes.push(type);
    }
  }

  /**
   * Checks if the user can continue to the next step
   */
  canContinue(): boolean {
    if (this.isLoading) {
      return false;
    }
    return this._selectedTypes.length > 0;
  }

  /**
   * Handles the submit action - persists all data and navigates
   */
  submit(): void {
    void this.submitAsync();
  }

  async submitAsync(): Promise<void> {
    if (!this.canContinue()) {
      return;
    }

    const storage = this.getStorage();
    if (!storage) {
      return;
    }

    // Persist business types as a draft only. Completion/navigation requires
    // Supabase updateUser metadata and business_settings upsert to succeed.
    persistBusinessTypes(storage, [...this._selectedTypes]);

    const plan = this.getSelectedPlan();
    const persisted = await this.persistMandatoryOnboarding(storage, plan);
    if (!persisted) {
      return;
    }

    this.successMessage = '¡Todo listo! Tu cuenta fue creada con éxito.';
    this.showWelcomeModal = true;
    setCurrentStep(storage, 'welcome');
    this.triggerWelcomeEmail(storage, plan);
  }

  continueToLogin(): void {
    const storage = this.getStorage();
    if (storage) {
      setCurrentStep(storage, 'login');
      storage.setItem(ONBOARDING_DASHBOARD_CUE_KEY, '1');
    }
    if (this.routerRef) {
      this.routerRef.navigateByUrl('/auth/login');
    }
  }

  private triggerWelcomeEmail(storage: Pick<Storage, 'getItem' | 'setItem'>, plan: PlanCode | null): void {
    if (!markWelcomeEmailTriggeredOnce(storage)) {
      return;
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('onboarding:welcome-email-trigger', {
          detail: {
            source: 'frontend-contract-point',
            plan: normalizePlanCode(plan)
          }
        })
      );
    }
  }

  private async persistMandatoryOnboarding(
    storage: Pick<Storage, 'getItem'>,
    plan: PlanCode | null
  ): Promise<boolean> {
    const businessType = this._selectedTypes[0];
    if (!businessType || !this.onboardingCompletionHandler) {
      return false;
    }

    return this.onboardingCompletionHandler({ plan, businessType, storage });
  }

  /**
   * Handles back navigation to credentials step
   */
  goBack(): void {
    if (this.routerRef) {
      // Navigate to credentials step (signup-credentials)
      this.routerRef.navigateByUrl('/auth/signup/credentials');
    }
  }

  /**
   * Gets storage object - uses window.localStorage mock from test-setup
   */
  protected getStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
    // Use window object which is mocked in test-setup
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage as Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
    }
    return null;
  }

  /**
   * Loads persisted selections from storage
   */
  loadPersistedSelections(): void {
    const storage = this.getStorage();
    if (!storage) {
      return;
    }

    try {
      const stored = readBusinessTypes(storage);
      if (stored && stored.length > 0) {
        // Filter to only allowed types (in case plan changed)
        const plan = this.getSelectedPlan();
        const allowedCodes = allowedBusinessTypeCodesForPlan(plan);
        
        this._selectedTypes = stored.filter((code) => allowedCodes.includes(code));
      }
    } catch {
      // Invalid stored data, ignore
    }
  }

  constructor() {
    // Load persisted selections on init
    this.loadPersistedSelections();
  }
}

/**
 * Read persisted business types from storage
 */
export function readPersistedBusinessTypes(storage: Pick<Storage, 'getItem'>): BusinessTypeCode[] | null {
  return readBusinessTypes(storage);
}

/**
 * Check if plan is selected
 */
export function isPlanSelected(storage: Pick<Storage, 'getItem'>): boolean {
  return readPlanSelection(storage) !== null;
}

/**
 * Get selected plan code from storage
 */
export function getSelectedPlanCode(storage: Pick<Storage, 'getItem'>): PlanCode | null {
  return readPlanSelection(storage);
}
