import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function fromRoot(relativePath: string): string {
  return join(process.cwd(), relativePath);
}

describe('Sprint 1 v2 nav/shell RED contract', () => {
  it('uses exact app title "Orvel" in index head', async () => {
    const indexHtml = await readFile(fromRoot('src/index.html'), 'utf-8');

    expect(indexHtml).toMatch(/<title>\s*Orvel\s*<\/title>/i);
    expect(indexHtml).not.toMatch(/<title>\s*Turnea Dashboard\s*<\/title>/i);
  });

  it('does not expose decorative edit-profile UI in the sidebar shell', async () => {
    const sidebarHtml = await readFile(
      fromRoot('src/app/shared/dashboard-sidebar/dashboard-sidebar.component.html'),
      'utf-8'
    );
    const topbarHtml = await readFile(
      fromRoot('src/app/shared/dashboard-topbar/dashboard-topbar.component.html'),
      'utf-8'
    );
    const source = `${sidebarHtml}\n${topbarHtml}`;

    expect(source).not.toMatch(/data-testid=["']edit-profile-modal["']/i);
    expect(source).not.toMatch(/data-testid=["']edit-profile-name["']/i);
    expect(source).not.toMatch(/data-testid=["']edit-profile-email["']/i);
    expect(source).not.toMatch(/data-testid=["']edit-profile-phone["']/i);
    expect(source).not.toMatch(/data-testid=["']edit-profile-avatar["']/i);
  });

  it('exposes logout confirmation modal with confirm/cancel flows', async () => {
    // TODO(Aurora): agregar confirmación de logout (confirm/cancel) y cablear handlers deterministas.
    const sidebarHtml = await readFile(
      fromRoot('src/app/shared/dashboard-sidebar/dashboard-sidebar.component.html'),
      'utf-8'
    );
    const sidebarTs = await readFile(
      fromRoot('src/app/shared/dashboard-sidebar/dashboard-sidebar.component.ts'),
      'utf-8'
    );
    const source = `${sidebarHtml}\n${sidebarTs}`;

    expect(source).toMatch(/data-testid=["']logout-confirm-modal["']/i);
    expect(source).toMatch(/data-testid=["']logout-confirm-action["']/i);
    expect(source).toMatch(/data-testid=["']logout-cancel-action["']/i);
    expect(source).toMatch(/confirmLogout\(/);
    expect(source).toMatch(/cancelLogout\(/);
  });
});
