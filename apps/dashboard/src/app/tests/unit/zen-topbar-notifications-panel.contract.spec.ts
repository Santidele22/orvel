import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function readAppFile(path: string): string {
  return readFileSync(join(root, path), 'utf-8');
}

function firstOpenTagAfter(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) return '';

  const after = source.slice(markerIndex);
  return after.match(/<div\b[^>]*>/)?.[0] ?? '';
}

function openTagContaining(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) return '';

  const start = source.lastIndexOf('<', markerIndex);
  if (start === -1) return '';

  return source.slice(start).match(/<[a-zA-Z][\w-]*\b[^>]*>/)?.[0] ?? '';
}

function classAttr(openTag: string): string {
  return openTag.match(/\bclass="([^"]+)"/)?.[1] ?? '';
}

describe('Zen topbar notifications panel contract', () => {
  const topbarTs = readAppFile('src/app/shared/dashboard-topbar/templates/zen-topbar.component.ts');
  const headerOpenTag = openTagContaining(topbarTs, 'data-testid="dashboard-topbar-responsive"');
  const headerClass = classAttr(headerOpenTag);
  const panelOpenTag = firstOpenTagAfter(topbarTs, '@if (showNotificationList())');
  const panelClass = classAttr(panelOpenTag);
  const itemRowOpenTag = firstOpenTagAfter(topbarTs, '@for (notif of notificationList(); track notif.id)');
  const itemRowClass = classAttr(itemRowOpenTag);

  it('renders the notifications panel with a stable testid when the list is open', () => {
    expect(topbarTs).toMatch(/@if \(showNotificationList\(\)\)/);
    expect(panelOpenTag).toMatch(/data-testid=["']dashboard-topbar-notifications-panel["']/);
    expect(topbarTs).toMatch(/data-testid=["']dashboard-topbar-notifications["']/);
  });

  it('keeps the desktop header on the page/shell violet without a gray strip', () => {
    expect(headerOpenTag).toMatch(/data-testid=["']dashboard-topbar-responsive["']/);
    expect(headerClass).toMatch(/(?:^|\s)hidden(?:\s|$)/);
    expect(headerClass).toMatch(/(?:^|\s)lg:flex(?:\s|$)/);
    expect(headerClass).toMatch(/(?:^|\s)bg-bg-primary(?:\s|$)/);
    expect(headerClass).not.toMatch(/\bbg-bg-secondary\b/);
    expect(headerClass).not.toMatch(/\bbg-bg-secondary\/80\b/);
  });

  it('keeps the panel surface on an opaque dashboard token', () => {
    expect(panelClass).toMatch(/(?:^|\s)rounded-3xl(?:\s|$)/);
    expect(panelClass).toMatch(/\bborder-white\/10\b/);
    expect(panelClass).toMatch(/(?:^|\s)bg-\[#121827\](?:\s|$)/);
    expect(panelClass).not.toMatch(/\bbg-bg-secondary\b/);
    expect(panelClass).not.toMatch(/(?:^|\s)bg-bg-(?:primary|secondary)\//);
    expect(panelClass).not.toMatch(/(?:^|\s)bg-tertiary(?:\/|\s|$)/);
  });

  it('does not use the unused bg-tertiary token', () => {
    expect(topbarTs).not.toMatch(/\bbg-tertiary\b/);
  });

  it('keeps notification item rows on an opaque surface', () => {
    expect(itemRowClass).toMatch(/(?:^|\s)bg-\[#182033\](?:\s|$)/);
    expect(itemRowClass).not.toMatch(/(?:^|\s)bg-bg-primary\/50(?:\s|$)/);
    expect(itemRowClass).not.toMatch(/(?:^|\s)bg-bg-(?:primary|secondary)\//);
    expect(itemRowClass).not.toMatch(/(?:^|\s)bg-tertiary(?:\/|\s|$)/);
  });

  it('closes the list from the click-outside backdrop', () => {
    expect(topbarTs).toMatch(
      /class="fixed inset-0 z-40"\s+\(click\)="showNotificationList\.set\(false\)"/
    );
  });

  it('gives each notification row a dismiss X that archives without marking read', () => {
    expect(topbarTs).toMatch(/data-testid=["']dashboard-topbar-notification-dismiss["']/);
    expect(topbarTs).toMatch(/aria-label=["']Descartar notificación["']/);
    expect(topbarTs).toMatch(/ri-close-line/);
    expect(topbarTs).toMatch(/archiveNotification\(notif\.id\)/);
    expect(topbarTs).toMatch(/\$event\.stopPropagation\(\)/);
    expect(topbarTs).toMatch(/Limpiar/);
    expect(topbarTs).toMatch(/clearAllNotifications/);

    const dismissOpenTag = openTagContaining(topbarTs, 'dashboard-topbar-notification-dismiss');
    expect(dismissOpenTag).toMatch(/\(click\)="/);
    expect(dismissOpenTag).not.toMatch(/markNotificationRead/);
    expect(dismissOpenTag).toMatch(/archiveNotification|stopPropagation/);
  });
});
