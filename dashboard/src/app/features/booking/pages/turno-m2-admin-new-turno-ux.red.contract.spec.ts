import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const APP_ROUTES_PATH = new URL('../../../app.routes.ts', import.meta.url);
const DASHBOARD_SHELL_PATH = new URL('../../../dashboard-shell.routes.ts', import.meta.url);
const TURNOS_ROUTES_PATH = new URL('../turnos.routes.ts', import.meta.url);
const TURNOS_LIST_TS_PATH = new URL('./turnos-list.page.ts', import.meta.url);
const TURNOS_LIST_HTML_PATH = new URL('./turnos-list.page.html', import.meta.url);
const TURNO_FORM_TS_PATH = new URL('./turno-form.page.ts', import.meta.url);
const TURNO_FORM_HTML_PATH = new URL('./turno-form.page.html', import.meta.url);
const SCHEDULING_TS_PATH = new URL('../../../../../../../packages/booking/src/application/booking-scheduling.service.ts', import.meta.url);

const appRoutesSource = `${fs.readFileSync(APP_ROUTES_PATH, 'utf8')}\n${fs.readFileSync(DASHBOARD_SHELL_PATH, 'utf8')}\n${(() => {
  try {
    return fs.readFileSync(TURNOS_ROUTES_PATH, 'utf8');
  } catch {
    return '';
  }
})()}`;
const turnosListSource = fs.readFileSync(TURNOS_LIST_TS_PATH, 'utf8');
const turnosListTemplate = fs.readFileSync(TURNOS_LIST_HTML_PATH, 'utf8');
const turnoFormSource = fs.readFileSync(TURNO_FORM_TS_PATH, 'utf8');
const turnoFormTemplate = fs.readFileSync(TURNO_FORM_HTML_PATH, 'utf8');
const turnoServiceSource = fs.readFileSync(SCHEDULING_TS_PATH, 'utf8')
  + fs.readFileSync(new URL('../../../../../../../packages/booking/src/infrastructure/supabase/admin-booking.repository.ts', import.meta.url), 'utf8');

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

function tagWithTestId(sourceText: string, testId: string): string {
  return sourceText.match(new RegExp(`<[^>]+data-testid=["']${testId}["'][^>]*>`, 'i'))?.[0] ?? '';
}

function controlWithTestId(sourceText: string, testId: string): string {
  return sourceText.match(new RegExp(`<(?:input|select|textarea)\\b(?=[^>]*data-testid=["']${testId}["'])[^>]*>`, 'i'))?.[0] ?? '';
}

function countTestId(sourceText: string, testId: string): number {
  return sourceText.match(new RegExp(`data-testid=["']${testId}["']`, 'gi'))?.length ?? 0;
}

