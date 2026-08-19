import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const TURNO_FORM_TS_PATH = new URL('./turno-form.page.ts', import.meta.url);
const TURNO_FORM_HTML_PATH = new URL('./turno-form.page.html', import.meta.url);
const TURNOS_LIST_TS_PATH = new URL('./turnos-list.page.ts', import.meta.url);
const TURNO_FACADE_TS_PATH = new URL('../data-access/turno.facade.ts', import.meta.url);

const turnoFormSource = fs.readFileSync(TURNO_FORM_TS_PATH, 'utf8');
const turnoFormTemplate = fs.readFileSync(TURNO_FORM_HTML_PATH, 'utf8');
const turnosListSource = fs.readFileSync(TURNOS_LIST_TS_PATH, 'utf8');
const turnoServiceSource = fs.readFileSync(TURNO_FACADE_TS_PATH, 'utf8');

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

describe('Core Slice 6 admin availability UX/runtime async behavior RED contract', () => {
  it('keeps admin availability as explicit async state: loading, error, empty, and freshness metadata are visible to the form', () => {
    expect(turnoFormSource, 'form must expose a distinct availability loading signal while the RPC is pending').toMatch(
      /availability(?:Loading|Pending)|loadingAvailability|adminAvailabilityLoading/i
    );
    expect(turnoFormSource, 'form must expose a safe availability error state instead of silently preserving old slots').toMatch(
      /availability(?:Error|Failure)|adminAvailabilityError/i
    );
    expect(turnoFormSource, 'form must model empty backend availability separately from a stale/unknown request').toMatch(
      /availability(?:Empty|Loaded)|adminAvailabilityEmpty|hasLoadedAvailability/i
    );
    expect(turnoFormSource, 'form must track a request token/key/version so stale RPC responses cannot repopulate slots').toMatch(
      /availability(?:Request|Token|Version|Key)|latestAvailability/i
    );
  });

  it('renders safe loading/error/empty states and disables submit whenever availability is pending, failed, empty, or stale', () => {
    expect(turnoFormTemplate, 'template needs a user-visible loading state for availability, not only whole-page loading').toMatch(
      /data-testid=["']turno-admin-availability-loading["']|availability-loading|Consultando disponibilidad/i
    );
    expect(turnoFormTemplate, 'template needs a safe error/empty fallback when the availability RPC fails').toMatch(
      /data-testid=["']turno-admin-availability-error["']|availability-error|No pudimos consultar disponibilidad/i
    );
    expect(turnoFormTemplate, 'template needs an empty state for zero available backend slots').toMatch(
      /data-testid=["']turno-admin-availability-empty["']|availability-empty|No hay horarios disponibles/i
    );

    const submitButtonMatch = turnoFormTemplate.match(/<button[\s\S]{0,500}data-testid=["']turno-admin-reschedule-submit["'][\s\S]{0,700}>/i);
    expect(submitButtonMatch?.[0] ?? '', 'submit must be disabled unless current backend availability is known-fresh and selectable').toMatch(
      /availability(?:Loading|Pending|Error|Empty|Stale|Fresh|Loaded)|canSubmit|canSave/i
    );
  });

  it('resets current slots and selected hour before reloading when service/date/duration/branch inputs change', () => {
    const changeHandlers = [
      methodBody(turnoFormSource, 'onfechaChange'),
      methodBody(turnoFormSource, 'onServicioChange'),
      methodBody(turnoFormSource, 'checkAvailability')
    ].join('\n');

    expect(changeHandlers, 'availability-changing inputs must clear old exposed slots before a backend reload starts').toMatch(
      /disponibles\.set\(\s*\[\s*\]\s*\)|resetAvailability|clearAvailability/i
    );
    expect(changeHandlers, 'stale selected hours must be cleared or marked invalid before fresh availability returns').toMatch(
      /hora\.set\(\s*['"]{2}\s*\)|conflictError\.set\([^)]*(stale|disponibilidad|horario|available)/i
    );
    expect(changeHandlers, 'service/date/duration/branch changes must reload from backend availability, not trust previous cache').toMatch(
      /refreshAvailability|loadAvailability|queryAdminSlotAvailability|getHorariosDisponibles(?:ConConfiguracion)?\(/i
    );
  });

  it('does not allow stale cached admin slots to remain valid after RPC error or empty response', () => {
    const queryBody = methodBody(turnoServiceSource, 'queryAdminSlotAvailability');

    expect(queryBody, 'RPC failures must invalidate cached availability for the same request key before returning safe empty state').toMatch(
      /adminAvailabilityCache\.(?:delete|set)\([^)]*(?:\[\s*\]|undefined|null)|invalidateAdminAvailability|clearAdminAvailability/i
    );
    expect(queryBody, 'empty backend availability must overwrite previous cached slots for the same request key').toMatch(
      /adminAvailabilityCache\.set\([^,]+,\s*slots\)|adminAvailabilityCache\.set\([^,]+,\s*\[\s*\]\s*\)/i
    );

    const syncMethods = [
      methodBody(turnoServiceSource, 'getHorariosDisponibles'),
      methodBody(turnoServiceSource, 'getHorariosDisponiblesConConfiguracion')
    ].join('\n');
    expect(syncMethods, 'synchronous callers must not expose previous cache while a new RPC is pending').toMatch(
      /pending|loading|stale|invalidateAdminAvailability|adminAvailabilityCache\.delete/i
    );
  });

  it('invalidates/refetches admin availability after create/update/reschedule/cancel/block before another submit can reuse old slots', () => {
    const lifecycleSources = [
      methodBody(turnoServiceSource, 'create'),
      methodBody(turnoServiceSource, 'update'),
      methodBody(turnoServiceSource, 'updateEstado'),
      methodBody(turnoServiceSource, 'cancelByAdmin'),
      methodBody(turnoServiceSource, 'rescheduleByAdmin'),
      methodBody(turnoServiceSource, 'createBlockedTime'),
      methodBody(turnosListSource, 'submitAdminManualBooking'),
      methodBody(turnosListSource, 'submitBlockedTime'),
      methodBody(turnosListSource, 'rescheduleTurno'),
      methodBody(turnosListSource, 'cancelTurno')
    ].join('\n');

    expect(lifecycleSources, 'admin lifecycle mutations must invalidate availability caches/tokens').toMatch(
      /invalidateAdminAvailability|clearAdminAvailability|availabilityVersion\.update|availabilityStale\.set\(\s*true/i
    );
    expect(lifecycleSources, 'after admin mutations the runtime must refetch backend availability before allowing a new stale-slot submit').toMatch(
      /refreshAvailability|loadAvailability|queryAdminSlotAvailability|getHorariosDisponibles(?:ConConfiguracion)?\(/i
    );
  });

  it('routes list manual booking entry point to the real admin form instead of direct fake payload creation', () => {
    const submitManualBooking = methodBody(turnosListSource, 'submitAdminManualBooking');

    expect(submitManualBooking, 'list manual booking must navigate into the real admin create form').toMatch(/navigate\(\[\s*['"]\/dashboard\/turnos\/new['"]\s*\]\)/i);
    expect(submitManualBooking, 'list manual booking must not keep the removed direct fake payload path').not.toMatch(/createAdminManualBooking\(/);
  });

  it('invalidates admin availability from the turnos list after a successful direct blocked-time API call', () => {
    const submitBlockedTime = methodBody(turnosListSource, 'submitBlockedTime');
    const dataSuccessBranch = submitBlockedTime.match(/if\s*\(\s*response\.data\s*\)\s*\{[\s\S]{0,500}/i)?.[0] ?? '';

    expect(submitBlockedTime, 'list blocked-time creation still calls the direct admin block API helper').toMatch(/createAdminBlockedTime\(/);
    expect(dataSuccessBranch, 'direct list blocked-time success path must invalidate shared admin availability cache/freshness').toMatch(
      /turnoService\.invalidateAdminAvailability\(\)|refreshTurnosFromSource\(/i
    );
  });
});
