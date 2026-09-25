import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

const TURNOS_HTML = 'src/app/features/booking/pages/turnos-list.page.html';
const TOPBAR_HTML = 'src/app/shared/dashboard-topbar/dashboard-topbar.component.html';

function fromRoot(relativePath: string): string {
  return join(process.cwd(), relativePath);
}

function parseHtml(html: string): Document {
  return new JSDOM(`<body>${html}</body>`).window.document;
}

describe('Right panel integration contract: product-aligned visibility and accessibility', () => {
  it('keeps deterministic async state semantics on turnos container', async () => {
    const turnosHtml = await readFile(fromRoot(TURNOS_HTML), 'utf-8');
    const doc = parseHtml(turnosHtml);

    const root = doc.querySelector('[data-testid="turnos-responsive-container"]');
    expect(root).not.toBeNull();
    expect(root?.getAttribute('aria-live')).toBe('polite');
    expect(turnosHtml.includes('[attr.aria-busy]')).toBe(true);

    const loading = doc.querySelector('[data-testid="turnos-loading-state"]');
    const empty = doc.querySelector('[data-testid="turnos-empty-state"]');
    const error = doc.querySelector('[data-testid="turnos-error-state"]');

    expect(loading?.getAttribute('role')).toBe('status');
    expect(empty?.getAttribute('role')).toBe('status');
    expect(error?.getAttribute('role')).toBe('alert');
  });

  it('exposes right-panel KPI copy for each dashboard theme without strict stitch lock-in', async () => {
    const turnosHtml = await readFile(fromRoot(TURNOS_HTML), 'utf-8');

    const themeToExpectedCopy: Record<'zen' | 'industrial' | 'chic' | 'ink', readonly string[]> = {
      zen: ['Occupancy Index', 'Recent Feedback'],
      industrial: ['Metrics.Core', 'Efficiency Index'],
      chic: ['CONCIERGE', 'Beautiful'],
      ink: ['NEXT_MASTER_UNIT', 'PREPARE_UNIT']
    };

    for (const [, labels] of Object.entries(themeToExpectedCopy)) {
      expect(labels.some((label) => turnosHtml.includes(label))).toBe(true);
    }
  });

  it('keeps notification actions accessible across theme topbars', async () => {
    const topbarHtml = await readFile(fromRoot(TOPBAR_HTML), 'utf-8');
    const topbarDoc = parseHtml(topbarHtml);

    const notificationButtons = Array.from(
      topbarDoc.querySelectorAll('[data-testid="dashboard-topbar-notifications"]')
    );

    expect(notificationButtons.length).toBeGreaterThanOrEqual(4);
    expect(
      notificationButtons.every((button) => (button.getAttribute('aria-label') ?? '').trim().length > 0)
    ).toBe(true);
  });
});
