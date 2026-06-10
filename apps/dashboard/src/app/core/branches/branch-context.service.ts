import { signal } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadDashboardRuntimeEnv } from '../runtime/dashboard-env';

export type DashboardBranch = {
  id: string;
  name: string;
  businessId: string;
};

const ACTIVE_BRANCH_STORAGE_KEY = 'activeBranchId';

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
      const businessId = await this.resolveBusinessId(supabase);

      if (!businessId) {
        this.clearActiveBranch();
        this.branchesState.set([]);
        this.errorState.set('No pudimos identificar la cuenta activa para cargar sucursales.');
        return;
      }

      const { data, error } = await supabase
        .from('branches')
        .select('id, name, business_id, is_active')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;

      const branches = ((data ?? []) as Array<Record<string, unknown>>)
        .filter((branch) => branch['id'] && branch['business_id'] === businessId)
        .map((branch) => ({
          id: String(branch['id']),
          name: String(branch['name'] ?? 'Sucursal'),
          businessId: String(branch['business_id'])
        }));

      this.branchesState.set(branches);
      this.reconcileActiveBranch(branches);
    } catch {
      this.clearActiveBranch();
      this.branchesState.set([]);
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

  private async resolveBusinessId(supabase: SupabaseClient): Promise<string | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;

    const metadata = data.session?.user?.user_metadata as Record<string, unknown> | undefined;
    const businessId = metadata?.['businessId'] ?? metadata?.['business_id'];
    return typeof businessId === 'string' && businessId.trim() ? businessId.trim() : null;
  }

  private getSupabaseClient(): SupabaseClient {
    if (!this.supabaseClient) {
      const env = loadDashboardRuntimeEnv();
      this.supabaseClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    }

    return this.supabaseClient;
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
