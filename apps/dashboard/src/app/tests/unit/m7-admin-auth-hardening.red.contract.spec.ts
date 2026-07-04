import { Injector, runInInjectionContext } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../services/auth.service';
import { TurnoService } from '../../features/booking/data-access/turno.service';
import type { CreateTurnoDTO, Turno } from '../../features/booking/models/turno.model';

const ROUTES_SOURCE = readFileSync(new URL('../../app.routes.ts', import.meta.url), 'utf8');
const ROUTE_PROTECTION_SOURCE = readFileSync(new URL('../../core/auth/route-protection.ts', import.meta.url), 'utf8');
const AUTH_SERVICE_SOURCE = readFileSync(new URL('../../services/auth.service.ts', import.meta.url), 'utf8');
const TURNO_SERVICE_SOURCE = readFileSync(new URL('../../features/booking/data-access/turno.service.ts', import.meta.url), 'utf8');
const VERIFIED_DASHBOARD_BUSINESS_CONTEXT_SOURCE = readFileSync(new URL('../../core/business/verified-dashboard-business-context.ts', import.meta.url), 'utf8');
const TURNOS_LIST_SOURCE = readFileSync(new URL('../../features/booking/pages/turnos-list.page.ts', import.meta.url), 'utf8');
const TURNO_FORM_SOURCE = readFileSync(new URL('../../features/booking/pages/turno-form.page.ts', import.meta.url), 'utf8');

function extractTopLevelRoute(source: string, path: string): string {
  const routeMatch = source.match(new RegExp(`path:\\s*['"]${path}['"][\\s\\S]*?(?=\\n\\s*\\},\\n\\s*\\{|\\n\\s*\\}\\n\\];)`));
  return routeMatch?.[0] ?? '';
}

function createSupabaseNoSessionDouble() {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  const from = vi.fn(() => {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      order: vi.fn().mockResolvedValue({ data: [], error: null })
    };
    return builder;
  });

  return {
    client: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null })
      },
      from,
      schema: vi.fn(() => ({ from })),
      rpc
    },
    rpc
  };
}

function createSupabaseTurnoServiceWithoutSession() {
  const authService = { user: () => ({ activeBranchId: 'branch-qa-auth-001' }) };
  const injector = Injector.create({ providers: [{ provide: AuthService, useValue: authService }] });
  const service = runInInjectionContext(injector, () => new TurnoService());
  const supabaseDouble = createSupabaseNoSessionDouble();

  service.setProvider('supabase');
  (service as unknown as { supabaseClient: unknown }).supabaseClient = supabaseDouble.client;
  (service as unknown as { turnos: { set: (items: Turno[]) => void } }).turnos.set([
    {
      id: 'booking-qa-auth-001',
      branchId: 'branch-qa-auth-001',
      clienteId: 'client-qa-auth-001',
      servicioId: 'service-qa-auth-001',
      fecha: new Date('2035-01-15T00:00:00.000Z'),
      hora: '10:00',
      duracionMinutos: 30,
      estado: 'confirmado',
      precio: 0,
      createdAt: new Date('2035-01-01T00:00:00.000Z'),
      updatedAt: new Date('2035-01-01T00:00:00.000Z')
    }
  ]);

  return { service, rpc: supabaseDouble.rpc };
}

function futureManualBooking(branchId = 'branch-qa-auth-001'): CreateTurnoDTO {
  return {
    branchId,
    clienteId: 'client-qa-auth-001',
    servicioId: 'service-qa-auth-001',
    fecha: new Date('2035-01-15T00:00:00.000Z'),
    hora: '10:00',
    duracionMinutos: 30,
    estado: 'confirmado',
    precio: 0
  };
}

function collectConsoleCalls(source: string): string[] {
  return source.match(/console\.(?:log|warn|error)\([\s\S]*?\);/g) ?? [];
}

