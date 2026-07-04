import { signal } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadDashboardRuntimeEnv } from '../runtime/dashboard-env';
import { ACTIVE_BRANCH_STORAGE_KEY } from '../storage/browser-storage-keys';
import { DashboardBranchContextError, resolveVerifiedDashboardBranches } from '../business/verified-dashboard-business-context';

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
      const branches = (await resolveVerifiedDashboardBranches(supabase, 'branch-context'))
        .map((branch) => ({
          id: branch.id,
          name: branch.name,
          businessId: branch.businessId,
        }));

      if (branches.length === 0) {
        this.clearActiveBranch();
        this.branchesState.set([]);
        this.errorState.set('No pudimos identificar sucursales propias para esta cuenta.');
        return;
      }

      this.branchesState.set(branches);
      this.reconcileActiveBranch(branches);
    } catch (error) {
      if (error instanceof DashboardBranchContextError) {
        console.warn('[BranchContext] Verified dashboard branch context failed', { code: error.code });
      }
      this.clearActiveBranch();
      this.branchesState.set([]);
      this.errorState.set(error instanceof DashboardBranchContextError
        ? error.message
        : 'No pudimos cargar sucursales. Reintentá antes de operar turnos.');
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
