import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('./turno-form.page.html', import.meta.url), 'utf8');
const scss = readFileSync(new URL('./turno-form.page.scss', import.meta.url), 'utf8');

function tagWithTestId(sourceText: string, testId: string): string {
  return sourceText.match(new RegExp(`<[^>]+data-testid=["']${testId}["'][^>]*>`, 'i'))?.[0] ?? '';
}

function controlWithTestId(sourceText: string, testId: string): string {
  return sourceText.match(
    new RegExp(`<(?:input|select|textarea)\\b(?=[^>]*data-testid=["']${testId}["'])[^>]*>`, 'i')
  )?.[0] ?? '';
}

describe('Turno form matches Nuevo Cliente chrome', () => {
  it('keeps the existing modal and field testids', () => {
    for (const testId of [
      'turno-admin-new-modal',
      'turno-admin-new-modal-overlay',
      'turno-admin-new-modal-shell',
      'turno-admin-new-modal-form',
      'turno-admin-new-modal-close',
      'turno-admin-new-modal-cancel',
      'turno-admin-submit-action',
      'turno-admin-new-modal-section-client',
      'turno-admin-new-modal-section-schedule',
      'turno-admin-client-select',
      'turno-admin-service-select',
      'turno-admin-date',
      'turno-admin-available-slot-select',
      'turno-admin-duration',
      'turno-admin-notes'
    ]) {
      expect(html, `missing testid ${testId}`).toContain(`data-testid="${testId}"`);
    }
    expect(html, 'walk-in name control must be absent').not.toContain('data-testid="turno-admin-walk-in-name"');
  });

  it('centers the overlay like Nuevo Cliente instead of a full-viewport sheet', () => {
    const overlay = tagWithTestId(html, 'turno-admin-new-modal-overlay');

    expect(overlay).toContain('items-center');
    expect(overlay).toContain('justify-center');
    expect(overlay).toContain('bg-black/65');
    expect(overlay).toContain('backdrop-blur-md');
    expect(overlay).toMatch(/\bp-4\b/);
    expect(overlay).not.toContain('items-end');
    expect(html).not.toContain('h-[100dvh]');
  });

  it('uses the Nuevo Cliente sheet tokens on the modal and shell', () => {
    const sheet = tagWithTestId(html, 'turno-admin-new-modal');
    const shell = tagWithTestId(html, 'turno-admin-new-modal-shell');

    expect(sheet).toContain('max-w-lg');
    expect(sheet).toContain('rounded-3xl');
    expect(sheet).toContain('border-white/10');
    expect(sheet).toContain('bg-[#121827]');
    expect(shell).toContain('bg-[#121827]');
    expect(`${sheet}\n${shell}`).not.toContain('#151b2b');
  });

  it('styles field controls with the Nuevo Cliente input fill', () => {
    for (const testId of [
      'turno-admin-client-select',
      'turno-admin-service-select',
      'turno-admin-date',
      'turno-admin-available-slot-select',
      'turno-admin-duration',
      'turno-admin-notes'
    ]) {
      const control = controlWithTestId(html, testId);
      expect(control, `${testId} must exist`).not.toBe('');
      expect(control, `${testId} must use cliente input fill`).toContain('bg-[#182033]');
      expect(control, `${testId} must not keep servicios fill`).not.toContain('#1a2236');
    }
  });

  it('matches Nuevo Cliente footer and action chrome', () => {
    const footer = tagWithTestId(html, 'turno-admin-new-modal-footer');
    const cancel = tagWithTestId(html, 'turno-admin-new-modal-cancel');
    const submit = tagWithTestId(html, 'turno-admin-submit-action');

    expect(footer).toContain('flex-col-reverse');
    expect(footer).toContain('sm:flex-row');
    expect(footer).toContain('sm:justify-end');
    expect(cancel).toContain('rounded-xl');
    expect(submit).toContain('rounded-xl');
    expect(cancel).not.toContain('rounded-full');
    expect(submit).not.toContain('rounded-full');
    expect(submit).toContain('focus-visible:ring-offset-[#121827]');
  });

  it('aligns SCSS rings and labels to the cliente sheet', () => {
    expect(scss).toContain('focus-visible:ring-offset-[#121827]');
    expect(scss).not.toContain('#151b2b');
    expect(scss).toMatch(/\.form-group label[\s\S]{0,180}text-\[11px\]/);
    expect(scss).toMatch(/\.form-group label[\s\S]{0,180}font-semibold/);
    expect(scss).toMatch(/\.form-group label[\s\S]{0,180}tracking-wider/);
  });
});
