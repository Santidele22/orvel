import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SHELL_HTML = 'src/app/shared/dashboard-shell/dashboard-shell.component.html';
const SHELL_TS = 'src/app/shared/dashboard-shell/dashboard-shell.component.ts';
const TOPBAR_HTML = 'src/app/shared/dashboard-topbar/dashboard-topbar.component.html';
const TOPBAR_TS = 'src/app/shared/dashboard-topbar/dashboard-topbar.component.ts';
const SIDEBAR_HTML = 'src/app/shared/dashboard-sidebar/dashboard-sidebar.component.html';
const SIDEBAR_TS = 'src/app/shared/dashboard-sidebar/dashboard-sidebar.component.ts';
const ZEN_SIDEBAR_TS = 'src/app/shared/dashboard-sidebar/templates/zen-sidebar.component.ts';
const STRUCTURAL_TOKENS = 'src/app/core/theming/dashboard-structural.tokens.ts';
const DASHBOARD_HOME_HTML = 'src/app/features/dashboard-home/pages/dashboard-home.page.html';

const CORE_PAGE_CONTAINERS = {
  turnos: 'src/app/features/booking/pages/turnos-list.page.html',
  servicios: 'src/app/features/servicios/pages/servicios.page.html',
  clientes: 'src/app/features/clientes/pages/clientes.page.html',
  configuracion: 'src/app/features/settings/pages/configuracion.page.html'
} as const;

function fromRoot(relativePath: string): string {
  return join(process.cwd(), relativePath);
}

function missingWhen(condition: boolean, message: string): string[] {
  return condition ? [] : [message];
}

function countMatches(content: string, pattern: RegExp): number {
  return content.match(pattern)?.length ?? 0;
}

