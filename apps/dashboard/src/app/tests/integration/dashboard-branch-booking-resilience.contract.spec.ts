import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Injector, runInInjectionContext } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BranchContextService } from '../../core/branches/branch-context.service';
import { ACTIVE_BUSINESS_STORAGE_KEY } from '../../core/storage/browser-storage-keys';
import { TurnoService } from '../../features/booking/data-access/turno.service';
import { AuthService } from '../../services/auth.service';

const BRANCH_ID = 'branch-r4-001';
const BUSINESS_ID = 'business-r4-001';
const OTHER_BRANCH_ID = 'branch-r4-other';
const OTHER_BUSINESS_ID = 'business-r4-other';

function createTurnoService() {
  const injector = Injector.create({
    providers: [{
      provide: AuthService,
      useValue: { user: () => ({ id: 'admin-r4-001', activeBranchId: BRANCH_ID }) }
    }]
  });

  return runInInjectionContext(injector, () => new TurnoService());
}

function supabaseDouble(options: { failBookings?: boolean; failBranches?: boolean; businessId?: string | null } = {}) {
  const sessionBusinessId = 'businessId' in options ? options.businessId : BUSINESS_ID;
  const branches = [
    { id: BRANCH_ID, name: 'Principal', business_id: BUSINESS_ID, is_active: true },
    { id: OTHER_BRANCH_ID, name: 'Principal', business_id: OTHER_BUSINESS_ID, is_active: true }
  ];

  return {
    auth: {
      getSession: () => Promise.resolve({
        data: { session: { user: { id: 'admin-r4-001', user_metadata: sessionBusinessId ? { businessId: sessionBusinessId } : {} } } },
        error: null
      })
    },
    from: vi.fn(() => {
      throw new Error('Dashboard branch reads must use get_dashboard_branches RPC');
    }),
    rpc: vi.fn((fn: string, args?: Record<string, unknown>) => {
      if (fn === 'get_dashboard_branches') {
        const requestedBusinessId = typeof args?.['p_business_id'] === 'string' ? args['p_business_id'] : null;
        return Promise.resolve(options.failBranches
          ? { data: null, error: { message: 'RLS regression' } }
          : { data: requestedBusinessId ? branches.filter((branch) => branch.business_id === requestedBusinessId) : branches, error: null });
      }

      if (fn === 'list_admin_bookings') {
        const requestedBranchId = typeof args?.['p_branch_id'] === 'string' ? args['p_branch_id'] : BRANCH_ID;
        return Promise.resolve(options.failBookings
          ? { data: null, error: { message: 'RPC unavailable' } }
          : {
              data: [{
                id: 'booking-r4-001',
                branch_id: requestedBranchId,
                customer_id: 'customer-r4-001',
                service_id: 'service-r4-001',
                starts_at: '2035-07-04T13:00:00.000Z',
                ends_at: '2035-07-04T13:30:00.000Z',
                status: 'confirmed',
                created_at: '2035-07-01T00:00:00.000Z',
                updated_at: '2035-07-01T00:00:00.000Z'
              }],
              error: null
            });
      }

      return Promise.resolve({ data: null, error: null });
    })
  };
}

