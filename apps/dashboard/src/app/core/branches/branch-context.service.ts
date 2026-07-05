import { signal } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadDashboardRuntimeEnv } from '../runtime/dashboard-env';
import { ACTIVE_BRANCH_STORAGE_KEY, ACTIVE_BUSINESS_STORAGE_KEY } from '../storage/browser-storage-keys';
import { emitPublicBookingFailureEvent } from '../observability/public-booking-operational-events';

export type DashboardBranch = {
  id: string;
  name: string;
  businessId: string;
};

export class BranchContextService {
  private supabaseClient?: SupabaseClient;
  private initialized = false;
  private branchesState = signal<DashboardBranch[]>([]);
  private activeBranchIdState = signal<string | null>(null);
  private errorState = signal<string | null>(null);
  private loadingState = signal(false);

  readonly branches = this.branchesState.asReadonly();
  readonly activeBranchId = this.activeBranchIdState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly loading = this.loadingState.asReadonly();

  async ensureLoaded(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    await this.refresh();
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

    this.activeBranchIdState.set(branch.id);
    this.storage()?.setItem(ACTIVE_BRANCH_STORAGE_KEY, branch.id);
    this.errorState.set(null);
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
      this.supabaseClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    }

    return this.supabaseClient;
  }

  private async resolveActiveBusinessId(supabase: SupabaseClient): Promise<string | null> {
    try {
      const storedBusinessId = this.storage()?.getItem(ACTIVE_BUSINESS_STORAGE_KEY)?.trim();
      if (storedBusinessId) return storedBusinessId;

      const { data, error } = await supabase.auth.getSession();
      if (error) return null;

      const metadata = data.session?.user?.user_metadata as Record<string, unknown> | undefined;
      const businessId = metadata?.['businessId'] ?? metadata?.['business_id'];
      return typeof businessId === 'string' && businessId.trim() ? businessId.trim() : null;
    } catch {
      return null;
    }
  }

  private storage(): Storage | null {
    return typeof window !== 'undefined' ? window.localStorage : null;
  }
}

let branchContextSingleton: BranchContextService | null = null;

export function getBranchContextService(): BranchContextService {
  branchContextSingleton ??= new BranchContextService();
  return branchContextSingleton;
}
