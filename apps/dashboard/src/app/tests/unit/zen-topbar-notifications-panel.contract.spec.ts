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

function classAttr(openTag: string): string {
  return openTag.match(/\bclass="([^"]+)"/)?.[1] ?? '';
}

describe('Zen topbar notifications panel contract', () => {
  const topbarTs = readAppFile('src/app/shared/dashboard-topbar/templates/zen-topbar.component.ts');
  const panelOpenTag = firstOpenTagAfter(topbarTs, '@if (showNotificationList())');
  const panelClass = classAttr(panelOpenTag);
  const itemRowOpenTag = firstOpenTagAfter(topbarTs, '@for (notif of notificationList(); track notif.id)');
  const itemRowClass = classAttr(itemRowOpenTag);

  it('renders the notifications panel with a stable testid when the list is open', () => {
    expect(topbarTs).toMatch(/@if \(showNotificationList\(\)\)/);
    expect(panelOpenTag).toMatch(/data-testid=["']dashboard-topbar-notifications-panel["']/);
    expect(topbarTs).toMatch(/data-testid=["']dashboard-topbar-notifications["']/);
  });

  it('keeps the panel surface on an opaque dashboard token', () => {
    expect(panelClass).toMatch(/(?:^|\s)bg-bg-(?:primary|secondary)(?:\s|$)/);
    expect(panelClass).not.toMatch(/(?:^|\s)bg-bg-(?:primary|secondary)\//);
    expect(panelClass).not.toMatch(/(?:^|\s)bg-tertiary(?:\/|\s|$)/);
  });

  it('does not use the unused bg-tertiary token', () => {
    expect(topbarTs).not.toMatch(/\bbg-tertiary\b/);
  });

  it('keeps notification item rows on an opaque surface', () => {
    expect(itemRowClass).not.toMatch(/(?:^|\s)bg-bg-primary\/50(?:\s|$)/);
    expect(itemRowClass).toMatch(/(?:^|\s)bg-bg-(?:primary|secondary)(?:\s|$)/);
    expect(itemRowClass).not.toMatch(/(?:^|\s)bg-bg-(?:primary|secondary)\//);
  });

  it('closes the list from the click-outside backdrop', () => {
    expect(topbarTs).toMatch(
      /class="fixed inset-0 z-40"\s+\(click\)="showNotificationList\.set\(false\)"/
    );
  });
});
