import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readSource(relativePath: string): string {
  const absolutePath = resolve(process.cwd(), relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf-8') : '';
}

function hasTestId(source: string, testId: string): boolean {
  return new RegExp(`data-testid=["']${testId}["']`, 'i').test(source);
}

describe('Dashboard section skeletons until data is ready', () => {
  it('keeps existing Turnos list skeleton hooks', () => {
    const html = readSource('src/app/features/booking/pages/turnos-list.page.html');

    expect(hasTestId(html, 'turnos-loading-skeleton')).toBe(true);
    expect(hasTestId(html, 'turnos-skeleton-row')).toBe(true);
    expect(hasTestId(html, 'turnos-skeleton-panel')).toBe(true);
    expect(html).toMatch(/role=["']status["']/i);
    expect(html).toMatch(/animate-pulse/);
    expect(html).toMatch(/bg-surface-muted\/50/);
  });

  it('turno form skeleton has role=status and no leftover Cargando copy', () => {
    const html = readSource('src/app/features/booking/pages/turno-form.page.html');

    expect(hasTestId(html, 'turno-form-loading-skeleton')).toBe(true);
    expect(hasTestId(html, 'turno-form-skeleton-field')).toBe(true);
    expect(html).toMatch(/data-testid=["']turno-form-loading-skeleton["'][^>]*role=["']status["']/i);
    expect(html).not.toMatch(/<p>\s*Cargando\.\.\.\s*<\/p>/);
    expect(html).not.toContain('Cargando...');
  });

  it('settings loading uses field/card skeleton blocks instead of copy', () => {
    const html = readSource(
      'src/app/features/settings/pages/themes/configuracion-zen-theme.component.html',
    );

    expect(hasTestId(html, 'settings-loading-state')).toBe(true);
    expect(hasTestId(html, 'settings-loading-skeleton')).toBe(true);
    expect(html).toMatch(/data-testid=["']settings-loading-skeleton["'][^>]*role=["']status["']/i);
    expect(html).toMatch(/animate-pulse/);
    expect(html).toMatch(/bg-surface-muted\/50/);
    expect(html).not.toContain('Cargando configuración');
  });

  it('servicios live page shows card skeletons while loading', () => {
    const html = readSource('src/app/features/servicios/pages/servicios.page.html');

    expect(hasTestId(html, 'servicios-loading-skeleton')).toBe(true);
    expect(hasTestId(html, 'servicios-skeleton-card')).toBe(true);
    expect(html).toMatch(/data-testid=["']servicios-loading-skeleton["'][^>]*role=["']status["']/i);
    expect(html).toMatch(/animate-pulse/);
    expect(html).not.toContain('Cargando servicios');
  });

  it('servicios-standard replaces Cargando copy with skeleton hooks', () => {
    const source = readSource(
      'src/app/features/servicios/pages/components/servicios-standard/servicios-standard.component.ts',
    );

    expect(hasTestId(source, 'servicios-loading-skeleton')).toBe(true);
    expect(hasTestId(source, 'servicios-skeleton-card')).toBe(true);
    expect(source).toMatch(/role=["']status["']/i);
    expect(source).not.toContain('Cargando servicios');
  });

  it('clientes live page gates list and empty behind loading and shows row skeletons', () => {
    const html = readSource('src/app/features/clientes/pages/clientes.page.html');

    expect(html).toMatch(/@if\s*\(\s*loading\(\)\s*\)/);
    expect(hasTestId(html, 'clientes-loading-skeleton')).toBe(true);
    expect(hasTestId(html, 'clientes-skeleton-row')).toBe(true);
    expect(html).toMatch(/data-testid=["']clientes-loading-skeleton["'][^>]*role=["']status["']/i);
    expect(html).toMatch(
      /@if\s*\(\s*loading\(\)\s*\)[\s\S]*clientes-loading-skeleton[\s\S]*@else[\s\S]*filteredClients\(\)/,
    );
    expect(html).toMatch(
      /@if\s*\(\s*loading\(\)\s*\)[\s\S]*@else[\s\S]*clientes-empty-state/,
    );
    expect(html).not.toContain('Cargando');
  });

  it('clientes-standard replaces spinner copy with skeleton hooks', () => {
    const source = readSource(
      'src/app/features/clientes/pages/components/clientes-standard/clientes-standard.component.ts',
    );

    expect(hasTestId(source, 'clientes-loading-skeleton')).toBe(true);
    expect(hasTestId(source, 'clientes-skeleton-row')).toBe(true);
    expect(source).toMatch(/role=["']status["']/i);
    expect(source).not.toContain('Cargando base de datos');
    expect(source).not.toMatch(/animate-spin/);
  });

  it('public booking loading is a skeleton without spinner copy', () => {
    const html = readSource('src/app/features/booking/pages/public/public-booking.page.html');

    expect(hasTestId(html, 'public-booking-loading-skeleton')).toBe(true);
    expect(html).toMatch(
      /data-testid=["']public-booking-loading-skeleton["'][^>]*role=["']status["']/i,
    );
    expect(html).toMatch(/animate-pulse/);
    expect(html).not.toContain('Cargando experiencia');
    const loadingBlock = html.match(/@if\s*\(\s*loading\(\)\s*\)\s*\{[\s\S]*?\}\s*@else/)?.[0] ?? '';
    expect(loadingBlock).toContain('public-booking-loading-skeleton');
    expect(loadingBlock).not.toMatch(/animate-spin/);
  });

  it('manage booking loading is a skeleton without spinner copy', () => {
    const html = readSource('src/app/features/booking/pages/public/manage-booking.page.html');

    expect(hasTestId(html, 'manage-booking-loading-skeleton')).toBe(true);
    expect(html).toMatch(
      /data-testid=["']manage-booking-loading-skeleton["'][^>]*role=["']status["']/i,
    );
    expect(html).toMatch(/animate-pulse/);
    expect(html).not.toContain('Validando link');
    expect(html).not.toMatch(/animate-spin/);
  });

  it('Inicio gates KPI cards and appointment lists behind DashboardService.isLoading', () => {
    const html = readSource('src/app/features/dashboard-home/pages/dashboard-home.page.html');

    expect(html).toMatch(/dashboardService\.isLoading\(\)/);
    expect(hasTestId(html, 'dashboard-home-loading-skeleton')).toBe(true);
    expect(hasTestId(html, 'dashboard-home-skeleton-card')).toBe(true);
    expect(html).toMatch(
      /data-testid=["']dashboard-home-loading-skeleton["'][^>]*role=["']status["']/i,
    );
    expect(html).toMatch(/animate-pulse/);
    expect(html).toMatch(
      /@if\s*\(\s*dashboardService\.isLoading\(\)\s*\)[\s\S]*dashboard-home-loading-skeleton[\s\S]*@else[\s\S]*agendaStatus\(\)\.totalAppointments/,
    );
  });

  it('mobile agenda loading skeleton has a deterministic testid and status role', () => {
    const html = readSource(
      'src/app/features/booking/ui/mobile-agenda-day-view/mobile-agenda-day-view.component.html',
    );

    expect(hasTestId(html, 'mobile-agenda-loading-skeleton')).toBe(true);
    expect(html).toMatch(
      /data-testid=["']mobile-agenda-loading-skeleton["'][^>]*role=["']status["']/i,
    );
    expect(html).toMatch(/animate-pulse/);
  });

  it('Turnos branch helper does not show Cargando copy on the loading path', () => {
    const source = readSource('src/app/features/booking/pages/turnos-list.page.ts');

    expect(source).not.toContain('Cargando alcance operativo');
    expect(source).not.toMatch(/Cargando/);
  });

  it('PWA boot splash files still contain Cargando', () => {
    const appHtml = readSource('src/app/app.html');
    const indexHtml = readSource('src/index.html');

    expect(appHtml).toContain('Cargando');
    expect(indexHtml).toContain('Cargando');
  });
});
