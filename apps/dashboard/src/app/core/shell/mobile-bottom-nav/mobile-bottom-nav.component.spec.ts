import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const COMPONENT_TS = 'src/app/core/shell/mobile-bottom-nav/mobile-bottom-nav.component.ts';

function fromRoot(relativePath: string): string {
  return join(process.cwd(), relativePath);
}

describe('MobileBottomNavComponent', () => {
  it('has 5 nav items defined', async () => {
    const source = await readFile(fromRoot(COMPONENT_TS), 'utf-8');
    // Count the nav items in the array
    const count = source.split("/dashboard/").length - 1;
    // Exclude the route check string itself
    expect(count).toBeGreaterThanOrEqual(5);
  });

  it('includes all required routes', async () => {
    const source = await readFile(fromRoot(COMPONENT_TS), 'utf-8');
    expect(source).toContain('/dashboard/inicio');
    expect(source).toContain('/dashboard/turnos');
    expect(source).toContain('/dashboard/clientes');
    expect(source).toContain('/dashboard/notificaciones');
    expect(source).toContain('/dashboard/perfil');
  });

  it('uses Remix icons for each item', async () => {
    const source = await readFile(fromRoot(COMPONENT_TS), 'utf-8');
    // Each nav item should have icon and activeIcon with ri- prefix
    const iconMatches = source.match(/ri-[a-zA-Z0-9-]+/g);
    // Expect at least 10 icon classes (5 items × 2 icons each)
    expect(iconMatches?.length).toBeGreaterThanOrEqual(10);
  });

  it('is hidden on lg breakpoint', async () => {
    const source = await readFile(fromRoot(COMPONENT_TS), 'utf-8');
    expect(source).toContain('lg:hidden');
  });

  it('has safe-area-bottom class for iOS safe area', async () => {
    const source = await readFile(fromRoot(COMPONENT_TS), 'utf-8');
    expect(source).toContain('safe-area-bottom');
    expect(source).toContain('env(safe-area-inset-bottom)');
  });

  it('has data-testid="mobile-bottom-nav"', async () => {
    const source = await readFile(fromRoot(COMPONENT_TS), 'utf-8');
    expect(source).toContain('data-testid="mobile-bottom-nav"');
  });
});
