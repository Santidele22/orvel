import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function getRoutesSource(): string {
  const routesPath = resolve(process.cwd(), 'src/app/app.routes.ts');
  return readFileSync(routesPath, 'utf-8');
}

function getManageBookingSource(): string {
  const tsPath = resolve(process.cwd(), 'src/app/features/booking/pages/public/manage-booking.page.ts');
  const htmlPath = resolve(process.cwd(), 'src/app/features/booking/pages/public/manage-booking.page.html');

  try {
    return `${readFileSync(tsPath, 'utf-8')}\n${readFileSync(htmlPath, 'utf-8')}`;
  } catch {
    throw new Error(
      'TODO(Aurora): missing manage booking page at src/app/features/booking/pages/public/manage-booking.page.{ts,html}'
    );
  }
}

describe('Mini Calendly manage-by-token UI route RED contract', () => {
  it('registers /booking/manage route', () => {
    const routesSource = getRoutesSource();

    expect(routesSource).toMatch(/path:\s*['"]booking\/manage['"]/);
  });

  it('reads token from query params and calls manageBookingByToken through PublicBookingService', () => {
    const source = getManageBookingSource();

    expect(source).toMatch(/queryParamMap\.get\(['"]token['"]\)/);
    expect(source).toMatch(/PublicBookingService/);
    expect(source).toMatch(/manageBookingByToken\(/);
    expect(source).not.toMatch(/from\s+['"][^'"]*supabase-booking['"]/);
  });

  it('renders deterministic messages for invalid/expired/policy-window states', () => {
    const source = getManageBookingSource();

    expect(source).toMatch(/data-testid=["']manage-token-invalid-state["']/i);
    expect(source).toMatch(/data-testid=["']manage-token-expired-state["']/i);
    expect(source).toMatch(/data-testid=["']manage-policy-window-state["']/i);

    expect(source).toMatch(/El link del turno no es válido\./);
    expect(source).toMatch(/Este link del turno venció\./);
    expect(source).toMatch(/Este turno ya no se puede modificar online\./);
  });

  it('supports cancel/reschedule actions when policy allows changes', () => {
    const source = getManageBookingSource();

    expect(source).toMatch(/data-testid=["']manage-cancel-action["']/i);
    expect(source).toMatch(/data-testid=["']manage-reschedule-action["']/i);
    expect(source).toMatch(/(cancelBooking|onCancel|handleCancel)\(/);
    expect(source).toMatch(/(rescheduleBooking|onReschedule|handleReschedule)\(/);
    expect(source).toMatch(/canCancelOrReschedule/);
  });
});
