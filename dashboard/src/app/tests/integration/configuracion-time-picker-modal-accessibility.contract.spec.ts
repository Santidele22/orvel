// @vitest-environment jsdom

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ElementRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfiguracionTimePickerModalComponent } from '../../features/settings/pages/components/configuracion-time-picker-modal.component';

const CONFIGURACION_ROOT = resolve(process.cwd(), 'src/app/features/settings/pages');

async function readConfiguracionFile(relativePath: string): Promise<string> {
  return readFile(resolve(CONFIGURACION_ROOT, relativePath), 'utf-8');
}

describe('Configuracion time picker modal accessibility and visual contract', () => {
  beforeAll(() => TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting()));
  beforeEach(() => TestBed.resetTestingModule());
  afterAll(() => TestBed.resetTestEnvironment());

  it('uses the dashboard dark surface instead of a washed-out white modal', async () => {
    const source = await readConfiguracionFile(
      'components/configuracion-time-picker-modal.component.tpl',
    );

    expect(source).toContain('bg-slate-950/80');
    expect(source).toContain('bg-bg-secondary');
    expect(source).toContain('text-text-primary');
    expect(source).not.toMatch(/class=["'][^"']*bg-white\b/i);
  });

  it('exposes dialog semantics and discoverable close behavior', async () => {
    const modalSource = await readConfiguracionFile(
      'components/configuracion-time-picker-modal.component.tpl',
    );
    const modalComponentSource = await readConfiguracionFile(
      'components/configuracion-time-picker-modal.component.ts',
    );
    const headerSource = await readConfiguracionFile(
      'components/modal/configuracion-time-picker-header.component.tpl',
    );

    expect(modalSource).toMatch(/role=["']dialog["']/i);
    expect(modalSource).toMatch(/aria-modal=["']true["']/i);
    expect(modalSource).toMatch(/aria-labelledby=["']configuracion-time-picker-title["']/i);
    expect(modalSource).toMatch(/aria-describedby=["']configuracion-time-picker-description["']/i);
    expect(modalSource).toContain('data-configuracion-time-picker-dialog');
    expect(modalSource).toMatch(/\(keydown\)=["']handleDialogKeydown\(\$event\)["']/i);
    expect(modalComponentSource).toMatch(
      /@HostListener\(['"]document:keydown['"], \['\$event'\]\)/,
    );
    expect(modalComponentSource).toContain("event.key === 'Escape'");
    expect(modalComponentSource).toContain('this.closeTimePicker()');
    expect(headerSource).toMatch(/aria-label=["']Cerrar selector de horario["']/i);
    expect(headerSource).toMatch(/id=["']configuracion-time-picker-title["']/i);
    expect(headerSource).toMatch(/id=["']configuracion-time-picker-description["']/i);
  });

  it('moves focus into the dialog, traps tab navigation, and restores focus to the opener', async () => {
    const source = await readConfiguracionFile(
      'components/configuracion-time-picker-modal.component.ts',
    );

    expect(source).toContain('implements AfterViewChecked, OnDestroy');
    expect(source).toContain('focusBeforeOpen');
    expect(source).toContain('this.focusBeforeOpen = this.getFocusableActiveElement()');
    expect(source).toContain('queueMicrotask(() => this.focusInitialDialogElement())');
    expect(source).toContain('dialog.focus({ preventScroll: true })');
    expect(source).toContain('keepFocusInsideDialog(event)');
    expect(source).toContain("event.key === 'Tab'");
    expect(source).toContain('firstFocusable.focus({ preventScroll: true })');
    expect(source).toContain('lastFocusable.focus({ preventScroll: true })');
    expect(source).toContain('restoreFocusToTrigger()');
    expect(source).toContain('trigger.focus({ preventScroll: true })');
    expect(source).not.toMatch(/\n\s*confirmTimeChange\(\): void/);
  });

  it('contains forward and reverse tabbing, closes on Escape, and restores opener focus', async () => {
    const isOpen = signal(false);
    const close = vi.fn(() => isOpen.set(false));
    const opener = document.createElement('button');
    const host = document.createElement('div');
    host.innerHTML = '<div data-configuracion-time-picker-dialog tabindex="-1"><button data-first>Primero</button><button data-last>Último</button></div>';
    document.body.append(opener);
    document.body.append(host);
    opener.focus();
    TestBed.configureTestingModule({ providers: [{ provide: ElementRef, useValue: new ElementRef(host) }] });
    const component = TestBed.runInInjectionContext(() => new ConfiguracionTimePickerModalComponent());
    component.ctx = { isTimePickerOpen: isOpen, closeTimePicker: close, confirmTimeChange: vi.fn() };
    component.ngAfterViewChecked();
    isOpen.set(true);
    component.ngAfterViewChecked();
    await Promise.resolve();
    const first = host.querySelector('[data-first]') as HTMLButtonElement;
    const last = host.querySelector('[data-last]') as HTMLButtonElement;
    Object.defineProperty(first, 'offsetParent', { value: host });
    Object.defineProperty(last, 'offsetParent', { value: host });
    last.focus();
    component.handleDocumentKeydown(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(first);
    first.focus();
    component.handleDocumentKeydown(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(last);
    component.handleDocumentKeydown(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(close).toHaveBeenCalledOnce();
    component.ngAfterViewChecked();
    await Promise.resolve();
    expect(document.activeElement).toBe(opener);
    opener.remove();
    host.remove();
  });

  it('restores opener focus after confirmation closes the dialog', async () => {
    const isOpen = signal(false);
    const confirm = vi.fn(() => isOpen.set(false));
    const opener = document.createElement('button');
    const host = document.createElement('div');
    host.innerHTML = '<div data-configuracion-time-picker-dialog tabindex="-1"><button>Confirmar</button></div>';
    document.body.append(opener);
    document.body.append(host);
    opener.focus();
    TestBed.configureTestingModule({ providers: [{ provide: ElementRef, useValue: new ElementRef(host) }] });
    const component = TestBed.runInInjectionContext(() => new ConfiguracionTimePickerModalComponent());
    component.ctx = { isTimePickerOpen: isOpen, closeTimePicker: vi.fn(), confirmTimeChange: confirm };
    component.ngAfterViewChecked();
    isOpen.set(true);
    component.ngAfterViewChecked();
    await Promise.resolve();
    component.ctx.confirmTimeChange();
    component.ngAfterViewChecked();
    await Promise.resolve();
    expect(confirm).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(opener);
    opener.remove();
    host.remove();
  });

  it('names the steppers, numeric inputs, and selected period state for assistive tech', async () => {
    const hourSource = await readConfiguracionFile(
      'components/modal/configuracion-time-picker-hour-section.component.tpl',
    );
    const minuteSource = await readConfiguracionFile(
      'components/modal/configuracion-time-picker-minute-section.component.tpl',
    );
    const periodSource = await readConfiguracionFile(
      'components/modal/configuracion-time-picker-ampm-section.component.tpl',
    );

    expect(hourSource).toMatch(/aria-label=["']Aumentar hora["']/i);
    expect(hourSource).toMatch(/aria-label=["']Disminuir hora["']/i);
    expect(hourSource).toMatch(/aria-label=["']Hora seleccionada["']/i);
    expect(hourSource).toMatch(/focus-visible:ring-2/);

    expect(minuteSource).toMatch(/aria-label=["']Aumentar minutos["']/i);
    expect(minuteSource).toMatch(/aria-label=["']Disminuir minutos["']/i);
    expect(minuteSource).toMatch(/aria-label=["']Minutos seleccionados["']/i);
    expect(minuteSource).toMatch(/focus-visible:ring-2/);

    expect(periodSource).toMatch(/role=["']group["']/i);
    expect(periodSource).toMatch(/\[attr\.aria-pressed\]=["']ctx\.selectedAmPm\(\) === 'AM'["']/i);
    expect(periodSource).toMatch(/\[attr\.aria-pressed\]=["']ctx\.selectedAmPm\(\) === 'PM'["']/i);
    expect(periodSource).toContain('seleccionado');
  });
});
