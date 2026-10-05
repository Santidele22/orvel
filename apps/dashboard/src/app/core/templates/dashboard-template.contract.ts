import { DashboardThemeName, DashboardThemeTokens } from '../theming/theme.tokens';

export interface DashboardTemplate {
  readonly id: DashboardThemeName;
  readonly displayName: string;
  readonly sidebarWidth: number;
  readonly tokens: DashboardThemeTokens;

  // Specific styling for components
  readonly fabClass: string;
  readonly surfaceBgClass: string;
}
