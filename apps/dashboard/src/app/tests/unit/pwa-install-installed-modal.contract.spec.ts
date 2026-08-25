import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readSource(relativePath: string): string {
  const absolutePath = resolve(process.cwd(), relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf-8') : '';
}

function extractMethod(pageTs: string, signature: string): string {
  const start = pageTs.indexOf(signature);
  return start >= 0 ? pageTs.slice(start, start + 900) : '';
}

describe('Contract: PWA install success modal after native install', () => {
  const pagePath = 'src/app/features/pwa-install/pages/pwa-install.page.ts';

  it('types BeforeInstallPromptEvent with userChoice accepted | dismissed', () => {
    const pageTs = readSource(pagePath);
    const promptType = extractMethod(pageTs, 'type BeforeInstallPromptEvent');

    expect(promptType).toMatch(/userChoice\s*:\s*Promise\s*<\s*\{[^}]*outcome\s*:\s*'accepted'\s*\|\s*'dismissed'/);
  });

  it('awaits userChoice after prompt() and opens the modal only when accepted', () => {
    const pageTs = readSource(pagePath);
    const runNative = extractMethod(pageTs, 'private async runNativeInstallPrompt()');

    expect(runNative).toMatch(/await\s+this\.deferredPrompt\.prompt\(\)/);
    expect(runNative).toMatch(/await\s+this\.deferredPrompt\.userChoice/);
    expect(runNative.indexOf('await this.deferredPrompt.userChoice')).toBeGreaterThan(
      runNative.indexOf('await this.deferredPrompt.prompt()'),
    );
    expect(runNative).toMatch(/outcome\s*===\s*['"]accepted['"]/);
    expect(runNative).toMatch(/isInstallSuccessModalOpen\.set\(true\)/);
    expect(runNative.indexOf('isInstallSuccessModalOpen.set(true)')).toBeGreaterThan(
      runNative.search(/outcome\s*===\s*['"]accepted['"]/),
    );
    expect(runNative).not.toMatch(/dismissed[\s\S]{0,120}isInstallSuccessModalOpen\.set\(true\)/);
    expect(runNative).toMatch(/this\.deferredPrompt\s*=\s*null/);
    expect(runNative).toMatch(/hasNativePrompt\.set\(false\)/);
    expect(runNative).toMatch(/__ORVEL_DEFERRED_INSTALL_PROMPT\s*=\s*undefined/);
  });

  it('shows Aplicación instalada dialog with overlay, close, and Entendido', () => {
    const pageTs = readSource(pagePath);
    const template = pageTs.match(/template:\s*`([\s\S]*?)`,/)?.[1] ?? '';

    expect(pageTs).toMatch(/isInstallSuccessModalOpen\s*=\s*signal\(false\)/);
    expect(template).toMatch(/@if\s*\(\s*isInstallSuccessModalOpen\(\)\s*\)/);
    expect(template).toMatch(/data-testid=["']pwa-install-success-modal["']/);
    expect(template).toMatch(/role=["']dialog["']/);
    expect(template).toMatch(/aria-modal=["']true["']/);
    expect(template).toContain('Aplicación instalada');
    expect(template).toMatch(/Entendido/);
    expect(template).toMatch(/data-testid=["']pwa-install-success-modal-overlay["']/);
    expect(template).toMatch(/data-testid=["']pwa-install-success-modal-close["']/);
  });

  it('dismisses the success modal without reloading', () => {
    const pageTs = readSource(pagePath);
    const closeMethod = extractMethod(pageTs, 'closeInstallSuccessModal');

    expect(pageTs).toMatch(/closeInstallSuccessModal\s*\(\s*\)\s*:\s*void\s*\{[\s\S]*isInstallSuccessModalOpen\.set\(false\)/);
    expect(closeMethod).not.toMatch(/location\.reload|window\.location/);
    expect(pageTs).not.toMatch(/closeInstallSuccessModal[\s\S]{0,220}location\.reload/);
    expect(pageTs).not.toMatch(/closeInstallSuccessModal[\s\S]{0,220}window\.location/);
  });

  it('opens the same modal from an appinstalled listener', () => {
    const pageTs = readSource(pagePath);

    expect(pageTs).toMatch(/@HostListener\(\s*['"]window:appinstalled['"]/);
    expect(pageTs).toMatch(
      /@HostListener\(\s*['"]window:appinstalled['"][\s\S]{0,280}isInstallSuccessModalOpen\.set\(true\)/,
    );
  });

  it('never calls prompt() on the iOS path and does not change the manifest start_url', () => {
    const pageTs = readSource(pagePath);
    const installAppStart = pageTs.indexOf('protected async installApp()');
    const installApp =
      installAppStart >= 0 ? pageTs.slice(installAppStart, installAppStart + 220) : '';
    const promptAfterIos = pageTs.match(/isIos[\s\S]{0,240}?prompt\(/)?.[0] ?? '';
    const manifest = readSource('src/manifest.webmanifest');

    expect(installApp).toMatch(/if\s*\(\s*this\.isIos\(\)\s*\)\s*\{[\s\S]*return;/);
    expect(installApp).not.toMatch(/prompt\(/);
    expect(promptAfterIos).toBe('');
    expect(manifest).toMatch(/"start_url":\s*"\/dashboard\/turnos"/);
    expect(manifest).toMatch(/"scope":\s*"\/dashboard\/"/);
  });
});
