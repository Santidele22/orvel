// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import '@angular/compiler';
import { provideZonelessChangeDetection, ɵresolveComponentResources as resolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DashboardSidebarComponent } from '../../shared/dashboard-sidebar/dashboard-sidebar.component';

describe('Dashboard sidebar logout confirm modal', () => {
  beforeAll(async () => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
    await resolveComponentResources(async (url: string) => {
      const fileName = url.replace('./', '');
      if (fileName.endsWith('.scss')) {
        return '';
      }

      return readFileSync(
        join(process.cwd(), 'src/app/shared/dashboard-sidebar', fileName),
        'utf-8'
      );
    });
  });

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DashboardSidebarComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([])]
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('opens the confirm modal after clicking Cerrar sesión without an extra detectChanges', async () => {
    const fixture = TestBed.createComponent(DashboardSidebarComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    clickLogoutTrigger(fixture.nativeElement as HTMLElement);
    await fixture.whenStable();

    expect(queryModal(fixture.nativeElement as HTMLElement)).not.toBeNull();
  });

  it('emits logoutConfirm and removes the modal when confirming', async () => {
    const fixture = TestBed.createComponent(DashboardSidebarComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const output = captureLogoutConfirm(fixture.componentInstance);

    clickLogoutTrigger(fixture.nativeElement as HTMLElement);
    await fixture.whenStable();

    const confirmButton = queryByTestId(fixture.nativeElement as HTMLElement, 'logout-confirm-action');
    expect(confirmButton).not.toBeNull();
    confirmButton?.click();
    await fixture.whenStable();

    expect(output.emitted).toBe(1);
    expect(queryModal(fixture.nativeElement as HTMLElement)).toBeNull();
  });

  it('does not emit and removes the modal when canceling', async () => {
    const fixture = TestBed.createComponent(DashboardSidebarComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const output = captureLogoutConfirm(fixture.componentInstance);

    clickLogoutTrigger(fixture.nativeElement as HTMLElement);
    await fixture.whenStable();

    const cancelButton = queryByTestId(fixture.nativeElement as HTMLElement, 'logout-cancel-action');
    expect(cancelButton).not.toBeNull();
    cancelButton?.click();
    await fixture.whenStable();

    expect(output.emitted).toBe(0);
    expect(queryModal(fixture.nativeElement as HTMLElement)).toBeNull();
  });
});

function captureLogoutConfirm(component: DashboardSidebarComponent): { emitted: number } {
  const output = { emitted: 0 };
  const emitter = component.logoutConfirm;
  const originalEmit = emitter.emit.bind(emitter);
  emitter.emit = ((value?: void) => {
    output.emitted += 1;
    originalEmit(value);
  }) as typeof emitter.emit;
  return output;
}

function queryByTestId(root: HTMLElement, testId: string): HTMLElement | null {
  return root.querySelector(`[data-testid="${testId}"]`);
}

function queryModal(root: HTMLElement): HTMLElement | null {
  return queryByTestId(root, 'logout-confirm-modal');
}

function clickLogoutTrigger(root: HTMLElement): void {
  const zenLogout = queryByTestId(root, 'dashboard-sidebar-logout-action');
  const srLogout = queryByTestId(root, 'logout-action');
  const trigger = zenLogout ?? srLogout;
  expect(trigger).not.toBeNull();
  trigger?.click();
}
