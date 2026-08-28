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

function countTestId(source: string, testId: string): number {
  return source.split(`data-testid="${testId}"`).length - 1
    + source.split(`data-testid='${testId}'`).length - 1;
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

  it('Inicio desktop skeleton is a layout twin of KPI + Próximos + Huecos + Portal', () => {
    const html = readSource('src/app/features/dashboard-home/pages/dashboard-home.page.html');
    const desktopRoot = html.split('data-testid="dashboard-home-mobile-summary"')[0] ?? '';
    const loadingStart = desktopRoot.indexOf('dashboard-home-loading-skeleton');
    const loadingEnd = desktopRoot.indexOf('} @else {', loadingStart);
    const desktopLoading = desktopRoot.slice(loadingStart, loadingEnd < 0 ? undefined : loadingEnd);

    expect(countTestId(desktopLoading, 'dashboard-home-skeleton-card')).toBe(3);
    expect(desktopLoading).toMatch(/h-10 w-10 rounded-xl/);
    expect(desktopLoading).toMatch(/w-16 h-14 rounded-2xl/);
    expect(desktopLoading).toContain('Próximos Turnos');
    expect(desktopLoading).toContain('Huecos libres');
    expect(desktopLoading).toContain('Portal de Reservas');
    expect(desktopLoading).toMatch(/lg:grid-cols-3/);
    expect(desktopLoading).toContain('or-card');
    expect((desktopLoading.match(/w-16 h-14 rounded-2xl/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(desktopLoading).not.toMatch(/h-24 bg-surface-muted\/50/);
    expect(desktopLoading).not.toContain('No hay turnos para hoy');
    expect(desktopLoading).not.toContain('No hay huecos disponibles hoy');
  });

  it('Inicio mobile skeleton matches Hoy/Libres card anatomy', () => {
    const html = readSource('src/app/features/dashboard-home/pages/dashboard-home.page.html');
    const mobileRoot = html.split('data-testid="dashboard-home-mobile-summary"')[1] ?? '';
    const loadingStart = mobileRoot.indexOf('dashboard-home-loading-skeleton');
    const loadingEnd = mobileRoot.indexOf('} @else {', loadingStart);
    const mobileLoading = mobileRoot.slice(loadingStart, loadingEnd < 0 ? undefined : loadingEnd);

    expect(countTestId(mobileLoading, 'dashboard-home-skeleton-card')).toBe(2);
    expect(mobileLoading).not.toMatch(/h-16 bg-surface-muted\/50/);
    expect(mobileLoading).toMatch(/dashboard-home-skeleton-card[\s\S]*space-y-1[\s\S]*bg-surface-muted\/50[\s\S]*bg-surface-muted\/50/);
  });

  it('Clientes skeleton rows clone live card chrome instead of a single h-16 bar', () => {
    const html = readSource('src/app/features/clientes/pages/clientes.page.html');
    const listStart = html.indexOf('clientes-loading-skeleton');
    const listEnd = html.indexOf('} @else {', listStart);
    const listLoading = html.slice(listStart, listEnd < 0 ? undefined : listEnd);

    expect(listLoading).toMatch(/ui\.cardGlass/);
    expect(listLoading).toMatch(/flex items-center/);
    expect(listLoading).toMatch(/w-10 h-10 rounded-full/);
    expect(listLoading).not.toMatch(/data-testid=["']clientes-skeleton-row["'][^>]*\bh-16\b/);
  });

  it('Clientes metrics skeleton looks like the metrics card, not two fat blocks', () => {
    const html = readSource('src/app/features/clientes/pages/clientes.page.html');
    const metricsStart = html.indexOf('clientes-metrics-loading-skeleton');
    const metricsEnd = html.indexOf('} @else {', metricsStart);
    const metricsLoading = html.slice(metricsStart, metricsEnd < 0 ? undefined : metricsEnd);

    expect(metricsLoading).toMatch(/flex justify-between items-center/);
    expect((metricsLoading.match(/flex justify-between items-center/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(metricsLoading).not.toMatch(/h-16 bg-surface-muted\/50/);
  });

  it('Servicios metrics aside skeletons while loading instead of live counts', () => {
    const html = readSource('src/app/features/servicios/pages/servicios.page.html');
    const metricsStart = html.indexOf('servicios-metrics-loading-skeleton');
    const metricsEnd = html.indexOf('} @else {', metricsStart);
    const metricsLoading = html.slice(metricsStart, metricsEnd < 0 ? undefined : metricsEnd);

    expect(hasTestId(html, 'servicios-metrics-loading-skeleton')).toBe(true);
    expect(html).toMatch(
      /data-layout-section=["']right_panel["'][\s\S]*@if\s*\(\s*loading\(\)\s*\)[\s\S]*servicios-metrics-loading-skeleton[\s\S]*@else[\s\S]*filteredServicios\(\)/,
    );
    expect(metricsLoading).toMatch(/ui\.cardGlass/);
    expect(metricsLoading).toMatch(/flex justify-between items-center/);
    expect((metricsLoading.match(/flex justify-between items-center/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(metricsLoading).not.toContain('filteredServicios()');
    expect(metricsLoading).not.toContain('filteredCategorias()');
  });

  it('Servicios skeleton cards clone avatar + title + meta row chrome', () => {
    const html = readSource('src/app/features/servicios/pages/servicios.page.html');
    const start = html.indexOf('servicios-loading-skeleton');
    const end = html.indexOf('} @else {', start);
    const loading = html.slice(start, end < 0 ? undefined : end);

    expect(loading).toMatch(/ui\.cardGlass/);
    expect(loading).toMatch(/w-10 h-10 rounded-full/);
    expect(loading).toMatch(/flex items-center/);
    expect(loading).not.toMatch(/h-20 bg-surface-muted\/50/);
  });

  it('Settings skeleton uses at least two perfil-like cardGlass articles with h-12 fields', () => {
    const html = readSource(
      'src/app/features/settings/pages/themes/configuracion-zen-theme.component.html',
    );
    const start = html.indexOf('@if (loading())');
    const end = html.indexOf('@if (!loading() && loadError())', start);
    const loading = html.slice(start, end < 0 ? undefined : end);

    expect((loading.match(/ui\.cardGlass/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(loading).toMatch(/md:grid-cols-2/);
    expect(loading).toMatch(/h-12/);
    expect(loading).not.toMatch(/h-16 bg-surface-muted\/50/);
    expect(loading).not.toMatch(/h-20 bg-surface-muted\/50/);
  });

  it('Turnos page-level loading uses mobile agenda skeleton on mobile', () => {
    const html = readSource('src/app/features/booking/pages/turnos-list.page.html');
    const loadingStart = html.indexOf('@if (loading())');
    const loadingEnd = html.indexOf('} @else {', html.indexOf('} @else {', loadingStart) + 1);
    const pageLoading = html.slice(loadingStart, loadingEnd < 0 ? undefined : loadingEnd);

    expect(pageLoading).toMatch(/@if\s*\(\s*!isMobile\(\)\s*\)/);
    expect(pageLoading).toContain('turnos-loading-skeleton');
    expect(pageLoading).toContain('app-mobile-agenda-day-view');
    expect(pageLoading).toMatch(/\[loading\]=["']true["']/);
    expect(pageLoading).toContain('[turnos]="mobileAppointments()"');
    expect(pageLoading).toContain('[selectedDate]="selectedDate()"');
  });

  it('Turnos desktop skeleton includes calendar, hour timeline, and Resumen panel', () => {
    const html = readSource('src/app/features/booking/pages/turnos-list.page.html');
    const start = html.indexOf('turnos-loading-skeleton');
    const end = html.indexOf('} @else {', start);
    const loading = html.slice(start, end < 0 ? undefined : end);

    expect(loading).toMatch(/min-h-\[220px\]/);
    expect(loading).toMatch(/rounded-zen-card/);
    expect(loading).toMatch(/w-zen-control-lg/);
    expect(countTestId(loading, 'turnos-skeleton-row')).toBeGreaterThanOrEqual(3);
    expect(loading).toContain('turnos-skeleton-panel');
    expect(loading).toMatch(/Resumen/);
    expect(loading).toMatch(/or-card/);
    expect((loading.match(/py-3|h-11|h-12/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(loading).not.toMatch(/data-testid=["']turnos-skeleton-row["'][^>]*>\s*<div class="h-16 bg-surface-muted\/50/);
  });

  it('Turno form skeleton uses labeled h-12 fields instead of h-20 blobs', () => {
    const html = readSource('src/app/features/booking/pages/turno-form.page.html');
    const start = html.indexOf('turno-form-loading-skeleton');
    const end = html.indexOf('@if (!loading())', start);
    const loading = html.slice(start, end < 0 ? undefined : end);

    expect(countTestId(loading, 'turno-form-skeleton-field')).toBeGreaterThanOrEqual(4);
    expect(loading).toMatch(/h-12/);
    expect(loading).not.toMatch(/turno-form-skeleton-field["'] class="h-20/);
  });

  it('Public booking skeleton has header chrome and a rounded form card with field groups', () => {
    const html = readSource('src/app/features/booking/pages/public/public-booking.page.html');
    const start = html.indexOf('public-booking-loading-skeleton');
    const end = html.indexOf('} @else {', start);
    const loading = html.slice(start, end < 0 ? undefined : end);

    expect(loading).toMatch(/rounded-full/);
    expect(loading).toMatch(/rounded-\[40px\]/);
    expect(loading).toMatch(/h-12/);
    expect((loading.match(/h-12/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(loading).not.toMatch(/h-16 bg-surface-muted\/50/);
    expect(loading).not.toMatch(/h-24 bg-surface-muted\/50/);
  });

  it('Manage booking keeps the page header and skeletons two h-12 fields in the card', () => {
    const html = readSource('src/app/features/booking/pages/public/manage-booking.page.html');
    const headerIdx = html.indexOf('Gestionar Reserva');
    const skeletonIdx = html.indexOf('manage-booking-loading-skeleton');
    const start = html.indexOf('manage-booking-loading-skeleton');
    const end = html.indexOf('@if (invalidToken())', start);
    const loading = html.slice(start, end < 0 ? undefined : end);

    expect(headerIdx).toBeGreaterThanOrEqual(0);
    expect(skeletonIdx).toBeGreaterThan(headerIdx);
    expect((loading.match(/h-12/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('Mobile agenda cards clone time-pill + text bars layout', () => {
    const html = readSource(
      'src/app/features/booking/ui/mobile-agenda-day-view/mobile-agenda-day-view.component.html',
    );
    const start = html.indexOf('mobile-agenda-loading-skeleton');
    const loading = html.slice(start);

    expect(loading).toMatch(/flex gap-4 rounded-xl p-4/);
    expect(loading).toMatch(/w-14/);
    expect(loading).not.toMatch(/h-20 rounded-xl bg-surface-muted\/50/);
  });
});
