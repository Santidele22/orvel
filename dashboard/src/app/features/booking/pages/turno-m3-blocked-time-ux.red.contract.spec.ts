import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const TURNOS_LIST_TS_PATH = new URL('./turnos-list.page.ts', import.meta.url);
const TURNOS_LIST_HTML_PATH = new URL('./turnos-list.page.html', import.meta.url);

const turnosListSource = readFileSync(TURNOS_LIST_TS_PATH, 'utf8');
const turnosListTemplate = readFileSync(TURNOS_LIST_HTML_PATH, 'utf8');
const combinedSource = `${turnosListSource}\n${turnosListTemplate}`;

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

describe('M3 blocked-time form UX RED contract', () => {
  it('resolves an internal branch before blocked-time open/submit or shows upfront generic setup copy without late branch UI text', () => {
    const openBlockedTimePanel = methodBody(turnosListSource, 'openBlockedTimePanel');
    const submitBlockedTime = methodBody(turnosListSource, 'submitBlockedTime');
    const blockedTimeRuntime = `${openBlockedTimePanel}\n${submitBlockedTime}`;

    expect(blockedTimeRuntime, 'blocked-time action must resolve/ensure the MVP internal default branch before opening or submitting').toMatch(
      /resolveScope|resolve(?:Internal|Default|Admin|Active)?Branch(?:Scope|Id)|ensure(?:Internal|Default|Admin|Active)?Branch(?:Scope|Id)|getOrProvisionDefaultBranch|defaultBranchScope/i
    );
    expect(blockedTimeRuntime, 'blocked-time flow must show account/setup copy before submit if internal scope cannot be prepared').toMatch(
      /No pudimos preparar|configuraci[oó]n de cuenta|cuenta administradora|account setup|preparar el bloqueo/i
    );
    expect(blockedTimeRuntime + turnosListTemplate, 'MVP branchless blocked-time UX must not show late raw branch-selection copy').not.toMatch(
      /Seleccion[aá] una sucursal activa|Sucursal activa|ACTIVE_BRANCH_REQUIRED/i
    );
    expect(submitBlockedTime, 'blocked-time payload must not send an empty branchId fallback to the service').not.toMatch(
      /branchId\s*:\s*branchId\s*\?\?\s*['"]{2}|branchId\s*:\s*['"]{2}/i
    );
  });

  it('exposes a real visible primary action on /dashboard/turnos, not only an sr-only test hook', () => {
    const primaryAction = elementWithTestId(turnosListTemplate, 'turnos-admin-block-time-primary-action');

    expect(primaryAction, 'blocked-time primary action must use stable data-testid="turnos-admin-block-time-primary-action"').not.toBe('');
    expect(primaryAction, 'blocked-time primary action must be visible to users').not.toMatch(/\bsr-only\b|hidden|aria-hidden=["']true["']|display:\s*none/i);
    expect(primaryAction, 'blocked-time primary action should open the real form/panel/modal').toMatch(/openBlockedTimePanel\(|showBlockedTimePanel|routerLink=/i);
  });

  it('renders a real blocked-time form/modal/panel with date, start time, end time, and reason fields', () => {
    expect(turnosListTemplate, 'form/panel/modal must have a stable root test id').toMatch(/data-testid=["']turnos-admin-block-time-form["']/i);

    for (const field of ['date', 'start-time', 'end-time', 'reason']) {
      expect(turnosListTemplate, `blocked-time form must expose ${field} field`).toMatch(
        new RegExp(`data-testid=["']turnos-admin-block-time-${field}-field["']`, 'i')
      );
    }

    expect(turnosListTemplate, 'the submit action must be part of the real visible form UX, not the old sr-only hook').toMatch(
      /<button\b(?=[^>]*data-testid=["']turnos-admin-block-time-submit-action["'])(?![^>]*\bsr-only\b)[^>]*>/i
    );
  });

  it('submits user-provided date/start/end/reason instead of current-time or hardcoded Lunch break defaults', () => {
    const submitBlockedTime = methodBody(turnosListSource, 'submitBlockedTime');

    expect(submitBlockedTime, 'submitBlockedTime must exist').not.toBe('');
    expect(submitBlockedTime, 'startsAtIso/endsAtIso must be built from form-provided date and times').toMatch(
      /(blockedTime|blockTime).{0,80}(date|fecha)[\s\S]{0,240}(start|inicio)[\s\S]{0,240}(end|fin)/i
    );
    expect(submitBlockedTime, 'reason must come from the form, not a literal default').toMatch(/reason\s*:\s*(?:this\.)?(?:blockedTime|blockTime|form|reason)/i);
    expect(submitBlockedTime, 'submit must not use current time as blocked-time payload').not.toMatch(/new Date\s*\(\s*\)|Date\.now\s*\(|3600000|\+\s*1\s*\*\s*60\s*\*\s*60/i);
    expect(submitBlockedTime, 'submit must not keep the old hardcoded Lunch break reason').not.toMatch(/['"]Lunch break['"]/i);
  });

  it('uses the backend blocked-time RPC path/Core API and never inserts blocked_times directly from the page', () => {
    const submitBlockedTime = methodBody(turnosListSource, 'submitBlockedTime');

    expect(submitBlockedTime, 'blocked-time creation must go through TurnoService/Core API/RPC wrapper').toMatch(
      /turnoService\.createBlockedTime\(|createAdminBlockedTime\(|create_admin_blocked_time/i
    );
    expect(submitBlockedTime, 'page must not write directly to the blocked_times table').not.toMatch(/\.from\(\s*['"]blocked_times['"]\s*\)|insert\s*\(/i);
  });

  it('does not assemble blocked-time tenant scope from auth user id and fails closed without active/default branch', () => {
    const submitBlockedTime = methodBody(turnosListSource, 'submitBlockedTime');

    expect(submitBlockedTime, 'submitBlockedTime must not use authService.user()?.id as businessId').not.toMatch(
      /businessId\s*:\s*(?:bizId|this\.authService\.user\(\)\?\.id)|const\s+bizId\s*=\s*this\.authService\.user\(\)\?\.id/i
    );
    expect(submitBlockedTime, 'submitBlockedTime must route through the default-branch resolver before calling TurnoService').toMatch(
      /ensureDefaultBranchId\(\)|ensureInternalDefaultBranchId\(\)|resolveActiveBranch|resolveScope\(/i
    );
    expect(submitBlockedTime, 'blocked-time submit must not relabel the implicit active branch as an explicit branchId payload').not.toMatch(
      /getActiveBranchId\(\)[\s\S]{0,500}branchId\s*:/i
    );
    expect(submitBlockedTime, 'blocked-time submit must fail closed with a safe validation error when branch context is missing').toMatch(
      /if\s*\([^)]*!branchId[\s\S]{0,220}blockedTimeError\.set\([\s\S]{0,220}return/i
    );
    expect(submitBlockedTime, 'the service call must happen after branch validation so NULL branch cannot create a global block').toMatch(
      /if\s*\([^)]*!branchId[\s\S]{0,260}return[\s\S]{0,700}(?:turnoService|scheduling)\.createBlockedTime\(/i
    );
  });

  it('validates required fields and end > start before calling the backend', () => {
    const submitBlockedTime = methodBody(turnosListSource, 'submitBlockedTime');

    expect(combinedSource, 'date/start/end/reason fields must be required in the visible UX').toMatch(/required|Validators\.required|block(?:ed)?Time(?:Form)?Valid|canSubmitBlockedTime/i);
    expect(submitBlockedTime + combinedSource, 'blocked-time UX must reject end time less than or equal to start time').toMatch(
      /end(?:Time)?(?:Iso|Minutes)?\s*(?:<=|>|isAfter)|start(?:Time)?(?:Iso|Minutes)?\s*(?:>=|<)|end.*must.*after.*start|fin.*(?:mayor|despu[eé]s).*inicio/i
    );
  });

  it('disables blocked-time submit until the form is complete and the range is valid, with a visible range error contract', () => {
    const submitButton = turnosListTemplate.match(
      /<button\b(?=[^>]*type=["']submit["'])(?=[^>]*data-testid=["']turnos-admin-block-time-submit-action["'])[^>]*>/i
    )?.[0] ?? '';

    expect(combinedSource, 'blocked-time form should expose a canSubmitBlockedTime guard for template and submit preflight').toMatch(
      /canSubmitBlockedTime\s*\(/i
    );
    expect(submitButton, 'blocked-time submit must be disabled while date/start/end/reason are missing or end <= start').toMatch(
      /\[disabled\]=["'][^"']*!canSubmitBlockedTime\(\)[^"']*["']/i
    );
    expect(turnosListTemplate, 'invalid end <= start must have a deterministic visible error target separate from backend collision feedback').toMatch(
      /data-testid=["']turnos-admin-block-time-range-error["'][\s\S]{0,220}(hora de fin|fin.*mayor|despu[eé]s de la hora de inicio)/i
    );
  });

  it('documents the valid blocked-time payload contract from date/start/end/reason controls', () => {
    const submitBlockedTime = methodBody(turnosListSource, 'submitBlockedTime');

    expect(submitBlockedTime, 'valid submit must build ISO boundaries from the visible date/start/end controls').toMatch(
      /buildBlockedTimeIso\(\s*blockedTimeDate\s*,\s*blockedTimeStartTime\s*,\s*blockedTimeEndTime\s*\)/i
    );
    expect(submitBlockedTime, 'valid submit must send startsAtIso, endsAtIso, reason, and performedBy to TurnoService.createBlockedTime while branch scope stays service-owned').toMatch(
      /createBlockedTime\(\s*(?:payload|\{)/i
    );
    expect(submitBlockedTime, 'valid blocked-time payload must not pass the page preflight/default branch as an explicit branchId').not.toMatch(
      /const\s+payload[\s\S]{0,320}branchId\s*:/i
    );
    expect(submitBlockedTime, 'reason must preserve the user-provided blocked-time reason').toMatch(/reason\s*:\s*this\.blockedTimeForm\.reason\.trim\(\)/i);
  });

  it('shows safe conflict feedback and refreshes timeline plus admin availability after success', () => {
    const submitBlockedTime = methodBody(turnosListSource, 'submitBlockedTime');
    const successBranch = submitBlockedTime.match(/if\s*\(\s*response\.data\s*\)\s*\{[\s\S]{0,700}/i)?.[0] ?? '';

    expect(combinedSource, 'backend collision must have visible safe feedback, not only a hidden test-only status').toMatch(
      /data-testid=["']turnos-admin-block-time-conflict-error["']|BLOCKED_TIME_COLLISION|horario.*(?:ocupado|bloqueado)|conflicto/i
    );
    expect(successBranch, 'successful blocked-time creation must refresh the visible turnos timeline/list').toMatch(/refreshTurnosFromSource\(|processTurnos\(|turnoService\.getAll\(/i);
    expect(successBranch, 'successful blocked-time creation must invalidate admin availability before stale slots are reused').toMatch(/turnoService\.invalidateAdminAvailability\(\)|refreshTurnosFromSource\(/i);
  });
});
