import { Type } from '@angular/core';
import { DashboardThemeName, DashboardThemeTokens } from '../theming/theme.tokens';

export interface DashboardTemplate {
  readonly id: DashboardThemeName;
  readonly displayName: string;
  readonly sidebarWidth: number;
  readonly tokens: DashboardThemeTokens;
  
  // Specific styling for components
  readonly fabClass: string;
  readonly surfaceBgClass: string;
  readonly topbarComponent: Type<unknown>;
  readonly sidebarComponent: Type<unknown>;
}
