import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const APP_ROUTES_PATH = new URL('../../../app.routes.ts', import.meta.url);
const TURNOS_LIST_TS_PATH = new URL('./turnos-list.page.ts', import.meta.url);
const TURNOS_LIST_HTML_PATH = new URL('./turnos-list.page.html', import.meta.url);
const TURNO_FORM_TS_PATH = new URL('./turno-form.page.ts', import.meta.url);
const TURNO_FORM_HTML_PATH = new URL('./turno-form.page.html', import.meta.url);
const TURNO_SERVICE_TS_PATH = new URL('../data-access/turno.service.ts', import.meta.url);

const appRoutesSource = fs.readFileSync(APP_ROUTES_PATH, 'utf8');
const turnosListSource = fs.readFileSync(TURNOS_LIST_TS_PATH, 'utf8');
const turnosListTemplate = fs.readFileSync(TURNOS_LIST_HTML_PATH, 'utf8');
const turnoFormSource = fs.readFileSync(TURNO_FORM_TS_PATH, 'utf8');
const turnoFormTemplate = fs.readFileSync(TURNO_FORM_HTML_PATH, 'utf8');
const turnoServiceSource = fs.readFileSync(TURNO_SERVICE_TS_PATH, 'utf8');

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

describe('M2 real admin new turno UX RED contract', () => {
  it('exposes a real visible primary create action on /dashboard/turnos, not only sr-only or test-only hooks', () => {
    const primaryActionMatch = turnosListTemplate.match(/<button[\s\S]{0,900}data-testid=["']turnos-admin-create-primary-action["'][\s\S]{0,900}>/i)
      ?? turnosListTemplate.match(/<a[\s\S]{0,900}data-testid=["']turnos-admin-create-primary-action["'][\s\S]{0,900}>/i);

    expect(primaryActionMatch?.[0] ?? '', 'list needs a visible, named primary action for admins to create a real turno').toMatch(/Nuevo Turno|Crear Turno/i);
    expect(primaryActionMatch?.[0] ?? '', 'primary create action must not be hidden behind sr-only/test-only compatibility hooks').not.toMatch(/\bsr-only\b|hidden|display:\s*none/i);
    expect(primaryActionMatch?.[0] ?? '', 'primary create action must navigate to the new-turno route or open the real new-turno flow').toMatch(
      /routerLink=["']\/dashboard\/turnos\/new["']|openNewTurnoFlow|openAdminNewTurnoModal/i
    );
  });

  it('wires a real /dashboard/turnos/new route or an explicit modal flow from the list', () => {
    const hasNewRoute = /path:\s*["']turnos\/new["'][\s\S]{0,220}TurnoFormPage/i.test(appRoutesSource);
    const hasRealModalFlow = /data-testid=["']turno-admin-new-modal["']|openAdminNewTurnoModal|openNewTurnoFlow/i.test(turnosListTemplate + turnosListSource);

    expect(hasNewRoute || hasRealModalFlow, 'M2 requires a real new-turno route or modal flow wired from the visible list action').toBe(true);
  });

  it('collects client or walk-in, service, date, backend slot, duration, and notes in the real new turno form', () => {
    expect(turnoFormTemplate, 'form must expose explicit existing-client selection for admin create').toMatch(
      /data-testid=["']turno-admin-client-select["']|name=["']cliente(?:Id)?["']/i
    );
    expect(turnoFormTemplate + turnoFormSource, 'form must support a walk-in customer path without relying on fake placeholder clients').toMatch(
      /data-testid=["']turno-admin-walk-in-name["']|walkInName|walk-in|sin cita/i
    );
    expect(turnoFormTemplate, 'form must expose service selection').toMatch(/data-testid=["']turno-admin-service-select["']|name=["']servicio(?:Id)?["']/i);
    expect(turnoFormTemplate, 'form must expose date selection').toMatch(/data-testid=["']turno-admin-date["']|type=["']date["']/i);
    expect(turnoFormTemplate, 'time choices must be an explicit backend availability slot selector').toMatch(
      /data-testid=["']turno-admin-available-slot-select["']|data-testid=["']turno-admin-available-slot-option["']/i
    );
    expect(turnoFormTemplate, 'form must expose duration control').toMatch(/data-testid=["']turno-admin-duration["']|name=["']duracion/i);
    expect(turnoFormTemplate, 'form must expose notes control').toMatch(/data-testid=["']turno-admin-notes["']|name=["']notas/i);
  });

  it('does not seed new admin booking with hardcoded launch blockers or hidden current-time payloads', () => {
    const listManualBookingBody = methodBody(turnosListSource, 'submitAdminManualBooking');
    const formSaveBody = methodBody(turnoFormSource, 'save');
    const newFlowSource = [listManualBookingBody, formSaveBody].join('\n');

    expect(newFlowSource, 'admin create path must not hardcode branch/service/client/persona placeholders').not.toMatch(
      /main-branch|admin-ui|svc-001|Cliente sin cita|prof-qa-001/i
    );
    expect(listManualBookingBody, 'list-side create path must not submit current time as a hidden booking payload').not.toMatch(
      /startsAtIso:\s*new Date\(\)\.toISOString\(\)|Date\.now\(\)/i
    );
    expect(turnoFormSource, 'new form must not preselect a fake default hour before backend availability returns').not.toMatch(
      /hora\s*=\s*signal<[^>]+>\(['"]\d{2}:\d{2}['"]\)|hora\s*=\s*signal\(['"]\d{2}:\d{2}['"]\)/i
    );
  });

  it('loads slot options through TurnoService backend availability before create and never from static/current-time defaults', () => {
    const availabilityBody = methodBody(turnoFormSource, 'checkAvailability');

    expect(availabilityBody, 'admin new turno flow must ask TurnoService for backend-decided slot availability').toMatch(
      /turnoService\.loadAvailabilityAdminSlotTimes\(|turnoService\.queryAdminSlotAvailability\(|query_admin_slot_availability/i
    );
    expect(availabilityBody, 'admin create availability request must pass the selected service and duration').toMatch(/serviceId[\s\S]{0,120}durationMinutes|durationMinutes[\s\S]{0,120}serviceId/i);
    expect(turnoFormTemplate + turnoFormSource, 'available slots must come from a loaded availability collection, not hardcoded time arrays').not.toMatch(
      /\[['"](?:09|10|11|12|13|14|15|16|17|18):(?:00|30)['"][\s\S]{0,120}\]/i
    );
  });

  it('creates through the admin manual booking RPC path with conflict-safe feedback, refresh, and availability invalidation', () => {
    const saveBody = methodBody(turnoFormSource, 'save');
    const createBody = methodBody(turnoServiceSource, 'create');
    const createWithSupabaseBody = methodBody(turnoServiceSource, 'createWithSupabase');

    expect(saveBody + createBody + createWithSupabaseBody, 'new-turno submit must flow to create_admin_manual_booking via TurnoService').toMatch(
      /createAdminManualBooking\(|create_admin_manual_booking/i
    );
    expect(saveBody, 'new-turno submit must include branch context collected from real app state before calling TurnoService.create').toMatch(/branchId\s*:/i);
    expect(saveBody, 'new-turno conflict/errors must be shown safely without treating failures as success').toMatch(/SLOT_CONFLICT|SLOT_COLLISION|conflict|no disponible|bloqueado/i);
    expect(saveBody + createBody, 'successful create must invalidate admin availability so stale slots cannot be reused').toMatch(/invalidateAdminAvailability/i);
    expect(saveBody + turnosListSource, 'successful create must return to or refresh the turnos timeline/list').toMatch(/refreshTurnosFromSource|getAll\(\)|navigate\(\[\s*["']\/dashboard\/turnos["']/i);
  });
});
