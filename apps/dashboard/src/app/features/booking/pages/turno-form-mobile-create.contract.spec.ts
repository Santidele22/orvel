import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pageTs = readFileSync(new URL('./turno-form.page.ts', import.meta.url), 'utf8');
const pageHtml = readFileSync(new URL('./turno-form.page.html', import.meta.url), 'utf8');

describe('turno form mobile create', () => {
  it('does not query admin slots until a service is selected', () => {
    expect(pageTs).toMatch(/if\s*\(\s*!this\.servicioId\(\)\s*\)/);
    expect(pageTs).toMatch(/Elegí un servicio para ver horarios/);
  });

  it('sends local dateIso and resolved businessId to availability', () => {
    expect(pageTs).toMatch(/dateIso:\s*this\.fecha\(\)/);
    expect(pageTs).toMatch(/businessId/);
    expect(pageTs).not.toMatch(/fecha = signal<string>\(new Date\(\)\.toISOString\(\)/);
  });

  it('matches the Nuevo Cliente modal field chrome', () => {
    expect(pageHtml).toContain('Formulario');
    expect(pageHtml).toContain('rounded-xl border border-white/10 bg-[#182033]');
    expect(pageHtml).toContain('h-11 rounded-xl bg-primary');
  });

  it('uses a centered cliente-style modal sheet instead of a full-viewport sheet', () => {
    expect(pageHtml).toMatch(
      /data-testid=["']turno-admin-new-modal-overlay["'][\s\S]{0,220}items-center justify-center/
    );
    expect(pageHtml).toMatch(
      /data-testid=["']turno-admin-new-modal["'][\s\S]{0,280}(?:max-w-lg|rounded-3xl|bg-\[#121827\])/
    );
    expect(pageHtml).not.toContain('h-[100dvh]');
  });

  it('exposes tappable slot chips for phone while keeping the select contract', () => {
    expect(pageHtml).toMatch(/data-testid=["']turno-admin-available-slot-select["']/);
    expect(pageHtml).toMatch(/data-testid=["']turno-admin-available-slot-chips["']/);
  });

  it('keeps Hora visible on phone with pick-service, loading, empty, error, and slot states', () => {
    const hourSelect = pageHtml.match(/<select\b[^>]*id=["']hora["'][^>]*>/)?.[0] ?? '';
    expect(hourSelect, 'Hora select must stay visible on phone; chips cannot be the only control and then disappear').not.toMatch(/max-lg:sr-only/);

    const chipsOpen = pageHtml.search(/data-testid=["']turno-admin-available-slot-chips["']/);
    const chipsPrefix = pageHtml.slice(Math.max(0, chipsOpen - 120), chipsOpen);
    expect(chipsPrefix, 'mobile slot surface must render even when disponibles() is still empty').not.toMatch(
      /@if\s*\(\s*disponibles\(\)\.length\s*>\s*0\s*\)/
    );

    expect(pageHtml).toMatch(/data-testid=["']turno-admin-availability-need-service["']/);
    expect(pageHtml).toMatch(/data-testid=["']turno-admin-availability-loading["']/);
    expect(pageHtml).toMatch(/data-testid=["']turno-admin-availability-empty["']/);
    expect(pageHtml).toMatch(/data-testid=["']turno-admin-availability-error["']/);
  });

  it('does not disable Hora on empty, stale, or error availability', () => {
    const hourSelect = pageHtml.match(/<select\b[^>]*id=["']hora["'][^>]*>/)?.[0] ?? '';
    const disabledBinding = hourSelect.match(/\[disabled\]="([^"]*)"/)?.[1] ?? '';

    expect(disabledBinding, 'Hora must stay tappable when the RPC is empty or fails').not.toBe('');
    expect(disabledBinding).toMatch(/!servicioId\(\)/);
    expect(disabledBinding).toMatch(/availabilityLoading\(\)/);
    expect(disabledBinding).not.toMatch(/availabilityEmpty\(\)/);
    expect(disabledBinding).not.toMatch(/availabilityStale\(\)/);
    expect(disabledBinding).not.toMatch(/availabilityError\(\)/);
  });

  it('tells the operator to try another date when this date has no slots', () => {
    expect(pageHtml).toContain(
      'No hay horarios para esta fecha. Probá otro día o revisá el horario de atención en Configuraciones.'
    );
  });

  it('does not map BOOKING_VALIDATION_ERROR to empty availability and shows branch copy for BRANCH_INACTIVE', () => {
    const checkAvailability = methodBody(pageTs, 'checkAvailability');

    expect(checkAvailability, 'checkAvailability must exist').not.toBe('');
    expect(checkAvailability).toMatch(/BOOKING_VALIDATION_ERROR/);
    expect(checkAvailability).not.toMatch(
      /BOOKING_VALIDATION_ERROR[\s\S]{0,400}availabilityEmpty\.set\(true\)/
    );
    expect(checkAvailability).not.toMatch(
      /BOOKING_VALIDATION_ERROR[\s\S]{0,200}availabilityError\.set\(null\)/
    );
    expect(checkAvailability).toMatch(/mapBookingValidationAvailabilityCopy\(/);
    expect(pageTs).toMatch(/BRANCH_INACTIVE/);
    expect(pageTs).toContain(
      'Esta sucursal no está activa. Elegí otra sucursal o revisá la configuración de cuenta.'
    );
    expect(checkAvailability).toMatch(/hasLoadedAvailability\.set\(true\)/);
    expect(checkAvailability).toMatch(/availabilityStale\.set\(false\)/);
  });

  it('maps hours, duration, and unknown validation errors to Spanish warnings instead of empty or crash copy', () => {
    const checkAvailability = methodBody(pageTs, 'checkAvailability');

    expect(checkAvailability, 'checkAvailability must exist').not.toBe('');
    expect(pageTs).toMatch(/WORKING_HOURS/);
    expect(pageTs).toMatch(/DURATION/);
    expect(pageTs).toContain(
      'El horario de atención de este día está incompleto o inválido. Revisá inicio y fin en Configuraciones.'
    );
    expect(pageTs).toContain(
      'La duración del servicio no es válida. Revisá el servicio o la duración.'
    );
    expect(pageTs).toContain(
      'No pudimos armar los horarios con esta configuración. Revisá sucursal, horario de atención y duración.'
    );
    expect(checkAvailability).not.toMatch(
      /BOOKING_VALIDATION_ERROR[\s\S]{0,400}No pudimos consultar disponibilidad\. Reintentá antes de guardar\./
    );
    expect(pageHtml).toMatch(/data-testid=["']turno-admin-availability-error["']/);
  });

  it('keeps the empty-hours warning only for a zero-slot success', () => {
    const checkAvailability = methodBody(pageTs, 'checkAvailability');

    expect(checkAvailability, 'checkAvailability must exist').not.toBe('');
    expect(checkAvailability).toMatch(/availabilityEmpty\.set\(horarios\.length === 0\)/);
    expect(pageHtml).toContain(
      'No hay horarios para esta fecha. Probá otro día o revisá el horario de atención en Configuraciones.'
    );
    expect(pageHtml).toMatch(
      /availabilityEmpty\(\)\s*&&\s*!availabilityLoading\(\)\s*&&\s*!availabilityError\(\)/
    );
    expect(checkAvailability).not.toMatch(
      /BOOKING_VALIDATION_ERROR[\s\S]{0,400}No hay horarios para esta fecha/
    );
    expect(pageHtml).toMatch(/data-testid=["']turno-admin-availability-empty["']/);
  });

  it('does not map SERVICE_NOT_FOUND availability errors to account-setup copy', () => {
    const checkAvailability = methodBody(pageTs, 'checkAvailability');

    expect(checkAvailability, 'checkAvailability must exist').not.toBe('');
    expect(checkAvailability).toMatch(/SERVICE_NOT_FOUND/);
    expect(checkAvailability).toMatch(/Ese servicio no pertenece a esta cuenta\. Recargá e intentá de nuevo\./);
    expect(checkAvailability).not.toMatch(
      /SERVICE_NOT_FOUND[\s\S]{0,240}No pudimos preparar el turno para esta cuenta/
    );
  });
});

function methodBody(sourceText: string, methodName: string): string {
  const signatureMatch = new RegExp(
    `\\n\\s{2}(?:private\\s+|protected\\s+|public\\s+)?(?:async\\s+)?${methodName}\\s*\\(`
  ).exec(sourceText);
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
