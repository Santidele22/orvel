import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function fromRoot(relativePath: string): string {
  return join(process.cwd(), relativePath);
}

describe('Sprint 1 v2 nav/shell RED contract', () => {
  it('uses exact app title "Bloom" in index head', async () => {
    // TODO(Aurora): actualizar branding global y reemplazar cualquier título legacy por "Bloom".
    const indexHtml = await readFile(fromRoot('src/index.html'), 'utf-8');

    expect(indexHtml).toMatch(/<title>\s*Bloom\s*<\/title>/i);
    expect(indexHtml).not.toMatch(/<title>\s*Turnea Dashboard\s*<\/title>/i);
  });

  it('exposes Edit Profile modal with required fields: name, email, phone, avatar', async () => {
    // TODO(Aurora): agregar modal de edición de perfil en shell/nav con hooks estables para QA.
    const sidebarHtml = await readFile(
      fromRoot('src/app/shared/dashboard-sidebar/dashboard-sidebar.component.html'),
      'utf-8'
    );
    const topbarHtml = await readFile(
      fromRoot('src/app/shared/dashboard-topbar/dashboard-topbar.component.html'),
      'utf-8'
    );
    const source = `${sidebarHtml}\n${topbarHtml}`;

    expect(source).toMatch(/data-testid=["']edit-profile-modal["']/i);
    expect(source).toMatch(/data-testid=["']edit-profile-name["']/i);
    expect(source).toMatch(/data-testid=["']edit-profile-email["']/i);
    expect(source).toMatch(/data-testid=["']edit-profile-phone["']/i);
    expect(source).toMatch(/data-testid=["']edit-profile-avatar["']/i);
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
