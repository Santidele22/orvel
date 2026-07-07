/**
 * Signup Business Types Step Page - Pure Business Logic
 *
 * Contains the pure class without Angular dependencies.
 * This file can be imported by tests without Angular compilation.
 */
import { normalizePlanCode, resolveValidPlanCode, type PlanCode } from '../data-access/onboarding-plan-utils';
import {
  type DashboardReferenceCatalog,
  resolveBusinessTypeCodeFromCatalog
} from '../../../core/catalog/reference-catalog';
import {
  getRuntimeReferenceCatalogSnapshot,
  refreshRuntimeReferenceCatalog
} from '../../../core/catalog/reference-catalog.gateway';
import { SUPABASE_CONFIG } from '../../../core/auth/supabase-config';
import { createSupabaseBrowserClient } from '../../../core/auth/supabase-auth.client';
import {
  type BusinessTypeCode,
  ONBOARDING_BUSINESS_TYPES_STORAGE_KEY,
  persistBusinessTypes,
  readBusinessTypes
} from '../data-access/onboarding-business-types-storage';
import { persistPlanSelection, readPlanSelection } from '../data-access/onboarding-plan-storage';
import {
  buildInitialBusinessSettingsForOnboarding,
  isAllowedOnboardingBusinessType,
  type OnboardingBusinessType
} from '../data-access/business-type-defaults';
import {
  ONBOARDING_DASHBOARD_CUE_KEY,
  markOnboardingCompletionConfirmed,
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

type OnboardingCompletionInput = {
  plan: PlanCode | null;
  businessType: BusinessTypeCode;
  selectedRubros: BusinessTypeCode[];
  storage: Pick<Storage, 'getItem'>;
};

type OnboardingCompletionHandler = (input: OnboardingCompletionInput) => Promise<boolean>;

function mapToPersistedBusinessType(type: BusinessTypeCode): OnboardingBusinessType | null {
  const normalized = toBusinessTypeCode(type);
  return normalized && isAllowedOnboardingBusinessType(normalized) ? (normalized as OnboardingBusinessType) : null;
}

function toBusinessTypeCode(code: unknown): BusinessTypeCode | null {
  const resolved = resolveBusinessTypeCodeFromCatalog(getCurrentReferenceCatalog(), code);
  return resolved ? (resolved.toLowerCase() as BusinessTypeCode) : null;
}

function getCurrentReferenceCatalog(): DashboardReferenceCatalog {
  return getRuntimeReferenceCatalogSnapshot();
}

function catalogBusinessTypeCodes(): BusinessTypeCode[] {
  return getCurrentReferenceCatalog().businessTypes
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

  return 'Mi negocio Orvel';
}

export function createSupabaseOnboardingCompletionHandler(): OnboardingCompletionHandler {
  const supabase = createSupabaseBrowserClient({
    supabaseUrl: SUPABASE_CONFIG.url,
    supabaseAnonKey: SUPABASE_CONFIG.anonKey
  });

  return async ({ plan, businessType, selectedRubros, storage }) => {
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
    const sanitizedSelectedBusinessTypes = sanitizeBusinessTypes(selectedRubros);
    const metadataSelectedBusinessTypes = readMetadataSelectedBusinessTypes(session.user.user_metadata);
    const selectedBusinessTypes = sanitizedSelectedBusinessTypes.length > 0
      ? sanitizedSelectedBusinessTypes
      : metadataSelectedBusinessTypes.length > 0
        ? [persistedBusinessType, ...metadataSelectedBusinessTypes.filter((type) => type !== persistedBusinessType)]
      : [persistedBusinessType];
    const additionalRubros = selectedBusinessTypes.filter((type) => type !== persistedBusinessType);
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
          business_type: defaults.businessType,
          selected_business_types: selectedBusinessTypes,
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

    const { data: defaultServicesProvisioned, error: defaultServicesError } = await supabase.rpc(
      'provision_default_services_for_business',
      {
        p_business_id: defaults.businessId,
        p_business_types: selectedBusinessTypes
      }
    );

    if (defaultServicesError || typeof defaultServicesProvisioned !== 'number') {
      return false;
    }

    const metadata = {
      onboardingCompleted: true,
      onboarding_completed: true,
      plan: defaults.plan,
      tipoNegocio: defaults.businessType,
      businessType: defaults.businessType,
      business_type: defaults.businessType,
      selectedBusinessTypes,
      selected_business_types: selectedBusinessTypes,
      additionalRubros
    };

    const { error: metadataError } = await supabase.auth.updateUser({
      data: metadata
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

function sanitizeBusinessTypes(types: unknown): BusinessTypeCode[] {
  if (!Array.isArray(types)) {
    return [];
  }

  return [
    ...new Set(
      types
        .map((type) => toBusinessTypeCode(type))
        .filter((type): type is BusinessTypeCode => type !== null)
    )
  ];
}

function readMetadataSelectedBusinessTypes(metadata: unknown): BusinessTypeCode[] {
  if (!metadata || typeof metadata !== 'object') {
    return [];
  }

  const record = metadata as Record<string, unknown>;
  return sanitizeBusinessTypes(
    record['selected_business_types'] ?? record['selectedBusinessTypes'] ?? record['additionalRubros']
  );
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
 * Step 3 of the onboarding flow - Primary and additional Business Type Selection.
 * User must select one primary business type and can add optional rubros for catalog suggestions.
 * Plan is selected in Step 1.
 *
 * Flow:
 * 1. Show catalog-derived rubro suggestions for the selected plan context
 * 2. User selects one primary business type and optional additional rubros
 * 3. Real-time UI updates
 * 4. Continue button enabled when one type is selected
 * 5. On submit, persist all onboarding data
 * 6. Open the true welcome state for every plan
 */
export class SignupBusinessTypesStepPage {
  // Ordered rubros selected by user. Index 0 is the required primary rubro.
  protected _selectedTypes: BusinessTypeCode[] = [];
  
  // UI state
  protected isLoading = false;
  protected errorMessage = '';
  protected successMessage = '';
  protected showWelcomeModal = false;
  protected showPaidAddonModal = false;
  
  // Router reference for navigation
  private routerRef: { navigateByUrl: (url: string) => void } | null = null;
  private onboardingCompletionHandler: OnboardingCompletionHandler | null = null;
  private referenceCatalogRefreshPromise: Promise<void> | null = null;

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
      return null;
    }

    const planFromUrl = this.readPlanFromCurrentUrl();
    if (planFromUrl) {
      persistPlanSelection(storage, planFromUrl);
      return planFromUrl;
    }

    return readPlanSelection(storage);
  }

  private readPlanFromCurrentUrl(): PlanCode | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const search = window.location?.search ?? '';
    const rawPlan = new URLSearchParams(search).get('plan');
    return rawPlan ? resolveValidPlanCode(rawPlan) : null;
  }

  /**
   * Gets the catalog business-type suggestions for the selected plan context.
   * Computed fresh each time - no caching
   */
  get allowedTypes(): BusinessType[] {
    return getCurrentReferenceCatalog().businessTypes
      .map((type): BusinessType | null => {
        const code = toBusinessTypeCode(type.code);
        return code ? { code, label: type.label } : null;
      })
      .filter((type): type is BusinessType => type !== null);
  }

  /** Gets the maximum number of rubros shown by the current catalog/plan UX. */
  getMaxTypes(): number {
    return getCurrentReferenceCatalog().businessTypes.length;
  }

  async refreshReferenceCatalog(): Promise<void> {
    if (!this.referenceCatalogRefreshPromise) {
      this.referenceCatalogRefreshPromise = refreshRuntimeReferenceCatalog()
        .then(() => {
          this.loadPersistedSelections();
        })
        .catch(() => {
          // Keep the non-empty local fallback when the RPC is unavailable.
        })
        .finally(() => {
          this.referenceCatalogRefreshPromise = null;
        });
    }

    return this.referenceCatalogRefreshPromise;
  }

  /**
   * Gets selected rubros. Index 0 is the primary business type.
   */
  get selectedTypes(): BusinessTypeCode[] {
    return [...this._selectedTypes];
  }

  /**
   * Checks if a business type can be selected
   * @param type - The business type code
   */
  canSelect(type: BusinessTypeCode): boolean {
    return catalogBusinessTypeCodes().includes(type);
  }

  /**
   * Checks if a business type is currently selected
   * @param type - The business type code
   */
  isTypeSelected(type: BusinessTypeCode): boolean {
    return this._selectedTypes.includes(type);
  }

  /**
   * Toggles a rubro selection without replacing prior rubros.
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
      this._selectedTypes = [...this._selectedTypes, type];
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

    const plan = this.getSelectedPlan();
    if (!plan) {
      this.errorMessage = 'Elegí un plan válido para continuar con la configuración.';
      return;
    }

    this.isLoading = true;

    // Persist the ordered rubros as a draft only. Completion/navigation requires
    // Supabase updateUser metadata and business_settings upsert to succeed.
    persistBusinessTypes(storage, [...this._selectedTypes]);

    const persisted = await this.persistMandatoryOnboarding(storage, plan);
    if (!persisted) {
      this.isLoading = false;
      return;
    }

    this.successMessage = '¡Todo listo! Tu configuración fue guardada con éxito.';
    markOnboardingCompletionConfirmed(storage);
    this.openWelcomeStep(storage);
  }

  isSelectionStep(): boolean {
    return !this.showWelcomeModal && !this.showPaidAddonModal;
  }

  continueAfterWelcome(): void {
    this.continueToDashboard();
  }

  private openWelcomeStep(storage: Pick<Storage, 'setItem'> | null): void {
    this.showWelcomeModal = true;
    this.showPaidAddonModal = false;
    this.isLoading = false;
    if (storage) {
      setCurrentStep(storage, 'welcome');
    }
    this.triggerWelcomeConfetti();
  }

  private triggerWelcomeConfetti(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reducedMotion) {
      return;
    }

    void import('canvas-confetti')
      .then(({ default: confetti }) => {
        try {
          confetti({
            particleCount: 130,
            spread: 72,
            origin: { y: 0.64 },
            colors: ['#8b5cf6', '#a855f7', '#34d399', '#f8f7ff']
          });
        } catch {
          // Confetti is decorative only; onboarding must never block on canvas support.
        }
      })
      .catch(() => {
        // Ignore loading issues for the optional celebration effect.
      });
  }

  continueToDashboard(): void {
    const storage = this.getStorage();
    if (storage) {
      setCurrentStep(storage, 'dashboard');
      storage.setItem(ONBOARDING_DASHBOARD_CUE_KEY, '1');
    }
    if (this.routerRef) {
      this.routerRef.navigateByUrl('/dashboard/inicio');
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

    return this.onboardingCompletionHandler({ plan, businessType, selectedRubros: [...this._selectedTypes], storage });
  }

  /**
   * Handles safe navigation away from configuration onboarding.
   */
  goBack(): void {
    if (this.routerRef) {
      this.routerRef.navigateByUrl('/dashboard/inicio');
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
        const catalogCodes = catalogBusinessTypeCodes();
        this._selectedTypes = stored.filter((code) => catalogCodes.includes(code));
      }
    } catch {
      // Invalid stored data, ignore
    }
  }

  constructor() {
    // Start an RPC-backed catalog refresh immediately; getters read the live
    // runtime snapshot so the rendered options update as soon as it resolves.
    void this.refreshReferenceCatalog();
    // Load persisted selections on init
    this.loadPersistedSelections();
  }
}

/**
 * Read persisted primary business type from storage
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

// plan FREE opens welcome directly.
