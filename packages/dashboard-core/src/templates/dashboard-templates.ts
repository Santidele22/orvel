import { DashboardThemeName, DashboardThemeTokens, DASHBOARD_THEME_TOKENS } from '../theming/theme.tokens';
import { DashboardTemplate } from './dashboard-template.contract';

export abstract class BaseDashboardTemplate implements DashboardTemplate {
  abstract readonly id: DashboardThemeName;
  abstract readonly displayName: string;
  abstract readonly sidebarWidth: number;
  abstract readonly fabClass: string;
  abstract readonly surfaceBgClass: string;

  get tokens(): DashboardThemeTokens {
    return DASHBOARD_THEME_TOKENS[this.id];
  }
}

export class ZenTemplate extends BaseDashboardTemplate {
  readonly id = 'zen';
  readonly displayName = 'Orvel Premium';
  readonly sidebarWidth = 260;
  readonly fabClass = 'bg-primary';
  readonly surfaceBgClass = 'bg-bg-primary';
}
