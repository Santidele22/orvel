import { Type } from '@angular/core';
import { DashboardThemeName, DashboardThemeTokens, DASHBOARD_THEME_TOKENS } from '../theming/theme.tokens';
import { DashboardTemplate } from './dashboard-template.contract';
import { ZenTopbarComponent } from '../../shared/dashboard-topbar/templates/zen-topbar.component';
import { ZenSidebarComponent } from '../../shared/dashboard-sidebar/templates/zen-sidebar.component';

export abstract class BaseDashboardTemplate implements DashboardTemplate {
  abstract readonly id: DashboardThemeName;
  abstract readonly displayName: string;
  abstract readonly sidebarWidth: number;
  abstract readonly fabClass: string;
  abstract readonly surfaceBgClass: string;
  abstract readonly topbarComponent: Type<any>;
  abstract readonly sidebarComponent: Type<any>;

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
  readonly topbarComponent = ZenTopbarComponent;
  readonly sidebarComponent = ZenSidebarComponent;
}
