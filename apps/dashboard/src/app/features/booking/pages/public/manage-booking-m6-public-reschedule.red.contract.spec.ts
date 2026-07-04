import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { ManageBookingPage } from './manage-booking.page';
import { PublicBookingService } from '../../data-access/public-booking.service';

const appRoot = resolve(process.cwd(), 'src/app');
const pageTsPath = resolve(appRoot, 'features/booking/pages/public/manage-booking.page.ts');
const pageHtmlPath = resolve(appRoot, 'features/booking/pages/public/manage-booking.page.html');
const servicePath = resolve(appRoot, 'features/booking/data-access/public-booking.service.ts');

function readRequired(path: string): string {
  if (!existsSync(path)) {
    throw new Error(`M6 public reschedule contract target is missing: ${relative(process.cwd(), path)}`);
  }

  return readFileSync(path, 'utf8');
}

function pageSource(): string {
  return `${readRequired(pageTsPath)}\n${readRequired(pageHtmlPath)}`;
}

function productiveTsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      return productiveTsFiles(path);
    }

    if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts')) {
      return [];
    }

    return [path];
  });
}

describe('M6 public manage link reschedule UI RED contract', () => {
  function createManagePage(service: Partial<PublicBookingService>, query: Record<string, string>) {
    const injector = Injector.create({
      providers: [
        { provide: PublicBookingService, useValue: service },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(query) } },
        },
      ],
    });

    return runInInjectionContext(injector, () => new ManageBookingPage()) as any;
  }

  it('behavior: action=reschedule opens the guided picker only after successful token load and allowed policy', async () => {
    const queryPublicSlotAvailability = vi.fn(async () => ({
      data: { slots: [{ startsAtIso: '2026-07-10T15:00:00.000Z', endsAtIso: '2026-07-10T15:30:00.000Z' }] },
      status: 200,
    }));
    const page = createManagePage({
      manageBookingByToken: vi.fn(async () => ({
        data: {
          bookingId: 'booking-reschedule-001',
          businessId: 'business-001',
          serviceId: 'service-001',
          startsAtIso: '2026-07-10T14:00:00.000Z',
          status: 'booked',
          canCancelOrReschedule: true,
          business: { slug: 'studio-roma', name: 'Studio Roma' },
          actions: { canReschedule: true },
        },
        status: 200,
      })),
      queryPublicSlotAvailability,
    }, { token: 'private-token', action: 'reschedule' });

    await page.ngOnInit();

    expect(page.invalidToken()).toBe(false);
    expect(page.reschedulePickerOpen()).toBe(true);
    expect(page.policyWindowClosed()).toBe(false);
    expect(queryPublicSlotAvailability).toHaveBeenCalledWith({
      businessSlug: 'studio-roma',
      serviceId: 'service-001',
      dateIso: '2026-07-10',
    });
    expect(page.availableRescheduleSlots()).toEqual([
      { startsAtIso: '2026-07-10T15:00:00.000Z', endsAtIso: '2026-07-10T15:30:00.000Z' },
    ]);
  });

  it('behavior: action=reschedule does not label cancel-allowed/reschedule-blocked state as fully policy-window closed', async () => {
    const page = createManagePage({
      manageBookingByToken: vi.fn(async () => ({
        data: {
          bookingId: 'booking-cancel-only-001',
          businessId: 'business-001',
          serviceId: 'service-001',
          startsAtIso: '2026-07-10T14:00:00.000Z',
          status: 'booked',
          canCancelOrReschedule: true,
          business: { slug: 'studio-roma', name: 'Studio Roma' },
          actions: { canReschedule: false },
        },
        status: 200,
      })),
      queryPublicSlotAvailability: vi.fn(),
    }, { token: 'private-token', action: 'reschedule' });

    await page.ngOnInit();

    expect(page.canCancelOrReschedule()).toBe(true);
    expect(page.canReschedule()).toBe(false);
    expect(page.reschedulePickerOpen()).toBe(false);
    expect(page.policyWindowClosed()).toBe(false);
  });

  it('exposes the reschedule action only from backend-provided policy/actions and never for closed token states', () => {
    const source = pageSource();

    expect(source).toMatch(/actions|canReschedule|canCancelOrReschedule|policy/i);
    expect(source).toMatch(/data-testid=["']manage-reschedule-action["']/i);
    expect(source, 'reschedule action must be gated by backend manage state/policy, not unconditional local UI state').toMatch(
      /@if\s*\([^)]*(?:canReschedule|canCancelOrReschedule|policy|actions)[^)]*\)/i
    );
    expect(source, 'closed token states must fail closed and hide unsafe actions').toMatch(/canCancelOrReschedule\.set\(false\)/);
    expect(source, 'cancelled bookings must not keep public reschedule enabled').toMatch(/CLOSED_STATUSES|BOOKING_ALREADY_CANCELLED|cancelled/i);
  });

  it('opens a real reschedule picker with date and backend-provided slot/time choices in token context', () => {
    const source = pageSource();

    expect(source).toMatch(/data-testid=["']manage-reschedule-picker["']/i);
    expect(source, 'picker must include a user-selectable date control').toMatch(/type=["']date["']|data-testid=["']manage-reschedule-date["']/i);
    expect(source, 'picker must include user-selectable backend slot/time choices').toMatch(
      /data-testid=["']manage-reschedule-slot["']|<select[\s\S]*slot|radio[\s\S]*(?:slot|time|horario)/i
    );
    expect(source, 'reschedule flow must retain token as private input/context but never render it').toMatch(/queryParamMap\.get\(['"]token['"]\)/);
    expect(source, 'private token must not be interpolated into picker or visible UI').not.toMatch(/{{\s*(?:token|manageToken|managementKey)\s*(?:\(\))?\s*}}/i);
  });

  it('honors action=reschedule by opening the guided reschedule flow after token validation', () => {
    const source = pageSource();

    expect(source).toMatch(/queryParamMap\.get\(['"]action['"]\)/);
    expect(source).toMatch(/requestedAction|action=reschedule|rescheduleRequested/i);
    expect(source).toMatch(/openRequestedRescheduleAction|handleReschedule\(\)/);
    expect(source).toMatch(/data-testid=["']manage-reschedule-guidance["']/i);
    expect(source).toMatch(/Elegí una nueva fecha y horario|Nueva fecha/i);
  });

  it('loads reschedule availability from backend/gateway or fails closed instead of inventing local slots', () => {
    const source = pageSource();
    const serviceSource = readRequired(servicePath);
    const availabilityPath = `${source}\n${serviceSource}`;

    expect(
      availabilityPath,
      'reschedule availability must be gateway-driven; if no public reschedule availability exists, implement a safe unavailable/fallback state'
    ).toMatch(/(?:reschedule.*availability|availability.*reschedule|queryPublicSlotAvailability|loadPublicRescheduleSlots|manage-reschedule-unavailable-state)/i);
    expect(source, 'UI must expose a safe fallback/message when backend availability cannot be loaded').toMatch(
      /data-testid=["']manage-reschedule-unavailable-state["']|availability(?:Error|Unavailable|Failed)|No hay horarios disponibles/i
    );
    expect(source, 'reschedule slots must not come from hardcoded local business-hour arrays or fixtures').not.toMatch(
      /(?:availableSlots|slots|horarios)\s*=\s*\[[\s\S]{0,600}(?:09:00|10:00|11:00|12:00|13:00|14:00|15:00|16:00|17:00|18:00)|fixture|mockSlots|demoSlots/i
    );
  });

  it('submits via PublicBookingService.rescheduleBookingByToken with selected startsAtIso, never admin/direct table update', () => {
    const source = pageSource();

    expect(source).toMatch(/await\s+this\.publicBookingService\.rescheduleBookingByToken\(/);
    expect(source, 'public reschedule must pass token, nowIso, and the user-selected startsAtIso').toMatch(
      /rescheduleBookingByToken\(\s*token\s*,\s*(?:nowIso|new Date\(\)\.toISOString\(\))\s*,\s*(?:selectedSlot|selectedStartsAt|startsAtIso|rescheduleStartsAt)/i
    );
    expect(source, 'submit must not synthesize the target time from current clock or fixture values').not.toMatch(
      /rescheduleBookingByToken\([^)]*(?:Date\.now\(\)|new Date\(\)|\+\s*(?:30|60|3600)|2026-\d{2}-\d{2}T\d{2}:\d{2})/i
    );
    expect(source, 'public reschedule must not call admin lifecycle methods').not.toMatch(/rescheduleBooking\(|updateBooking|adminReschedule|createAdmin/i);
    expect(source, 'public reschedule must not update bookings directly from the browser').not.toMatch(/\.from\(['"]bookings['"]\)[\s\S]{0,300}\.update\(/);
  });

  it('validates required selection and blocks stale or unavailable selected slots before submit', () => {
    const source = pageSource();

    expect(source, 'date/slot selection must be required before submitting').toMatch(
      /selected(?:Date|Slot|StartsAt)|required|manage-reschedule-required-state/i
    );
    expect(source, 'submit guard must verify selected slot is still in current backend-provided availability').toMatch(
      /available(?:Reschedule)?Slots\(\)\.(?:some|includes)|selectedSlot.*available|isSelectedSlotAvailable|hasLoadedAvailability/i
    );
    expect(source, 'stale availability must block submit after date/availability changes or backend failures').toMatch(
      /stale|availability(?:Version|Request|Loaded|Error|Unavailable)|hasLoadedAvailability\.set\(false\)/i
    );
    expect(source, 'template must render a deterministic validation/fail-closed message').toMatch(
      /data-testid=["']manage-reschedule-required-state["']|data-testid=["']manage-reschedule-stale-state["']|Elegí un horario disponible|seleccion/i
    );
  });

  it.each([
    ['INVALID_TOKEN', 'manage-token-invalid-state'],
    ['TOKEN_EXPIRED', 'manage-token-expired-state'],
    ['TOKEN_REVOKED', 'manage-token-revoked-state'],
    ['BOOKING_ALREADY_CANCELLED', 'manage-already-cancelled-state'],
    ['POLICY_WINDOW_CLOSED', 'manage-policy-window-state'],
    ['BACKEND_UNAVAILABLE', 'manage-reschedule-unavailable-state']
  ] as const)('fails closed for %s with a safe message and no enabled reschedule submit', (errorCode, testId) => {
    const source = pageSource();

    expect(source).toMatch(new RegExp(errorCode));
    expect(source).toMatch(new RegExp(`data-testid=["']${testId}["']`, 'i'));
    expect(source, `${errorCode} must not leave public reschedule enabled`).toMatch(/canCancelOrReschedule\.set\(false\)|canReschedule\.set\(false\)/);
  });

  it('handles successful reschedule by refreshing manage state or rendering a terminal success state that hides unsafe actions', () => {
    const source = pageSource();

    expect(source).toMatch(/rescheduleBookingByToken\(/);
    expect(source, 'success must refresh manage state or show an explicit rescheduled terminal state').toMatch(
      /manageBookingByToken\(\s*token\s*,\s*new Date\(\)\.toISOString\(\)\s*\)|data-testid=["']manage-rescheduled-state["']|rescheduled\.set\(true\)/i
    );
    expect(source, 'after terminal success/revocation the unsafe actions must be hidden').toMatch(/canCancelOrReschedule\.set\(false\)|canReschedule\.set\(false\)/);
  });

  it('does not leak raw manage tokens or perform productive direct manage_token lookup/update paths', () => {
    const combinedProductiveSource = productiveTsFiles(appRoot)
      .map((file) => `\n/* ${relative(appRoot, file)} */\n${readFileSync(file, 'utf8')}`)
      .join('\n');
    const source = pageSource();
    const templateSource = readRequired(pageHtmlPath);
    const serviceSource = readRequired(servicePath);

    expect(source, 'public page must not log private manage tokens').not.toMatch(/console\.(?:log|info|warn|error|debug)\([^)]*token/i);
    expect(templateSource, 'public page must not render private manage token fields').not.toMatch(/manageToken|manage_token|management_key/i);
    expect(serviceSource, 'PublicBookingService must remain gateway-only').not.toMatch(/createClient|\.rpc\(|\.from\(/);
    expect(combinedProductiveSource, 'frontend productive code must not authenticate by raw manage_token equality lookup').not.toMatch(
      /\.eq\(\s*['"]manage_token['"]\s*,\s*(?:token|manageToken|managementKey)/i
    );
    expect(combinedProductiveSource, 'frontend productive code must not direct-select manage_token from tables').not.toMatch(
      /\.from\(['"][^'"]+['"]\)[\s\S]{0,500}\.select\([^)]*manage_token/i
    );
  });
});
