import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const COMPONENT_PATH = new URL('./dashboard-home.page.ts', import.meta.url);
const TEMPLATE_PATH = new URL('./dashboard-home.page.html', import.meta.url);
const INDEX_HTML_PATH = new URL('../../../../index.html', import.meta.url);

const componentSource = (() => {
  try {
    return fs.readFileSync(COMPONENT_PATH, 'utf8');
  } catch {
    return '';
  }
})();

const templateSource = (() => {
  try {
    return fs.readFileSync(TEMPLATE_PATH, 'utf8');
  } catch {
    return '';
  }
})();

const indexHtml = (() => {
  try {
    return fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  } catch {
    return '';
  }
})();

function mobileSummaryBlock(source: string): string {
  const start = source.indexOf('data-testid="dashboard-home-mobile-summary"');
  if (start < 0) {
    return '';
  }

  return source.slice(start);
}

function mobileSummaryClass(source: string): string {
  const tagged = source.match(
    /data-testid=["']dashboard-home-mobile-summary["'][^>]*class=["']([^"']+)["']/,
  );
  if (tagged?.[1]) {
    return tagged[1];
  }

  const classFirst = source.match(
    /class=["']([^"']+)["'][^>]*data-testid=["']dashboard-home-mobile-summary["']/,
  );
  return classFirst?.[1] ?? '';
}

describe('DashboardHomePage mobile summary visual contract', () => {
  it('binds a live Spanish eyebrow date instead of a hardcoded fixture', () => {
    const mobile = mobileSummaryBlock(templateSource);
    expect(mobile).toMatch(/eyebrowDate\(\s*\)/);
    expect(mobile).not.toContain('Viernes, 28 de agosto');
    expect(componentSource).toMatch(/eyebrowDate/);
    expect(componentSource).toMatch(/es-AR|es-ES|es/);
  });

  it('greets with time-based words, comma, and a gradient operator first name', () => {
    const mobile = mobileSummaryBlock(templateSource);
    expect(mobile).toMatch(/greeting\(\s*\)/);
    expect(mobile).toMatch(/<br\s*\/?>/);
    expect(mobile).toMatch(/linear-gradient/);
    expect(mobile).not.toContain('Santiago');
  });

  it('matches Inicio HTML chrome: violet eyebrow, rounded gradient avatar, amber badge, green occupancy dots', () => {
    const mobile = mobileSummaryBlock(templateSource);
    expect(mobile).toMatch(/text-\[#9B7BFF\]/);
    expect(mobile).toMatch(/rounded-\[14px\]/);
    expect(mobile).toMatch(/linear-gradient\(155deg/);
    expect(mobile).toMatch(/linear-gradient\(135deg/);
    expect(mobile).toMatch(/#FBBF24/);
    expect(mobile).toMatch(/#34D399/);
    expect(mobile).toContain('Acceso rápido desde tu pantalla de inicio');
    expect(mobile).not.toContain('9:41');
  });

  it('uses Compartir link de reserva in the mobile block', () => {
    const mobile = mobileSummaryBlock(templateSource);
    expect(mobile).toContain('Compartir link de reserva');
    expect(mobile).toMatch(/copyBookingUrl/);
  });

  it('shows Hoy and Libres stat cards with occupancy-aware copy', () => {
    const mobile = mobileSummaryBlock(templateSource);
    expect(mobile).toContain('Hoy');
    expect(mobile).toContain('Libres');
    expect(mobile).toMatch(/Turno agendado/);
    expect(mobile).toMatch(/Turnos agendados/);
    expect(mobile).toContain('Horarios hoy');
    expect(mobile).toMatch(/agendaStatus\(\s*\)\.remainingAppointments/);
    expect(mobile).toMatch(/agendaStatus\(\s*\)\.freeSlots/);
    expect(componentSource).toMatch(/capacitySlots/);
    expect(componentSource).not.toMatch(/length:\s*18/);
  });

  it('lets the operator confirm a pending seña from Inicio', () => {
    expect(templateSource).toContain('Confirmar seña');
    expect(templateSource).not.toContain('Seña recibida');
    expect(templateSource).toMatch(/turno\.depositPending/);
    expect(componentSource).toMatch(/confirmDepositReceived\s*\(/);
  });

  it('renders Próximo turno from featuredAppointments without mock names or times', () => {
    const mobile = mobileSummaryBlock(templateSource);
    expect(mobile).toContain('Próximo turno');
    expect(mobile).toMatch(/featuredAppointments\(\s*\)/);
    expect(mobile).toMatch(/nextUpcomingAppointment\(\s*\)/);
    expect(componentSource).toMatch(/pickNextAppointment\s*\(/);
    expect(componentSource).not.toMatch(/appointmentStart\s*\(/);
    expect(mobile).not.toContain('María Gómez');
    expect(mobile).not.toContain('16:30');
  });

  it('keeps accesos rápidos copy for Crear turno and the PWA coach', () => {
    const mobile = mobileSummaryBlock(templateSource);
    expect(mobile).toContain('Accesos rápidos');
    expect(mobile).toContain('Crear turno');
    expect(mobile).toContain('Agendá manualmente un cliente');
    expect(mobile).toContain('/dashboard/turnos/new');
    expect(mobile).toContain('Instalá Orvel en tu teléfono');
    expect(mobile).toMatch(/data-testid=["']pwa-install-coach["']/);
  });

  it('uses Inicio mockup tokens in the mobile block', () => {
    const mobile = mobileSummaryBlock(templateSource);
    expect(mobile.includes('#0A0E1B') || mobile.includes('#7C5CFF')).toBe(true);
  });

  it('loads Plus Jakarta Sans and Manrope without dropping Inter', () => {
    expect(indexHtml).toMatch(/Plus\+Jakarta\+Sans|Plus Jakarta Sans/);
    expect(indexHtml).toMatch(/Manrope/);
    expect(indexHtml).toMatch(/Inter/);
  });

  it('makes the mobile Inicio surface claim the visual viewport, not only min-h-full', () => {
    const classes = mobileSummaryClass(templateSource);
    expect(classes).toMatch(/min-h-(?:dvh|svh)|min-h-\[100(?:dvh|svh|vh)\]|100dvh|100svh/);
    expect(classes.split(/\s+/)).not.toContain('min-h-full');
  });

  it('cancels page-root padding on all four sides for the mobile block', () => {
    const classes = mobileSummaryClass(templateSource);
    expect(classes.split(/\s+/)).toEqual(expect.arrayContaining(['-mx-4', '-mt-6', '-mb-10']));
  });

  it('paints the existing radial violet wash on #0A0E1B for the mobile home surface', () => {
    expect(componentSource).toContain('#0A0E1B');
    expect(componentSource).toMatch(/radial-gradient\(/);
    expect(componentSource).toContain('rgba(124, 92, 255');
    expect(componentSource).toMatch(/\.mobile-inicio\s*\{[\s\S]*#0A0E1B/);
  });

  it('paints a home-scoped viewport layer so shell chrome does not show unthemed slate on Inicio', () => {
    expect(componentSource).toMatch(/mobile-inicio-bleed/);
    expect(componentSource).toMatch(/position:\s*fixed/);
    expect(componentSource).toMatch(/inset:\s*0/);
  });
});
