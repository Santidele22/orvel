import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function getRoutesSource(): string {
  const routesPath = resolve(process.cwd(), 'src/app/app.routes.ts');
  return readFileSync(routesPath, 'utf-8');
}

function getPublicBookingSource(): string {
  const tsPath = resolve(process.cwd(), 'src/app/pages/booking/public-booking.page.ts');
  const htmlPath = resolve(process.cwd(), 'src/app/pages/booking/public-booking.page.html');

  try {
    return `${readFileSync(tsPath, 'utf-8')}\n${readFileSync(htmlPath, 'utf-8')}`;
  } catch {
    throw new Error(
      'TODO(Aurora): missing public booking page at src/app/pages/booking/public-booking.page.{ts,html}'
    );
  }
}

describe('Mini Calendly public booking UI route RED contract', () => {
  it('registers /booking/:slug route', () => {
    const routesSource = getRoutesSource();

    expect(routesSource).toMatch(/path:\s*['"]booking\/:slug['"]/);
  });

  it('loads business + availability through existing API adapter', () => {
    const source = getPublicBookingSource();

    expect(source).toMatch(/from\s+['"].*core\/api\/supabase-booking\.api['"]/);
    expect(source).toMatch(/resolveBusinessBySlug\(/);
    expect(source).toMatch(/data-testid=["']booking-business-name["']/i);
    expect(source).toMatch(/data-testid=["']booking-availability-slot["']/i);
  });

  it('validates required fields for name, whatsapp, email, notes', () => {
    const source = getPublicBookingSource();

    expect(source).toMatch(/data-testid=["']booking-field-name["']/i);
    expect(source).toMatch(/data-testid=["']booking-field-whatsapp["']/i);
    expect(source).toMatch(/data-testid=["']booking-field-email["']/i);
    expect(source).toMatch(/data-testid=["']booking-field-notes["']/i);

    expect(source).toMatch(/booking-field-name[\s\S]*required/i);
    expect(source).toMatch(/booking-field-whatsapp[\s\S]*required/i);
    expect(source).toMatch(/booking-field-email[\s\S]*required/i);
    expect(source).toMatch(/booking-field-notes[\s\S]*required/i);
  });

  it('submits booking and exposes confirmed semantic state', () => {
    const source = getPublicBookingSource();

    expect(source).toMatch(/createPublicBooking\(/);
    expect(source).toMatch(/data-testid=["']booking-submit-action["']/i);
    expect(source).toMatch(/data-testid=["']booking-confirmed-state["']/i);
    expect(source).toMatch(/(Booking confirmed|Reserva confirmada|Turno confirmado)/i);
  });
});