describe('M2 real admin new turno UX RED contract', () => {
  it('resolves an internal default branch scope before admin availability/create when MVP branch UI is hidden', () => {
    const checkAvailabilityBody = methodBody(turnoFormSource, 'checkAvailability');
    const saveBody = methodBody(turnoFormSource, 'save');

    expect(turnoFormTemplate, 'MVP branchless UX must not expose branch/sucursal controls when there are zero or one branches').toMatch(
      /branchContext\.branches\(\)\.length\s*>\s*1/i
    );
    expect(checkAvailabilityBody + saveBody, 'admin create/availability must explicitly resolve an internal default branch scope before backend calls').toMatch(
      /resolve(?:Internal|Default|Admin|Active)?Branch(?:Scope|Id)|ensure(?:Internal|Default|Admin|Active)?Branch(?:Scope|Id)|getOrProvisionDefaultBranch|defaultBranchScope/i
    );
    expect(saveBody, 'TurnoForm must not call TurnoService.create with an empty branchId fallback').not.toMatch(
      /branchId\s*:\s*branchId\s*\?\?\s*['"]{2}|branchId\s*:\s*['"]{2}/i
    );
    expect(saveBody, 'TurnoService.create must be called only after the internal branch scope is known').toMatch(
      /(?:resolve|ensure|getOrProvision)[\s\S]{0,600}branch[\s\S]{0,600}(?:turnoService|scheduling)\.create\(/i
    );
  });

  it('keeps TurnoForm disabled with generic account setup copy when internal branch resolution fails', () => {
    const canSaveBlock = turnoFormSource.match(/protected\s+canSave\s*=\s*computed\(\(\)\s*=>\s*\{[\s\S]{0,1100}?\}\);/i)?.[0] ?? '';
    const setupFailureCopy = `${turnoFormSource}\n${turnoFormTemplate}`.match(
      /(?:No pudimos preparar|configuraci[oó]n de cuenta|cuenta administradora|account setup|preparar el turno)[\s\S]{0,260}/i
    )?.[0] ?? '';

    expect(canSaveBlock, 'create submit must stay disabled when internal default branch/account setup resolution failed').toMatch(
      /branch(?:Scope|Id|Resolution|Setup).*?(?:Error|Failed|Ready)|accountSetup(?:Error|Ready)|defaultBranch(?:Error|Ready)|setupError/i
    );
    expect(setupFailureCopy, 'resolution failure must show generic account/setup copy, not raw branch-selection instructions').not.toBe('');
    expect(setupFailureCopy, 'generic account/setup failure copy must not mention Sucursal activa/raw branch UI').not.toMatch(
      /Sucursal activa|Seleccion[aá] una sucursal|Eleg[ií] una sucursal|ACTIVE_BRANCH_REQUIRED/i
    );
  });

  it('does not block MVP admin creation when there are no branches yet', () => {
    const ngOnInitBody = methodBody(turnoFormSource, 'ngOnInit');
    const canSaveBlock = turnoFormSource.match(/protected\s+canSave\s*=\s*computed\(\(\)\s*=>\s*\{[\s\S]{0,700}?\}\);/i)?.[0] ?? '';
    const saveBody = methodBody(turnoFormSource, 'save');

    expect(ngOnInitBody, 'MVP has no branches yet: /dashboard/turnos/new must still load clients/services and availability instead of failing early').not.toMatch(
      /branches\(\)\.length\s*===\s*0[\s\S]{0,180}ACTIVE_BRANCH_REQUIRED|branches\(\)\.length\s*===\s*0[\s\S]{0,180}return/i
    );
    expect(canSaveBlock, 'Nuevo Turno save enablement must not require an active branch while branches are hidden/disabled for MVP').not.toMatch(
      /activeBranchId\(\)|!!this\.branchContext\.activeBranchId\(\)/i
    );
    expect(saveBody, 'Nuevo Turno submit must not fail with a branch-required error before calling TurnoService.create for MVP').not.toMatch(
      /if\s*\([^)]*!branchId[^)]*\)[\s\S]{0,180}error\.set\([\s\S]{0,180}return/i
    );
  });

  it('hides or disables active-branch UI for MVP no-branch state instead of showing a blocking warning', () => {
    const branchSelectorSection = turnosListTemplate.match(/<section[\s\S]{0,2200}Sucursal activa[\s\S]{0,600}<\/section>/i)?.[0] ?? '';
    const formBranchGroup = turnoFormTemplate.match(/<div class="form-group" aria-live="polite">[\s\S]{0,1200}<\/div>/i)?.[0] ?? '';

    expect(branchSelectorSection + formBranchGroup, 'MVP should not show a blocking no-branch warning in Nuevo Turno/admin turnos UI').not.toMatch(
      /No hay sucursales activas|Configur[aá] una sucursal|ACTIVE_BRANCH_REQUIRED/i
    );
    expect(branchSelectorSection + formBranchGroup, 'branch controls should be absent or explicitly disabled when branches are not available yet').toMatch(
      /branches\(\)\.length\s*>\s*1|disabled|aria-disabled/i
    );
  });

  it('uses styled dashboard controls and deterministic selectors for required fields plus the create submit action', () => {
    const requiredSelectors = [
      'turno-admin-client-select',
      'turno-admin-service-select',
      'turno-admin-date',
      'turno-admin-available-slot-select',
      'turno-admin-duration'
    ];

    for (const testId of requiredSelectors) {
      const control = turnoFormTemplate.match(new RegExp(`<(?:input|select|textarea)\\b(?=[^>]*data-testid=["']${testId}["'])[^>]*>`, 'i'))?.[0] ?? '';
      expect(control, `required control ${testId} must exist with a stable selector`).not.toBe('');
      expect(control, `required control ${testId} must use the dashboard styled control class, not naked browser styling`).toMatch(/class=["'][^"']*(?:form-control|rounded-|or-|bg-bg-primary|border-white\/10)/i);
    }

    expect(turnoFormTemplate, 'new-turno form needs a deterministic create submit selector, distinct from reschedule-only selectors').toMatch(
      /<button\b(?=[^>]*type=["']submit["'])(?=[^>]*data-testid=["']turno-admin-submit-action["'])[^>]*>/i
    );
  });

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
    const hasNewRoute = /path:\s*["']new["'][\s\S]{0,220}TurnoFormPage/i.test(appRoutesSource);
    const hasRealModalFlow = /data-testid=["']turno-admin-new-modal["']|openAdminNewTurnoModal|openNewTurnoFlow/i.test(turnosListTemplate + turnosListSource);

    expect(hasNewRoute || hasRealModalFlow, 'M2 requires a real new-turno route or modal flow wired from the visible list action').toBe(true);
  });

  it('opens Nuevo Turno through a dark modal contract or renders the new form inside an equivalent modal shell', () => {
    const listEntrypoint = tagWithTestId(turnosListTemplate, 'turnos-admin-create-primary-action');
    const combinedNewTurnoUx = `${turnosListTemplate}\n${turnosListSource}\n${turnoFormTemplate}`;

    expect(listEntrypoint, 'Nuevo Turno entrypoint must remain visible and deterministic').not.toBe('');
    expect(listEntrypoint, 'Nuevo Turno should open a modal flow directly or navigate only to a route whose form renders as a modal shell').toMatch(
      /openAdminNewTurnoModal|openNewTurnoFlow|routerLink=["']\/dashboard\/turnos\/new["']/i
    );
    expect(combinedNewTurnoUx, 'Nuevo Turno UX must expose a deterministic modal dialog root').toMatch(
      /data-testid=["']turno-admin-new-modal["'][\s\S]{0,260}role=["']dialog["']|role=["']dialog["'][\s\S]{0,260}data-testid=["']turno-admin-new-modal["']/i
    );
    expect(combinedNewTurnoUx, 'Nuevo Turno modal must be an accessible modal, not a separate naked page').toMatch(/aria-modal=["']true["']/i);
    expect(combinedNewTurnoUx, 'Nuevo Turno modal needs an overlay/backdrop matching Nuevo Cliente dark zen shell').toMatch(
      /data-testid=["']turno-admin-new-modal-overlay["'][\s\S]{0,180}(?:backdrop-blur-md|bg-black\/65|fixed inset-0)/i
    );
  });

  it('matches Nuevo Cliente modal shell controls with deterministic shell, close, footer cancel, and submit selectors', () => {
    const combinedNewTurnoUx = `${turnosListTemplate}\n${turnoFormTemplate}`;

    expect(combinedNewTurnoUx, 'modal shell must have a stable selector for E2E/visual QA').toMatch(
      /data-testid=["']turno-admin-new-modal-shell["']/i
    );
    expect(combinedNewTurnoUx, 'modal shell must use the same dark/zen visual logic as Nuevo Cliente').toMatch(
      /data-testid=["']turno-admin-new-modal-shell["'][\s\S]{0,260}(?:bg-\[#121827\]|rounded-3xl|shadow-2xl|border-white\/10)/i
    );
    expect(combinedNewTurnoUx, 'modal close button must be deterministic and explicit').toMatch(
      /<button\b(?=[^>]*data-testid=["']turno-admin-new-modal-close["'])(?=[^>]*type=["']button["'])[^>]*>/i
    );
    expect(combinedNewTurnoUx, 'modal footer cancel action must be deterministic and explicit').toMatch(
      /<(?:button|a)\b(?=[^>]*data-testid=["']turno-admin-new-modal-cancel["'])[^>]*>/i
    );
    expect(combinedNewTurnoUx, 'modal submit action must keep the existing deterministic create selector').toMatch(
      /<button\b(?=[^>]*type=["']submit["'])(?=[^>]*data-testid=["']turno-admin-submit-action["'])[^>]*>/i
    );
  });

  it('renders Nuevo Turno form fields as dark modal controls rather than default white browser inputs', () => {
    const darkModalControlClass = /class=["'][^"']*(?:bg-\[#182033\]|bg-bg-primary|bg-surface|border-white\/10|text-white|text-text-primary|rounded-xl|rounded-zen-md)/i;
    const requiredDarkControls = [
      'turno-admin-client-select',
      'turno-admin-service-select',
      'turno-admin-date',
      'turno-admin-available-slot-select',
      'turno-admin-duration',
      'turno-admin-notes'
    ];

    for (const testId of requiredDarkControls) {
      const control = controlWithTestId(turnoFormTemplate, testId);
      expect(control, `required modal field ${testId} must exist`).not.toBe('');
      expect(control, `modal field ${testId} must carry explicit dark/zen control styling to avoid default white inputs`).toMatch(darkModalControlClass);
    }
  });

  it('uses a semantic Orvel modal layout with sectioned grid content and separated footer actions', () => {
    const combinedNewTurnoUx = `${turnosListTemplate}\n${turnoFormTemplate}`;

    expect(combinedNewTurnoUx, 'Nuevo Turno modal must keep the reusable form content mounted inside the modal shell instead of rendering a cramped/naked page form').toMatch(
      /data-testid=["']turno-admin-new-modal-shell["'][\s\S]{0,1200}(?:\[?ngTemplateOutlet\]?=["']turnoFormContent["']|data-testid=["']turno-admin-new-modal-form["']|<form\b)/i
    );
    expect(countTestId(turnoFormTemplate, 'turno-admin-new-modal-form'), 'the modal form selector must be unique and belong to the semantic form, not a wrapper').toBe(1);
    expect(turnoFormTemplate, 'modal form must declare a stable form selector and modern responsive grid layout').toMatch(
      /<form\b(?=[^>]*data-testid=["']turno-admin-new-modal-form["'])(?=[^>]*class=["'][^"']*(?:grid|space-y-zen|gap-zen|gap-6|gap-8))/i
    );
    expect(turnoFormTemplate, 'client/service/date/details must be grouped into semantic Orvel sections rather than loose legacy rows').toMatch(
      /<(?:section|fieldset)\b(?=[^>]*data-testid=["']turno-admin-new-modal-section-client["'])[^>]*>[\s\S]{0,1800}data-testid=["']turno-admin-client-select["']/i
    );
    expect(turnoFormTemplate, 'schedule controls must live in their own semantic Orvel grid section').toMatch(
      /<(?:section|fieldset)\b(?=[^>]*data-testid=["']turno-admin-new-modal-section-schedule["'])[^>]*>[\s\S]{0,1800}data-testid=["']turno-admin-date["'][\s\S]{0,1800}data-testid=["']turno-admin-available-slot-select["']/i
    );

    for (const testId of ['turno-admin-client-select', 'turno-admin-service-select', 'turno-admin-date', 'turno-admin-available-slot-select', 'turno-admin-duration']) {
      const control = controlWithTestId(turnoFormTemplate, testId);
      expect(control, `${testId} must be a full-width Orvel modal control`).toMatch(/\b(?:w-full|block\s+w-full|flex-1)\b/i);
    }

    expect(turnoFormTemplate, 'footer actions must be in a dedicated modal footer, visually separated from form fields').toMatch(
      /<(?:footer|div)\b(?=[^>]*data-testid=["']turno-admin-new-modal-footer["'])(?=[^>]*class=["'][^"']*(?:flex-col-reverse|pt-3|sm:flex-row|sm:justify-end|border-t|pt-6|justify-end))[\s\S]{0,1600}data-testid=["']turno-admin-new-modal-cancel["'][\s\S]{0,1600}data-testid=["']turno-admin-submit-action["']/i
    );
  });

  it('collects an existing client, service, date, backend slot, duration, and notes in the real new turno form', () => {
    expect(turnoFormTemplate, 'form must expose explicit existing-client selection for admin create').toMatch(
      /data-testid=["']turno-admin-client-select["']|name=["']cliente(?:Id)?["']/i
    );
    expect(turnoFormTemplate, 'form must not expose a walk-in customer path').not.toMatch(
      /data-testid=["']turno-admin-walk-in-name["']|data-testid=["']turno-admin-start-walk-in["']/i
    );
    expect(turnoFormTemplate, 'form must expose service selection').toMatch(/data-testid=["']turno-admin-service-select["']|name=["']servicio(?:Id)?["']/i);
    expect(turnoFormTemplate, 'form must expose date selection').toMatch(/data-testid=["']turno-admin-date["']/i);
    expect(controlWithTestId(turnoFormTemplate, 'turno-admin-date'), 'Nuevo turno date must not stay an unconstrained native calendar').not.toMatch(/type=["']date["']/i);
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
      /(?:turnoService|availability)\.loadAvailabilityAdminSlotTimes\(|turnoService\.queryAdminSlotAvailability\(|query_admin_slot_availability/i
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
      /createAdminManualBooking\(|create_admin_manual_booking|createManualBooking\(/i
    );
    expect(saveBody, 'new-turno submit must include branch context collected from real app state before calling TurnoService.create').toMatch(/branchId\s*:/i);
    expect(saveBody, 'new-turno conflict/errors must be shown safely without treating failures as success').toMatch(/SLOT_CONFLICT|SLOT_COLLISION|conflict|no disponible|bloqueado/i);
    expect(saveBody + createBody, 'successful create must invalidate admin availability so stale slots cannot be reused').toMatch(/invalidateAdminAvailability|resetAvailability/i);
    expect(saveBody + turnosListSource, 'successful create must return to or refresh the turnos timeline/list').toMatch(/refreshTurnosFromSource|getAll\(\)|navigate\(\[\s*["']\/dashboard\/turnos["']/i);
  });

  it('offers Nuevo turno dates only from remaining-capacity days in the booking window', () => {
    const dateControl = controlWithTestId(turnoFormTemplate, 'turno-admin-date');

    expect(dateControl, 'date control must remain a styled select/chips control with the existing testid').toMatch(/^<select\b/i);
    expect(turnoFormTemplate, 'date options must iterate remaining-capacity days, not a free calendar').toMatch(
      /data-testid=["']turno-admin-date["'][\s\S]{0,900}@for \((?:date|day) of bookableDates\(\)/i
    );
    expect(turnoFormSource, 'service/duration/branch changes must refresh bookable days before hours').toMatch(/refreshBookableDays\(/);
    expect(methodBody(turnoFormSource, 'onServicioChange'), 'service change must refresh bookable days').toMatch(/refreshBookableDays\(/);
    expect(turnoFormTemplate, 'duration change must refresh bookable days').toMatch(
      /data-testid=["']turno-admin-duration["'][\s\S]{0,280}refreshBookableDays\(/
    );
    expect(methodBody(turnoFormSource, 'onBranchSelectionChange'), 'branch change must refresh bookable days').toMatch(/refreshBookableDays\(/);
    expect(turnoFormTemplate, 'hour options must stay remaining-capacity only').toMatch(/@for \(horario of disponibles\(\)/);
  });
});
