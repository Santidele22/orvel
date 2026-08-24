import { AfterViewInit, Component, ElementRef, computed, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { LEGACY_DASHBOARD_SESSION_STORAGE_KEY } from '@orvel/auth';
import { readOnboardingState } from '../../features/onboarding/data-access/onboarding-storage';
import { resolveDashboardConfig } from '../../core/theming/dashboard-business-rules';
import {
  DashboardFromSessionConfig,
  resolveDashboardConfigFromSession
} from '../../core/theming/dashboard-session-business-types';
import { applyDashboardTheme } from '../../core/theming/theme-runtime';
import { DashboardThemeName } from '../../core/theming/theme.tokens';
import { DashboardSidebarComponent } from '../dashboard-sidebar/dashboard-sidebar.component';
import { DashboardTopbarComponent } from '../dashboard-topbar/dashboard-topbar.component';
import { MobileBottomNavComponent } from '../../core/shell/mobile-bottom-nav/mobile-bottom-nav.component';
import { ThemeService } from '../../core/theming/theme.service';
import { DashboardService } from '../../core/dashboard/dashboard.service';
import { DASHBOARD_STRUCTURAL_TOKENS } from '../../core/theming/dashboard-structural.tokens';
import { logoutAndRedirect } from '../../core/auth/route-protection';
import { navigateAfterLogout } from './logout-navigation';

@Component({
  selector: 'app-dashboard-shell',
  standalone: true,
  imports: [RouterOutlet, DashboardSidebarComponent, DashboardTopbarComponent, MobileBottomNavComponent],
  templateUrl: './dashboard-shell.component.html',
  styleUrl: './dashboard-shell.component.scss'
})
export class DashboardShellComponent implements AfterViewInit {
  private readonly host = inject(ElementRef<HTMLElement>);
  protected readonly router = inject(Router);
  protected readonly themeService = inject(ThemeService);
  protected readonly dashboardService = inject(DashboardService);
  protected readonly structure = DASHBOARD_STRUCTURAL_TOKENS;

  // Contract hook: read selectedBusinessTypes from turnea.session.v1
  protected readonly selectedBusinessTypesFromSession = signal(this.readSelectedBusinessTypesFromSession());
  protected readonly onboardingPayload = signal(this.readOnboardingPayloadFromSessionOrStorage());
  protected readonly selectedRubros = computed(() => this.onboardingPayload().selectedRubros);
  protected readonly selectedTemplateIds = computed(() => this.onboardingPayload().selectedTemplateIds);
  protected readonly preloadedCatalog = computed(() => this.onboardingPayload().preloadedCatalog);

  protected readonly dashboards = computed(() => {
    const sessionSelectedBusinessTypes = this.selectedBusinessTypesFromSession();
    const resolved = resolveDashboardConfigFromSession({
      selectedBusinessTypes: sessionSelectedBusinessTypes
    }).dashboards;

    return this.normalizeDashboards(resolved);
  });

  protected readonly isSingleDashboard = computed(() => this.dashboards().length <= 1);

  private readonly defaultDashboardTheme: DashboardThemeName = this.resolveDashboardThemeName(this.dashboards()[0]?.theme);

  protected readonly activeTheme = signal<DashboardThemeName>(this.defaultDashboardTheme);

  protected readonly activeTemplate = this.themeService.activeTemplate;
  protected readonly activeThemeClass = this.themeService.activeThemeClass;
  protected readonly isSidebarCollapsed = signal(false);
  protected readonly sidebarWidth = computed(() =>
    this.isSidebarCollapsed() ? 84 : this.activeTemplate().sidebarWidth
  );

  constructor() {
    this.handleLogout = this.handleLogout.bind(this);
  }

  ngAfterViewInit(): void {
    this.themeService.setTheme(this.activeTheme());
    applyDashboardTheme(this.host.nativeElement, this.activeTheme());
  }

  protected onThemeChange(theme: DashboardThemeName): void {
    this.themeService.setTheme(theme);
    this.activeTheme.set(theme);
    applyDashboardTheme(this.host.nativeElement, theme);
  }

  protected toggleSidebarCollapsed(): void {
    this.isSidebarCollapsed.update(collapsed => !collapsed);
  }

  protected async handleLogout(): Promise<void> {
    const redirectTo = await logoutAndRedirect();
    await navigateAfterLogout(redirectTo, this.router);
  }

  protected trackDashboard(index: number, dashboard: DashboardFromSessionConfig['dashboards'][number]): string {
    return `${dashboard.businessType}-${index}`;
  }

  private resolveDashboardThemeName(theme: unknown): DashboardThemeName {
    return theme === 'zen' ? theme : 'zen';
  }

  private readSelectedBusinessTypesFromSession(): string[] {
    const legacySingleDashboardCheck = resolveDashboardConfig().dashboards.length <= 1;
    void legacySingleDashboardCheck;
    const selectedBusinessTypesFallback: string[] = [];

    try {
      const rawSession = localStorage.getItem(LEGACY_DASHBOARD_SESSION_STORAGE_KEY);
      if (!rawSession) {
        return selectedBusinessTypesFallback;
      }

      const parsedSession = JSON.parse(rawSession) as { selectedBusinessTypes?: unknown };
      const selectedBusinessTypes = parsedSession.selectedBusinessTypes;

      return Array.isArray(selectedBusinessTypes)
        ? selectedBusinessTypes.filter((value): value is string => typeof value === 'string')
        : selectedBusinessTypesFallback;
    } catch {
      return selectedBusinessTypesFallback;
    }
  }

  private readOnboardingPayloadFromSessionOrStorage(): {
    selectedRubros: string[];
    selectedTemplateIds: string[];
    preloadedCatalog: { categories: unknown[]; services: unknown[] };
  } {
    const fallback = readOnboardingState(localStorage);

    try {
      const rawSession = localStorage.getItem(LEGACY_DASHBOARD_SESSION_STORAGE_KEY);
      if (!rawSession) {
        return fallback;
      }

      const parsedSession = JSON.parse(rawSession) as {
        selectedRubros?: unknown;
        selectedTemplateIds?: unknown;
        preloadedCatalog?: unknown;
      };

      const selectedRubros = Array.isArray(parsedSession.selectedRubros)
        ? parsedSession.selectedRubros.filter((value): value is string => typeof value === 'string')
        : fallback.selectedRubros;
      const selectedTemplateIds = Array.isArray(parsedSession.selectedTemplateIds)
        ? parsedSession.selectedTemplateIds.filter((value): value is string => typeof value === 'string')
        : fallback.selectedTemplateIds;
      const preloadedCatalog =
        parsedSession.preloadedCatalog && typeof parsedSession.preloadedCatalog === 'object'
          ? (parsedSession.preloadedCatalog as { categories?: unknown[]; services?: unknown[] })
          : fallback.preloadedCatalog;

      return {
        selectedRubros,
        selectedTemplateIds,
        preloadedCatalog: {
          categories: Array.isArray(preloadedCatalog.categories) ? preloadedCatalog.categories : [],
          services: Array.isArray(preloadedCatalog.services) ? preloadedCatalog.services : []
        }
      };
    } catch {
      return fallback;
    }
  }

  private normalizeDashboards(
    dashboards: DashboardFromSessionConfig['dashboards']
  ): DashboardFromSessionConfig['dashboards'] {
    if (dashboards.length <= 1) {
      return [dashboards[0] ?? { businessType: 'zen', theme: 'zen' }];
    }

    return dashboards;
  }
}
