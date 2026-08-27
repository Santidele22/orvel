import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PAGE_TS = 'src/app/features/booking/pages/turnos-list.page.ts';
const PAGE_HTML = 'src/app/features/booking/pages/turnos-list.page.html';

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

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

function elementWithTestId(template: string, testId: string): string {
  const tagPattern = new RegExp(`<(?<tag>[a-z0-9-]+)\\b(?=[^>]*data-testid=["']${testId}["'])[^>]*>`, 'i');
  return tagPattern.exec(template)?.[0] ?? '';
}

function asideColumn(html: string): string {
  const match = /<aside\b[\s\S]*?<\/aside>/.exec(html);
  return match?.[0] ?? '';
}

function rescheduleDialogBlock(html: string): string {
  const modalAttr = /data-testid=["']turnos-admin-reschedule-modal["']/;
  const attrMatch = modalAttr.exec(html);
  if (!attrMatch?.index) return '';

  const openTagStart = html.lastIndexOf('<', attrMatch.index);
  if (openTagStart === -1) return '';

  const tagName = /^<([a-z0-9-]+)/i.exec(html.slice(openTagStart))?.[1];
  if (!tagName) return '';

  const closeTag = `</${tagName}>`;
  const closeIndex = html.indexOf(closeTag, attrMatch.index);
  if (closeIndex === -1) return html.slice(openTagStart);

  return html.slice(openTagStart, closeIndex + closeTag.length);
}

describe('Turnos admin reschedule modal contract', () => {
  it('renders a dashboard dialog gated on the open signal', () => {
    const html = read(PAGE_HTML);

    expect(html).toMatch(/@if\s*\(showAdminReschedulePanel\(\)\)[\s\S]{0,900}data-testid=["']turnos-admin-reschedule-modal["']/);
    expect(html).toMatch(
      /role=["']dialog["'][\s\S]{0,400}data-testid=["']turnos-admin-reschedule-modal["']|data-testid=["']turnos-admin-reschedule-modal["'][\s\S]{0,400}role=["']dialog["']/
    );
    expect(html).toMatch(/aria-modal=["']true["']/);
    expect(html).toMatch(/Reprogramar turno/);
  });

  it('keeps reschedule form fields inside the dialog, not the sidebar column', () => {
    const html = read(PAGE_HTML);
    const dialog = rescheduleDialogBlock(html);
    const sidebar = asideColumn(html);

    expect(dialog).toMatch(/data-testid=["']turnos-admin-reschedule-form["']/);
    expect(dialog).toMatch(/data-testid=["']turnos-admin-reschedule-date-field["']/);
    expect(dialog).toMatch(/data-testid=["']turnos-admin-reschedule-slot-select["']/);
    expect(dialog).toMatch(/data-testid=["']turnos-admin-reschedule-reason-field["']/);
    expect(dialog).toMatch(/data-testid=["']turnos-admin-reschedule-service-context["']/);
    expect(dialog).toMatch(/data-testid=["']turnos-admin-reschedule-branch-context["']/);
    expect(dialog).toMatch(/data-testid=["']turnos-admin-reschedule-feedback["']/);
    expect(dialog).toMatch(/data-testid=["']turnos-admin-reschedule-submit-action["']/);

    expect(sidebar).toMatch(/data-testid=["']turnos-admin-create-primary-action["']/);
    expect(sidebar).toMatch(/data-testid=["']turnos-admin-block-time-primary-action["']/);
    expect(sidebar).not.toMatch(/data-testid=["']turnos-admin-reschedule-form["']/);
  });

  it('dismisses via overlay without submitting reschedule', () => {
    const html = read(PAGE_HTML);
    const overlay = elementWithTestId(html, 'turnos-admin-reschedule-overlay');

    expect(overlay).not.toBe('');
    expect(html).toMatch(
      /data-testid=["']turnos-admin-reschedule-overlay["'][\s\S]{0,360}\(click\)=["']closeAdminReschedulePicker\(\)["']/
    );
    expect(overlay).not.toMatch(/submitAdminReschedule|rescheduleByAdmin/);
    expect(html).toMatch(/\(click\)=["']closeAdminReschedulePicker\(\)["']/);
  });

  it('opens the picker by setting the panel signal and loading admin-reschedule availability', () => {
    const ts = read(PAGE_TS);
    const openBody = methodBody(ts, 'openAdminReschedulePicker');
    const loadBody = methodBody(ts, 'loadAdminRescheduleAvailability');

    expect(openBody.length).toBeGreaterThan(0);
    expect(openBody).toMatch(/showAdminReschedulePanel\.set\(true\)/);
    expect(openBody).toMatch(/loadAdminRescheduleAvailability/);
    expect(loadBody).toMatch(/loadAvailabilityAdminSlotTimes/);
    expect(loadBody).toMatch(/admin-reschedule/);
  });

  it('does not use native confirm on the reschedule path', () => {
    const ts = read(PAGE_TS);
    const methods = [
      'openAdminReschedulePicker',
      'closeAdminReschedulePicker',
      'submitAdminReschedule',
      'rescheduleTurno',
      'rescheduleByAdmin'
    ];

    for (const methodName of methods) {
      const body = methodBody(ts, methodName);
      expect(body.length, methodName).toBeGreaterThan(0);
      expect(body, methodName).not.toMatch(/\b(?:window\.)?confirm\s*\(/);
    }
  });
});
