import { signal } from '@angular/core';
import { type SupabaseClient } from '@supabase/supabase-js';
import { loadDashboardRuntimeEnv } from '../runtime/dashboard-env';
import { createDashboardSupabaseClient } from '../runtime/supabase-client.factory';
import { ACTIVE_BRANCH_STORAGE_KEY, ACTIVE_BUSINESS_STORAGE_KEY } from '../storage/browser-storage-keys';
import { emitPublicBookingFailureEvent } from '../observability/public-booking-operational-events';

export type DashboardBranch = {
  id: string;
  name: string;
  businessId: string;
};

export type SessionBusinessIdentity = {
  ownerId: string;
  businessId: string;
  slug?: string;
  name?: string;
};

type OwnedBusinessRow = {
  id: string;
  owner_id?: string;
  slug?: string;
  name?: string;
};

export class BranchContextService {
  private supabaseClient?: SupabaseClient;
  private initialized = false;
  private lastResolvedBusinessId: string | null = null;
  private sessionIdentity: SessionBusinessIdentity | null = null;
  private inFlight: Promise<void> | null = null;
  private branchesState = signal<DashboardBranch[]>([]);
  private activeBranchIdState = signal<string | null>(null);
  private errorState = signal<string | null>(null);
  private loadingState = signal(false);

  readonly branches = this.branchesState.asReadonly();
  readonly activeBranchId = this.activeBranchIdState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly loading = this.loadingState.asReadonly();

  async ensureLoaded(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    const load = this.ensureLoadedInternal().finally(() => {
      if (this.inFlight === load) this.inFlight = null;
    });
    this.inFlight = load;
    return load;
  }

  private async ensureLoadedInternal(): Promise<void> {
    if (
      this.initialized
      && this.sessionIdentity
      && this.lastResolvedBusinessId === this.sessionIdentity.businessId
    ) {
      return;
    }
    const currentBusinessId = await this.resolveActiveBusinessId(this.getSupabaseClient());
    if (this.initialized && currentBusinessId === this.lastResolvedBusinessId) return;
    this.initialized = true;
    this.lastResolvedBusinessId = currentBusinessId;
    await this.refresh();
  }

  peekSessionBusinessIdentity(): SessionBusinessIdentity | null {
    return this.sessionIdentity;
  }

  rememberSessionBusinessIdentity(identity: SessionBusinessIdentity): void {
    this.sessionIdentity = identity;
  }

  clearSessionBusinessIdentity(): void {
    this.sessionIdentity = null;
  }

  resetSession(): void {
    this.initialized = false;
    this.lastResolvedBusinessId = null;
    this.sessionIdentity = null;
    this.inFlight = null;
    this.branchesState.set([]);
    this.activeBranchIdState.set(null);
    this.errorState.set(null);
    this.clearActiveBranch();
    this.storage()?.removeItem(ACTIVE_BUSINESS_STORAGE_KEY);
    invalidateSectionCaches();
  }

  async refresh(): Promise<void> {
    this.loadingState.set(true);
    this.errorState.set(null);

    try {
      const supabase = this.getSupabaseClient();
      const businessId = await this.resolveActiveBusinessId(supabase);
      if (!businessId) {
        throw new Error('ACCOUNT_SETUP_REQUIRED: active business context is required');
      }

      const { data, error } = await supabase.rpc('get_dashboard_branches', { p_business_id: businessId });

      if (error) throw error;

      const branches = ((data ?? []) as Array<Record<string, unknown>>)
        .filter((branch) => branch['id'] && branch['business_id'])
        .map((branch) => ({
          id: String(branch['id']),
          name: String(branch['name'] ?? 'Sucursal'),
          businessId: String(branch['business_id'])
        }));

      this.branchesState.set(branches);
      this.reconcileActiveBranch(branches);
    } catch {
      emitPublicBookingFailureEvent({
        stage: 'service',
        code: 'DASHBOARD_BRANCHES_RPC_FAILED',
        status: 503,
        retryable: true
      });
      this.errorState.set('No pudimos cargar sucursales. Reintentá antes de operar turnos.');
    } finally {
      this.loadingState.set(false);
    }
  }

  setActiveBranch(branchId: string): boolean {
    const branch = this.branchesState().find((candidate) => candidate.id === branchId);
    if (!branch) {
      this.clearActiveBranch();
      this.errorState.set('ACTIVE_BRANCH_REQUIRED: sucursal activa requerida');
      return false;
    }

    const previousId = this.activeBranchIdState();
    this.activeBranchIdState.set(branch.id);
    this.storage()?.setItem(ACTIVE_BRANCH_STORAGE_KEY, branch.id);
    this.errorState.set(null);
    if (previousId !== branch.id) {
      invalidateSectionCaches();
    }
    return true;
  }

  getActiveBranchId(): string | null {
    return this.activeBranchIdState();
  }

  async getActiveBusinessId(): Promise<string | null> {
    return this.resolveActiveBusinessId(this.getSupabaseClient());
  }

  hasMultipleBranches(): boolean {
    return this.branchesState().length > 1;
  }

  requiresExplicitSelection(): boolean {
    return this.hasMultipleBranches() && !this.activeBranchIdState();
  }

