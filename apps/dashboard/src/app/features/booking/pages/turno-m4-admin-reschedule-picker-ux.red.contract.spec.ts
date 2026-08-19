import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const TURNOS_LIST_TS_PATH = new URL('./turnos-list.page.ts', import.meta.url);
const TURNOS_LIST_HTML_PATH = new URL('./turnos-list.page.html', import.meta.url);
const TURNO_FORM_TS_PATH = new URL('./turno-form.page.ts', import.meta.url);
const TURNO_FORM_HTML_PATH = new URL('./turno-form.page.html', import.meta.url);
const SCHEDULING_TS_PATH = new URL('../../../../../../../packages/booking/src/application/booking-scheduling.service.ts', import.meta.url);

const turnosListSource = readFileSync(TURNOS_LIST_TS_PATH, 'utf8');
const turnosListTemplate = readFileSync(TURNOS_LIST_HTML_PATH, 'utf8');
const turnoFormSource = readFileSync(TURNO_FORM_TS_PATH, 'utf8');
const turnoFormTemplate = readFileSync(TURNO_FORM_HTML_PATH, 'utf8');
const turnoServiceSource = readFileSync(SCHEDULING_TS_PATH, 'utf8');

function methodBody(sourceText: string, methodName: string): string {
  const signatureMatch = new RegExp(`\\n\\s{2}(?:private\\s+|protected\\s+|public\\s+)?(?:async\\s+)?${methodName}\\s*\\(`).exec(sourceText);
  if (!signatureMatch?.index) return '';

  const signatureStart = signatureMatch.index + 1;
  const bodyStart = sourceText.indexOf('{', signatureStart);
  if (bodyStart === -1) return '';

  let depth = 0;
  for (let index = bodyStart; index < sourceText.length; index += 1) {
    const char = sourceText[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;

    if (depth === 0) return sourceText.slice(signatureStart, index + 1);
  }

  return sourceText.slice(signatureStart);
}

function elementWithTestId(template: string, testId: string): string {
  const tagPattern = new RegExp(`<(?<tag>[a-z0-9-]+)\\b(?=[^>]*data-testid=["']${testId}["'])[^>]*>`, 'i');
  return tagPattern.exec(template)?.[0] ?? '';
}

describe('M4 admin reschedule picker UX RED contract', () => {
  it('exposes a visible row-level admin reschedule action with the stable M4 test id', () => {
    const action = elementWithTestId(turnosListTemplate, 'turnos-admin-reschedule-action');

    expect(action, 'existing turno rows need data-testid="turnos-admin-reschedule-action" on the visible reschedule CTA').not.toBe('');
    expect(action, 'reschedule CTA must be visible, not an sr-only compatibility hook').not.toMatch(/\bsr-only\b|hidden|aria-hidden=["']true["']|display:\s*none/i);
    expect(action, 'reschedule CTA must open the real picker/panel/form instead of immediately shifting the booking').toMatch(
      /openAdminReschedule|openReschedulePicker|showReschedule|routerLink=/i
    );
  });

  it('opens a real reschedule picker/panel/form with date, backend slot, booking context, and safe feedback hooks', () => {
    const combinedTemplate = `${turnosListTemplate}\n${turnoFormTemplate}`;

    expect(combinedTemplate, 'M4 picker/panel/form needs a stable root test id').toMatch(
      /data-testid=["']turnos-admin-reschedule-(?:form|panel|picker)["']|data-testid=["']turno-admin-reschedule-(?:form|panel|picker)["']/i
    );
    expect(combinedTemplate, 'M4 picker needs an explicit date field').toMatch(
      /data-testid=["']turnos-admin-reschedule-date-field["']|data-testid=["']turno-admin-reschedule-date-field["']|data-testid=["']turno-admin-date["']/i
    );
    expect(combinedTemplate, 'M4 picker needs a backend availability slot selector, not free text').toMatch(
      /data-testid=["']turnos-admin-reschedule-slot-select["']|data-testid=["']turno-admin-reschedule-slot-select["']|data-testid=["']turno-admin-available-slot-select["']/i
    );
    expect(combinedTemplate, 'branch/service context must be visible or explicitly represented from the existing booking').toMatch(
      /data-testid=["']turnos-admin-reschedule-(?:service|branch)-context["']|data-testid=["']turno-admin-reschedule-(?:service|branch)-context["']|serviceId|branchId/i
    );
    expect(combinedTemplate, 'conflict/backend unavailable responses need visible safe feedback').toMatch(
      /data-testid=["']turnos-admin-reschedule-feedback["']|data-testid=["']turno-admin-reschedule-feedback["']|No pudimos consultar disponibilidad|no disponible|conflict|bloqueado/i
    );
  });

  it('loads reschedule slots through the backend admin availability RPC path with booking context', () => {
    const rescheduleAvailabilitySource = [
      methodBody(turnosListSource, 'openAdminReschedulePicker'),
      methodBody(turnosListSource, 'loadAdminRescheduleAvailability'),
      methodBody(turnoFormSource, 'checkAvailability'),
      methodBody(turnoServiceSource, 'loadAvailabilityAdminSlotTimes'),
      methodBody(turnoServiceSource, 'queryAdminSlotAvailability')
    ].join('\n');

    expect(rescheduleAvailabilitySource, 'reschedule picker must call TurnoService backend availability').toMatch(
      /(?:turnoService|availability)\.loadAvailabilityAdminSlotTimes\(|turnoService\.queryAdminSlotAvailability\(|query_admin_slot_availability/i
    );
    expect(rescheduleAvailabilitySource, 'reschedule availability request must identify admin-reschedule context').toMatch(/admin-reschedule/i);
    expect(rescheduleAvailabilitySource, 'reschedule availability request must carry current booking id so the backend can exclude the booking being moved').toMatch(/bookingId\s*:\s*this\.turnoId\(\)|booking_id\s*:\s*request\.bookingId/i);
    expect(`${turnoFormSource}\n${turnoServiceSource}`, 'available reschedule slots must not come from hardcoded local business-hour arrays').not.toMatch(
      /\[['"](?:08|09|10|11|12|13|14|15|16|17|18|19|20|21):(?:00|30)['"][\s\S]{0,160}\]/i
    );
  });

  it('submits the user-selected reschedule date/time/slot and rejects current-time/static quick-shift payloads', () => {
    const listRescheduleBody = methodBody(turnosListSource, 'rescheduleTurno');
    const formSaveBody = methodBody(turnoFormSource, 'save');
    const rescheduleSubmitSource = `${listRescheduleBody}\n${formSaveBody}`;

    expect(rescheduleSubmitSource, 'reschedule submit must use the selected date field and selected slot/hour').toMatch(
      /(fecha|selectedDate|rescheduleDate)[\s\S]{0,220}(hora|selectedSlot|rescheduleSlot)|(hora|selectedSlot|rescheduleSlot)[\s\S]{0,220}(fecha|selectedDate|rescheduleDate)/i
    );
    expect(listRescheduleBody, 'list reschedule path must not keep the fake quick-shift addMinutes(current turno hour, 60) behavior').not.toMatch(
      /addMinutes\([^)]*turno\.hora[^)]*60|nextHour|Reprogramado desde acceso rápido/i
    );
    expect(rescheduleSubmitSource, 'reschedule submit must not use current time or static fixture dates').not.toMatch(
      /Date\.now\(|new Date\(\s*\)\.toISOString\(\)|startsAtIso\s*:\s*['"]20\d{2}-\d{2}-\d{2}T/i
    );
  });

  it('uses the RPC lifecycle path for reschedule and never direct table updates from page or service', () => {
    const rescheduleSources = [
      methodBody(turnosListSource, 'rescheduleTurno'),
      methodBody(turnoFormSource, 'save'),
      methodBody(turnoServiceSource, 'rescheduleByAdmin'),
      methodBody(turnoServiceSource, 'rescheduleByAdminWithSupabase'),
      methodBody(turnoServiceSource, 'rescheduleAdminBooking'),
      methodBody(turnoServiceSource, 'updateAdminBooking')
    ].join('\n');

    expect(rescheduleSources, 'M4 reschedule must go through TurnoService admin lifecycle RPC').toMatch(
      /(?:turnoService|scheduling)\.rescheduleByAdmin\(|rescheduleAdminBooking\(|reschedule_admin_booking|updateAdminBooking\(|update_admin_booking/i
    );
    expect(rescheduleSources, 'M4 must not write bookings/turnos directly with .update()').not.toMatch(
      /\.from\(\s*['"](?:turnos|bookings)['"]\s*\)[\s\S]{0,220}\.update\(/i
    );
  });

  it('validates required reschedule selection and blocks stale or unavailable slot submit', () => {
    const validationSource = `${turnoFormSource}\n${turnoFormTemplate}\n${turnosListSource}\n${turnosListTemplate}`;

    expect(validationSource, 'date and slot controls must be required in the real reschedule UX').toMatch(/required|Validators\.required|canSave|canSubmitReschedule/i);
    expect(validationSource, 'submit must be blocked while availability is stale/loading/error/empty').toMatch(
      /availability(?:Stale|Loading|Error|Empty)|hasLoadedAvailability|canSave|canSubmitReschedule/i
    );
    expect(validationSource, 'selected slot must be verified against current backend-provided slots before submit').toMatch(
      /disponibles\(\)\.includes\((?:this\.)?hora\(\)\)|availableSlots\(\)\.some|selectedSlot.*available/i
    );
  });

  it('invalidates admin availability and refreshes list/timeline after successful reschedule', () => {
    const listRescheduleBody = methodBody(turnosListSource, 'rescheduleTurno');
    const formSaveBody = methodBody(turnoFormSource, 'save');
    const serviceRescheduleBody = methodBody(turnoServiceSource, 'rescheduleByAdmin');
    const successSource = `${listRescheduleBody}\n${formSaveBody}\n${serviceRescheduleBody}`;

    expect(successSource, 'successful reschedule must invalidate admin availability before another picker can reuse stale slots').toMatch(
      /invalidateAdminAvailability|refreshTurnosFromSource|resetAvailability/i
    );
    expect(successSource, 'successful reschedule must refresh or return to the visible timeline/list').toMatch(
      /refreshTurnosFromSource\(|processTurnos\(|turnoService\.getAll\(|navigate\(\[\s*['"]\/dashboard\/turnos['"]/i
    );
  });

  it('shows safe visible feedback for backend conflict or unavailable errors during reschedule', () => {
    const rescheduleSources = `${turnoFormSource}\n${turnoFormTemplate}\n${turnosListSource}\n${turnosListTemplate}`;

    expect(rescheduleSources, 'reschedule conflicts must map to safe user-visible feedback').toMatch(
      /data-testid=["']turnos-admin-reschedule-feedback["']|data-testid=["']turno-admin-reschedule-feedback["']|SLOT_CONFLICT|TURNO_SLOT_COLLISION|no disponible|bloqueado|conflict/i
    );
    expect(rescheduleSources, 'backend unavailable availability failures must be visible and must not silently submit').toMatch(
      /data-testid=["']turno-admin-availability-error["']|No pudimos consultar disponibilidad|availabilityError/i
    );
  });
});