describe('R4 resilience: dashboard branch and booking loading', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    if (typeof window !== 'undefined') window.localStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('does not clear existing bookings or pretend empty state when list_admin_bookings fails', async () => {
    const service = createTurnoService();
    const supabase = supabaseDouble();
    (service as unknown as { supabaseClient: unknown }).supabaseClient = supabase;
    service.setProvider('supabase');

    await firstValueFrom(service.getAll());
    expect(service.items()).toHaveLength(1);

    (supabase.rpc as ReturnType<typeof vi.fn>).mockImplementation((fn: string, args?: Record<string, unknown>) => {
      if (fn === 'get_dashboard_branches') {
        return Promise.resolve({ data: [{ id: BRANCH_ID, name: 'Principal', business_id: args?.['p_business_id'] ?? BUSINESS_ID }], error: null });
      }

      if (fn === 'list_admin_bookings') {
        return Promise.resolve({ data: null, error: { message: 'RPC unavailable' } });
      }

      return Promise.resolve({ data: null, error: null });
    });

    await expect(firstValueFrom(service.getAll())).rejects.toThrow(/BOOKINGS_LOAD_FAILED/);
    expect(service.items()).toHaveLength(1);
    expect(service.loadError()).toMatch(/No pudimos cargar turnos|validar el alcance/);
    expect(service.isLoading()).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(
      '[PublicBooking] Operational failure event emitted.',
      expect.objectContaining({ code: 'ADMIN_BOOKINGS_LOAD_FAILED' })
    );
  });

  it('loads dashboard branches through get_dashboard_branches and preserves branch context on RPC failure', async () => {
    const branchContext = new BranchContextService();
    const supabase = supabaseDouble();
    (branchContext as unknown as { supabaseClient: unknown }).supabaseClient = supabase;

    await branchContext.refresh();

    expect(supabase.rpc).toHaveBeenCalledWith('get_dashboard_branches', { p_business_id: BUSINESS_ID });
    expect(supabase.from).not.toHaveBeenCalled();
    expect(branchContext.branches()).toHaveLength(1);
    expect(branchContext.activeBranchId()).toBe(BRANCH_ID);

    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: { message: 'RLS regression' } });

    await branchContext.refresh();

    expect(branchContext.branches()).toHaveLength(1);
    expect(branchContext.activeBranchId()).toBe(BRANCH_ID);
    expect(branchContext.error()).toMatch(/No pudimos cargar sucursales/);
    expect(console.warn).toHaveBeenCalledWith(
      '[PublicBooking] Operational failure event emitted.',
      expect.objectContaining({ code: 'DASHBOARD_BRANCHES_RPC_FAILED' })
    );
  });

  it('passes the active session business id so multi-business Principal branches do not cross-fallback', async () => {
    const service = createTurnoService();
    const supabase = supabaseDouble({ businessId: OTHER_BUSINESS_ID });
    (service as unknown as { supabaseClient: unknown }).supabaseClient = supabase;
    service.setProvider('supabase');

    await firstValueFrom(service.getAll());

    expect(supabase.rpc).toHaveBeenCalledWith('get_dashboard_branches', { p_business_id: OTHER_BUSINESS_ID });
    expect(supabase.rpc).toHaveBeenCalledWith('list_admin_bookings', { p_branch_id: OTHER_BRANCH_ID });
  });

  it('uses the stored active business when metadata is missing and never falls back to all manageable branches', async () => {
    window.localStorage.setItem(ACTIVE_BUSINESS_STORAGE_KEY, OTHER_BUSINESS_ID);
    const service = createTurnoService();
    const supabase = supabaseDouble({ businessId: null });
    (service as unknown as { supabaseClient: unknown }).supabaseClient = supabase;
    service.setProvider('supabase');

    await firstValueFrom(service.getAll());

    expect(supabase.rpc).toHaveBeenCalledWith('get_dashboard_branches', { p_business_id: OTHER_BUSINESS_ID });
    expect(supabase.rpc).toHaveBeenCalledWith('list_admin_bookings', { p_branch_id: OTHER_BRANCH_ID });
    expect((supabase.rpc as ReturnType<typeof vi.fn>).mock.calls).not.toContainEqual(['get_dashboard_branches']);
  });

  it('loads branch context from the stored active business when metadata is missing', async () => {
    window.localStorage.setItem(ACTIVE_BUSINESS_STORAGE_KEY, OTHER_BUSINESS_ID);
    const branchContext = new BranchContextService();
    const supabase = supabaseDouble({ businessId: null });
    (branchContext as unknown as { supabaseClient: unknown }).supabaseClient = supabase;

    await branchContext.refresh();

    expect(supabase.rpc).toHaveBeenCalledWith('get_dashboard_branches', { p_business_id: OTHER_BUSINESS_ID });
    expect(supabase.rpc).not.toHaveBeenCalledWith('get_dashboard_branches');
    expect(branchContext.activeBranchId()).toBe(OTHER_BRANCH_ID);
  });

  it('keeps the dashboard branch RPC contract scoped to can_manage_business for owners and business_members', () => {
    const appliedMigration = readFileSync(resolve(process.cwd(), '../../supabase/migrations/20260703143000_dashboard_owned_branches_rpc.sql'), 'utf8');
    const migration = readFileSync(resolve(process.cwd(), '../../supabase/migrations/20260704160000_business_scoped_dashboard_branches_rpc.sql'), 'utf8');

    expect(appliedMigration).toMatch(/b\.owner_id\s*=\s*\(SELECT auth\.uid\(\)\)/i);
    expect(appliedMigration).not.toMatch(/get_dashboard_branches\(p_business_id uuid\)/i);
    expect(migration).toMatch(/get_dashboard_branches\(p_business_id uuid\)/i);
    expect(migration).toMatch(/public\.can_manage_business\(br\.business_id\)/i);
    expect(migration).toMatch(/p_business_id IS NOT NULL/i);
    expect(migration).toMatch(/br\.business_id = p_business_id/i);
    expect(migration).not.toMatch(/b\.owner_id\s*=\s*\(SELECT auth\.uid\(\)\)/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_dashboard_branches\(uuid\) TO authenticated, service_role/i);
  });

  it('renders a visible degraded load state instead of relying on the empty-state path', () => {
    const pageSource = readFileSync(resolve(process.cwd(), 'src/app/features/booking/pages/turnos-list.page.ts'), 'utf8');
    const templateSource = readFileSync(resolve(process.cwd(), 'src/app/features/booking/pages/turnos-list.page.html'), 'utf8');

    expect(pageSource).toMatch(/turnosLoadError/);
    expect(pageSource).toMatch(/turnoService\.loadError\(\)/);
    expect(templateSource).toMatch(/data-testid="turnos-load-error"/);
    expect(templateSource).toMatch(/role="alert"/);
  });
});