describe('UX hardening final: responsive/layout contracts (mock mode, RED)', () => {
  it('requires deterministic responsive hooks in dashboard shell/topbar/sidebar', async () => {
    const [shellHtml, shellTs, topbarHtml, sidebarHtml, structuralTokens] = await Promise.all([
      readFile(fromRoot(SHELL_HTML), 'utf-8'),
      readFile(fromRoot(SHELL_TS), 'utf-8'),
      readFile(fromRoot(TOPBAR_HTML), 'utf-8'),
      readFile(fromRoot(SIDEBAR_HTML), 'utf-8'),
      readFile(fromRoot(STRUCTURAL_TOKENS), 'utf-8')
    ]);

    const mismatches = [
      ...missingWhen(
        /data-testid=["']dashboard-shell-responsive-root["']/.test(shellHtml),
        'Shell root must expose data-testid="dashboard-shell-responsive-root".'
      ),
      ...missingWhen(
        /app-dashboard-sidebar[\s\S]*class=["'][^"']*(?:hidden\s+lg:(?:block|flex)|lg:(?:block|flex)\s+hidden)/.test(shellHtml),
        'Desktop sidebar must be hidden below lg and visible at lg+ with stable Tailwind hooks.'
      ),
      ...missingWhen(
        /app-dashboard-topbar[\s\S]*class=["'][^"']*(?:lg:hidden|hidden\s+lg:hidden)/.test(shellHtml),
        'Mobile topbar must be visible below lg and hidden at lg+ from the shell host class.'
      ),
      ...missingWhen(
        /shellRoot:\s*['"][^'"]*(?:overflow-x-hidden|overflow-hidden)[^'"]*['"]/.test(structuralTokens),
        'Shell structural root must prevent horizontal page overflow.'
      ),
      ...missingWhen(
        /shellViewport:\s*['"][^'"]*min-w-0[^'"]*['"]/.test(structuralTokens),
        'Shell viewport token must keep min-w-0 so nested grids cannot force horizontal overflow.'
      ),
      ...missingWhen(
        /DASHBOARD_STRUCTURAL_TOKENS/.test(shellTs) && /protected readonly structure = DASHBOARD_STRUCTURAL_TOKENS/.test(shellTs),
        'Shell component must keep using structural tokens instead of duplicating responsive layout strings.'
      ),
      ...missingWhen(
        /data-testid=["']dashboard-topbar-responsive["']/.test(topbarHtml),
        'Topbar template must expose data-testid="dashboard-topbar-responsive".'
      ),
      ...missingWhen(
        /sm:|md:|lg:|xl:/.test(topbarHtml),
        'Topbar template must include explicit breakpoint utility tokens for responsive regressions.'
      ),
      ...missingWhen(
        /data-testid=["']dashboard-sidebar-responsive["']/.test(sidebarHtml),
        'Sidebar template must expose data-testid="dashboard-sidebar-responsive".'
      ),
      ...missingWhen(
        /sm:|md:|lg:|xl:/.test(sidebarHtml),
        'Sidebar template must include explicit breakpoint utility tokens for responsive regressions.'
      )
    ];

    expect(mismatches, `Dashboard shell responsive contract mismatches:\n${mismatches.join('\n')}`).toEqual([]);
  });

  it('requires a shell-owned collapsible sidebar contract without the rejected topbar drawer', async () => {
    const [shellHtml, shellTs, topbarHtml, topbarTs, sidebarTs, sidebarHtml, zenSidebarTs] = await Promise.all([
      readFile(fromRoot(SHELL_HTML), 'utf-8'),
      readFile(fromRoot(SHELL_TS), 'utf-8'),
      readFile(fromRoot(TOPBAR_HTML), 'utf-8'),
      readFile(fromRoot(TOPBAR_TS), 'utf-8'),
      readFile(fromRoot(SIDEBAR_TS), 'utf-8'),
      readFile(fromRoot(SIDEBAR_HTML), 'utf-8'),
      readFile(fromRoot(ZEN_SIDEBAR_TS), 'utf-8')
    ]);

    const mismatches = [
      ...missingWhen(
        /(?:protected|public)\s+readonly\s+isSidebarCollapsed\s*=\s*signal\(false\)/.test(shellTs),
        'Shell TS must own collapse state as readonly isSidebarCollapsed = signal(false).'
      ),
      ...missingWhen(
        /(?:protected|public)\s+readonly\s+sidebarWidth\s*=\s*computed\(\s*\(\)\s*=>[\s\S]*isSidebarCollapsed\(\)[\s\S]*activeTemplate\(\)\.sidebarWidth[\s\S]*\)/.test(shellTs),
        'Shell TS must expose sidebarWidth = computed(...) based on isSidebarCollapsed() and activeTemplate().sidebarWidth.'
      ),
      ...missingWhen(
        /toggleSidebarCollapsed\s*\(\)\s*:\s*void[\s\S]*isSidebarCollapsed\.update\(\s*\(?collapsed\)?\s*=>\s*!collapsed\s*\)/.test(shellTs),
        'Shell TS must expose toggleSidebarCollapsed(): void and invert isSidebarCollapsed.'
      ),
      ...missingWhen(
        countMatches(shellHtml, /<app-dashboard-sidebar\b/g) === 1,
        'Shell HTML must render a single app-dashboard-sidebar; no separate mobile drawer/sidebar instance is allowed.'
      ),
      ...missingWhen(
        /<app-dashboard-sidebar[\s\S]*\[collapsed\]=["']isSidebarCollapsed\(\)["'][\s\S]*\(collapseToggle\)=["']toggleSidebarCollapsed\(\)["'][\s\S]*\[style\.width\.px\]=["']sidebarWidth\(\)["']/.test(shellHtml),
        'Shell HTML must wire the only sidebar with [collapsed]="isSidebarCollapsed()", (collapseToggle)="toggleSidebarCollapsed()", and [style.width.px]="sidebarWidth()".'
      ),
      ...missingWhen(
        !/isMobileSidebarDrawerOpen|openMobileSidebarDrawer|closeMobileSidebarDrawer|toggleMobileSidebarDrawer/.test(shellTs),
        'Rejected drawer API must be removed from Shell TS (no isMobileSidebarDrawerOpen/open/close/toggleMobileSidebarDrawer).'
      ),
      ...missingWhen(
        !/dashboard-mobile-sidebar-(?:overlay|drawer|content|close)|role=["']dialog["']|aria-modal=["']true["']/.test(shellHtml),
        'Rejected drawer markup must be removed from Shell HTML (no overlay, drawer, close button, drawer content, dialog, or aria-modal).'
      ),
      ...missingWhen(
        !/\(menuToggle\)=|dashboard-topbar-menu-trigger/.test(shellHtml) && !/menuToggle|openMobileMenu/.test(topbarTs) && !/dashboard-topbar-menu-trigger|Abrir menú de navegación/.test(topbarHtml),
        'Topbar-driven drawer entrypoint must be removed: no (menuToggle), menuToggle output, openMobileMenu(), or dashboard-topbar-menu-trigger button.'
      ),
      ...missingWhen(
        /@Input\(\)\s+collapsed\s*:\s*boolean\s*=\s*false/.test(sidebarTs),
        'DashboardSidebarComponent must expose @Input() collapsed: boolean = false.'
      ),
      ...missingWhen(
        /@Output\(\)\s+(?:readonly\s+)?collapseToggle\s*=\s*new\s+EventEmitter<void>\(\)/.test(sidebarTs),
        'DashboardSidebarComponent must expose @Output() collapseToggle = new EventEmitter<void>().'
      ),
      ...missingWhen(
        /templateInputs\s*=\s*computed\(\s*\(\)\s*=>\s*\(\{[\s\S]*collapsed:\s*this\.collapsed[\s\S]*onToggleCollapse:\s*\(\)\s*=>\s*this\.collapseToggle\.emit\(\)[\s\S]*\}\)\s*\)/.test(sidebarTs),
        'DashboardSidebarComponent must forward collapsed and onToggleCollapse through templateInputs().'
      ),
      ...missingWhen(
        /inputs:\s*templateInputs\(\)/.test(sidebarHtml),
        'DashboardSidebar template must keep forwarding templateInputs() into the dynamic sidebar component.'
      ),
      ...missingWhen(
        /<aside[\s\S]*data-testid=["']dashboard-sidebar-responsive["'][\s\S]*data-testid=["']dashboard-sidebar-collapse-toggle["']/.test(zenSidebarTs),
        'ZenSidebarComponent must render data-testid="dashboard-sidebar-collapse-toggle" inside the aside.'
      ),
      ...missingWhen(
        /data-testid=["']dashboard-sidebar-collapse-toggle["'][\s\S]*\(click\)=["']onToggleCollapse\(\)["'][\s\S]*\[attr\.aria-expanded\]=["']!collapsed["'][\s\S]*\[attr\.aria-label\]=["']collapsed\s*\?\s*'Desplegar menú'\s*:\s*'Guardar menú'["']/.test(zenSidebarTs),
        'Zen collapse toggle must call onToggleCollapse(), expose [attr.aria-expanded]="!collapsed", and switch aria-label between "Guardar menú" and "Desplegar menú".'
      ),
      ...missingWhen(
        /@Input\(\)\s+collapsed\s*:\s*boolean\s*=\s*false/.test(zenSidebarTs) && /@Input\(\)\s+onToggleCollapse:\s*\(\)\s*=>\s*void\s*=\s*\(\)\s*=>\s*\{\s*\}/.test(zenSidebarTs),
        'ZenSidebarComponent must accept collapsed and onToggleCollapse inputs from DashboardSidebarComponent.'
      ),
      ...missingWhen(
        /@if\s*\(\s*!collapsed\s*\)\s*\{[\s\S]*Gestión[\s\S]*\}/.test(zenSidebarTs) &&
          /@if\s*\(\s*!collapsed\s*\)\s*\{[\s\S]*Sistema[\s\S]*\}/.test(zenSidebarTs) &&
          /@if\s*\(\s*!collapsed\s*\)\s*\{[\s\S]*\{\{\s*link\.label\s*\}\}[\s\S]*\}/.test(zenSidebarTs),
        'Zen sidebar must hide group headings and text labels behind @if (!collapsed) when collapsed.'
      ),
      ...missingWhen(
        /\[attr\.aria-label\]=["']collapsed\s*\?\s*link\.label\s*:\s*null["']/.test(zenSidebarTs) &&
          /<i[\s\S]*\[class\]=["']link\.icon["'][\s\S]*aria-hidden=["']true["']/.test(zenSidebarTs),
        'Zen sidebar icons must remain accessible by giving collapsed links aria-label=link.label while icons stay aria-hidden="true".'
      )
    ];

    expect(mismatches, `Shell-owned collapsible sidebar contract mismatches:\n${mismatches.join('\n')}`).toEqual([]);
  });

  it('requires dashboard home mobile-first responsive hooks without pixel-fragile assertions', async () => {
    const markup = await readFile(fromRoot(DASHBOARD_HOME_HTML), 'utf-8');

    const mismatches = [
      ...missingWhen(
        /<section[^>]*data-testid=["']dashboard-home-responsive-root["']/.test(markup),
        'Home root must expose data-testid="dashboard-home-responsive-root".'
      ),
      ...missingWhen(
        /<section[^>]*class=["'][^"']*overflow-x-hidden[^"']*px-4[^"']*sm:px-6[^"']*lg:px-(?:8|10)[^"']*/.test(markup),
        'Home root must be mobile-first: overflow-x-hidden px-4 sm:px-6 lg:px-8/10.'
      ),
      ...missingWhen(
        /<header[^>]*class=["'][^"']*flex-col[^"']*(?:sm:|md:|lg:)flex-row[^"']*/.test(markup),
        'Home header must stack on mobile and switch to a row at a larger breakpoint.'
      ),
      ...missingWhen(
        /<button[^>]*\(click\)=["']copyBookingUrl\(\)["'][^>]*class=["'][^"']*w-full[^"']*(?:sm:|md:|lg:)w-auto[^"']*/.test(markup),
        'Primary share CTA must be full width on mobile and auto width at a larger breakpoint.'
      ),
      ...missingWhen(
        /class=["'][^"']*grid[^"']*grid-cols-1[^"']*(?:sm:|md:)grid-cols-2[^"']*lg:grid-cols-3[^"']*/.test(markup),
        'Stats grid must be one column on mobile, two on tablet, and preserve three columns at desktop.'
      ),
      ...missingWhen(
        /class=["'][^"']*grid[^"']*grid-cols-1[^"']*lg:grid-cols-3[^"']*/.test(markup),
        'Dashboard panels must be one column on mobile and use the desktop lg grid.'
      ),
      ...missingWhen(
        /min-w-0/.test(markup),
        'Home content must include min-w-0 on nested flex/grid children that can otherwise cause horizontal overflow.'
      )
    ];

    expect(mismatches, `Dashboard home responsive contract mismatches:\n${mismatches.join('\n')}`).toEqual([]);
  });

  it('requires responsive container hooks for core pages', async () => {
    const missing: string[] = [];

    for (const [pageName, relativePath] of Object.entries(CORE_PAGE_CONTAINERS)) {
      const markup = await readFile(fromRoot(relativePath), 'utf-8');
      const expectedHook = `${pageName}-responsive-container`;

      if (!new RegExp(`data-testid=["']${expectedHook}["']`).test(markup)) {
        missing.push(`[${pageName}] Missing deterministic hook \"${expectedHook}\"`);
      }

      if (!/sm:|md:|lg:|xl:/.test(markup)) {
        missing.push(`[${pageName}] Missing explicit breakpoint utility token (sm:/md:/lg:/xl:)`);
      }
    }

    // TODO(Aurora): agregar contenedores responsive estables por página para tests de regresión UX.
    expect(missing, `Responsive contract mismatches:\n${missing.join('\n')}`).toEqual([]);
  });
});