  private reconcileActiveBranch(branches: DashboardBranch[]): void {
    const stored = this.storage()?.getItem(ACTIVE_BRANCH_STORAGE_KEY)?.trim() || null;
    const storedBranch = stored ? branches.find((branch) => branch.id === stored) : null;

    if (stored && !storedBranch) {
      this.clearActiveBranch();
      this.errorState.set('La sucursal guardada ya no pertenece a esta cuenta. Seleccioná una sucursal activa.');
    }

    // branches length === 1 -> onlyBranch auto-select persists activeBranchId for single-branch tenants.
    if (branches.length === 1) {
      const [onlyBranch] = branches;
      this.activeBranchIdState.set(onlyBranch.id);
      this.storage()?.setItem(ACTIVE_BRANCH_STORAGE_KEY, onlyBranch.id);
      this.errorState.set(null);
      return;
    }

    if (storedBranch) {
      this.activeBranchIdState.set(storedBranch.id);
      this.errorState.set(null);
      return;
    }

    this.activeBranchIdState.set(null);
    if (branches.length > 1) {
      this.errorState.set('ACTIVE_BRANCH_REQUIRED: Seleccioná una sucursal para ver y administrar turnos.');
    } else {
      this.errorState.set('No hay sucursales activas configuradas para esta cuenta.');
    }
  }

  private clearActiveBranch(): void {
    this.activeBranchIdState.set(null);
    this.storage()?.removeItem(ACTIVE_BRANCH_STORAGE_KEY);
  }

  private getSupabaseClient(): SupabaseClient {
    if (!this.supabaseClient) {
      const env = loadDashboardRuntimeEnv();
      this.supabaseClient = createDashboardSupabaseClient({ env });
    }

    return this.supabaseClient;
  }

  private async resolveActiveBusinessId(supabase: SupabaseClient): Promise<string | null> {
    try {
      const storedBusinessId = this.storage()?.getItem(ACTIVE_BUSINESS_STORAGE_KEY)?.trim() || null;
      const { data, error } = await supabase.auth.getSession();
      if (error) return storedBusinessId;

      const userId = data.session?.user?.id?.trim() || null;
      if (userId && this.sessionIdentity?.ownerId === userId) {
        this.storage()?.setItem(ACTIVE_BUSINESS_STORAGE_KEY, this.sessionIdentity.businessId);
        return this.sessionIdentity.businessId;
      }

      const metadata = data.session?.user?.user_metadata as Record<string, unknown> | undefined;
      const sessionBusinessId = metadata?.['businessId'] ?? metadata?.['business_id'];
      const resolvedSessionId = typeof sessionBusinessId === 'string' && sessionBusinessId.trim()
        ? sessionBusinessId.trim()
        : null;

      let ownedBusinesses: OwnedBusinessRow[] | null = null;
      if (userId) {
        try {
          ownedBusinesses = await this.listOwnedBusinesses(supabase, userId);
        } catch {
          ownedBusinesses = null;
        }
      }

      const ownedBusinessIds = ownedBusinesses?.map((row) => row.id) ?? null;
      const owned = (candidate: string | null): string | null =>
        candidate && ownedBusinessIds?.includes(candidate) ? candidate : null;

      const resolved = ownedBusinessIds
        ? owned(resolvedSessionId)
          ?? owned(storedBusinessId)
          ?? ownedBusinessIds[0]
          ?? resolvedSessionId
          ?? storedBusinessId
        : resolvedSessionId ?? storedBusinessId;

      if (resolved) {
        if (storedBusinessId && storedBusinessId !== resolved) {
          this.clearActiveBranch();
        }
        this.storage()?.setItem(ACTIVE_BUSINESS_STORAGE_KEY, resolved);
        if (userId && ownedBusinesses) {
          const row = ownedBusinesses.find((candidate) => candidate.id === resolved);
          this.sessionIdentity = {
            ownerId: userId,
            businessId: resolved,
            slug: row?.slug,
            name: row?.name
          };
        }
        return resolved;
      }

      return null;
    } catch {
      return this.storage()?.getItem(ACTIVE_BUSINESS_STORAGE_KEY)?.trim() || null;
    }
  }

  private async listOwnedBusinesses(supabase: SupabaseClient, ownerId: string): Promise<OwnedBusinessRow[]> {
    const { data, error } = await supabase
      .from('businesses')
      .select('id, owner_id, slug, name')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    return ((data ?? []) as Array<{ id?: unknown; owner_id?: unknown; slug?: unknown; name?: unknown }>)
      .map((row) => ({
        id: typeof row.id === 'string' ? row.id.trim() : '',
        owner_id: typeof row.owner_id === 'string' ? row.owner_id : undefined,
        slug: typeof row.slug === 'string' ? row.slug : undefined,
        name: typeof row.name === 'string' ? row.name : undefined
      }))
      .filter((row) => row.id.length > 0);
  }

  private storage(): Storage | null {
    return typeof window !== 'undefined' ? window.localStorage : null;
  }
}

const sectionCacheInvalidators = new Set<() => void>();

export function registerSectionCacheInvalidator(invalidate: () => void): void {
  sectionCacheInvalidators.add(invalidate);
}

export function invalidateSectionCaches(): void {
  for (const invalidate of sectionCacheInvalidators) {
    invalidate();
  }
}

let branchContextSingleton: BranchContextService | null = null;

export function getBranchContextService(): BranchContextService {
  branchContextSingleton ??= new BranchContextService();
  return branchContextSingleton;
}

export function resetBranchContextSession(): void {
  branchContextSingleton?.resetSession();
  branchContextSingleton = null;
}