describe('RED Contract M7: minimal admin auth hardening', () => {
  it('protects every /dashboard child route with dashboard auth guards while public manage-token routes stay public', () => {
    const dashboardRoute = extractTopLevelRoute(ROUTES_SOURCE, 'dashboard');
    const publicManageRoute = extractTopLevelRoute(ROUTES_SOURCE, 'booking/manage');

    expect(dashboardRoute).toMatch(/canActivate:\s*\[dashboardAuthGuard\]/);
    expect(dashboardRoute).toMatch(/canActivateChild:\s*\[dashboardAuthChildGuard\]/);
    expect(dashboardRoute).not.toMatch(/LoginPage|ManageBookingPage/);
    expect(publicManageRoute).toContain('ManageBookingPage');
    expect(publicManageRoute).not.toMatch(/dashboardAuthGuard|dashboardAuthChildGuard|canActivate/);
  });

  it('dashboard access fails closed through Supabase session checks, never legacy localStorage session acceptance', () => {
    expect(ROUTE_PROTECTION_SOURCE).toMatch(/getSession\(\)/);
    expect(ROUTE_PROTECTION_SOURCE).toMatch(/allowed:\s*false/);
    expect(ROUTE_PROTECTION_SOURCE).not.toMatch(/localStorage\.getItem\([\s\S]{0,240}allowed:\s*true/);
    expect(ROUTE_PROTECTION_SOURCE).not.toMatch(/validateSessionSchema\([\s\S]{0,240}allowed:\s*true/);
  });

  it('production Supabase auth paths do not mint mock users, empty tokens, or auto-login outside the explicit mock provider branch', () => {
    expect(AUTH_SERVICE_SOURCE).toMatch(/createSupabaseAuthClient/);
    expect(AUTH_SERVICE_SOURCE).not.toMatch(/TODO:\s*Supabase Auth[\s\S]{0,120}of\(\{\s*user:\s*\{\}\s*as\s*User,\s*token:\s*['"]['"]/);
    expect(AUTH_SERVICE_SOURCE).not.toMatch(/TODO:\s*Supabase Auth[\s\S]{0,120}isAuthenticated\.set\(true\)/);
    expect(AUTH_SERVICE_SOURCE).not.toMatch(/provider:\s*['"]mock['"]|this\.provider\s*===\s*['"]mock['"]|getMockUser|generateToken/);
  });

  it('dashboard does not own credential auth routes or pages', () => {
    expect(ROUTES_SOURCE).not.toMatch(/path:\s*['"]auth(?:\/login)?['"]/);
    expect(ROUTES_SOURCE).not.toMatch(/path:\s*['"]login['"]/);
    expect(ROUTES_SOURCE).not.toMatch(/['"]\.\/pages\/auth/);
    expect(ROUTE_PROTECTION_SOURCE).toMatch(/buildLandingLoginRedirect/);
    expect(ROUTE_PROTECTION_SOURCE).not.toMatch(/signInWithPassword\(|signUp\(|SUPABASE_CONFIG[\s\S]{0,120}sign/i);
  });

  it('admin mutation code does not fallback to local/in-memory success when Supabase auth or tenant context is unavailable', () => {
    expect(TURNO_SERVICE_SOURCE).not.toMatch(/Fall back to in-memory update when Supabase not available/i);
    expect(TURNO_SERVICE_SOURCE).not.toMatch(/if\s*\(!supabase\)[\s\S]{0,260}return\s+actualizado/);
    expect(TURNO_SERVICE_SOURCE).not.toMatch(/Keep UX resilient[\s\S]{0,260}local state/i);
  });

  it('admin mutation payloads require authenticated admin identity and never use literal admin as production performedBy fallback', () => {
    expect(TURNO_SERVICE_SOURCE).not.toMatch(/performedBy:\s*this\.authService\.user\(\)\?\.nombre\s*\|\|\s*['"]admin['"]/);
    expect(TURNO_SERVICE_SOURCE).not.toMatch(/performedBy:\s*['"]admin['"]/);
  });

  it('tenant context is resolved from backend-owned dashboard branches and never from auth metadata or user id fallback', () => {
    expect(TURNO_SERVICE_SOURCE).toMatch(/resolveVerifiedDashboardBranches/);
    expect(TURNO_SERVICE_SOURCE).toMatch(/private async resolveBackendOwnedBusinessBranches/);
    expect(TURNO_SERVICE_SOURCE).toMatch(/private async validateBranchTenant/);
    expect(TURNO_SERVICE_SOURCE).not.toMatch(/private async resolveBusinessId/);
    expect(TURNO_SERVICE_SOURCE).not.toMatch(/user_metadata|app_metadata/);
    expect(TURNO_SERVICE_SOURCE).not.toMatch(/return\s+authUserId|businessId\s*=\s*authUserId/);
    expect(TURNO_SERVICE_SOURCE).not.toMatch(/user\.id[\s\S]{0,160}businessId/);

    expect(VERIFIED_DASHBOARD_BUSINESS_CONTEXT_SOURCE).toMatch(/rpc\(['"]get_dashboard_branches['"]\)/);
    expect(VERIFIED_DASHBOARD_BUSINESS_CONTEXT_SOURCE).not.toMatch(/user_metadata|app_metadata/);
  });

  it('manual booking, blocked time, reschedule, cancel, and status changes reject without a Supabase session and do not call admin RPCs', async () => {
    const { service, rpc } = createSupabaseTurnoServiceWithoutSession();

    await expect(firstValueFrom(service.create(futureManualBooking()))).rejects.toThrow(/AUTH_REQUIRED|No active tenant session/);
    await expect(firstValueFrom(service.createBlockedTime({
      branchId: 'branch-qa-auth-001',
      startsAtIso: '2035-01-15T13:00:00.000Z',
      endsAtIso: '2035-01-15T13:30:00.000Z',
      performedBy: 'qa-admin'
    }))).rejects.toThrow(/AUTH_REQUIRED|No active tenant session/);
    await expect(firstValueFrom(service.rescheduleByAdmin('booking-qa-auth-001', {
      performedBy: 'qa-admin',
      fecha: new Date('2035-01-15T00:00:00.000Z'),
      hora: '11:00'
    }))).rejects.toThrow(/AUTH_REQUIRED|No active tenant session/);
    await expect(firstValueFrom(service.cancelByAdmin('booking-qa-auth-001', { performedBy: 'qa-admin' }))).rejects.toThrow(/AUTH_REQUIRED|No active tenant session/);
    await expect(firstValueFrom(service.updateEstado('booking-qa-auth-001', 'cancelado'))).rejects.toThrow(/AUTH_REQUIRED|No active tenant session/);

    expect(rpc).not.toHaveBeenCalled();
  });

  it('sensitive admin route/action logging does not pass raw errors or token-bearing strings to console/UI', () => {
    const sensitiveRuntimeSource = [TURNO_SERVICE_SOURCE, TURNOS_LIST_SOURCE, TURNO_FORM_SOURCE].join('\n');
    const consoleCalls = collectConsoleCalls(sensitiveRuntimeSource);
    const rawSensitiveConsoleCalls = consoleCalls.filter((call) =>
      /\b(?:error|err)\b|\.message|session|token|auth/i.test(call)
    );

    expect(rawSensitiveConsoleCalls).toEqual([]);
    expect(sensitiveRuntimeSource).not.toMatch(/formError\s*=\s*(?:error|err)\.message/i);
    expect(sensitiveRuntimeSource).not.toMatch(/setLoginError\(\{\s*message:\s*(?:error|err)\.message/i);
  });
});
