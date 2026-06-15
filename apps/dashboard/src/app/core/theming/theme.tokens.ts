import {
  DashboardSemanticColorRoles,
  DashboardThemeSemanticTokens
} from './dashboard-semantic-color-roles.tokens';
import {
  DASHBOARD_THEME_ALIASES,
  DASHBOARD_THEME_PALETTES,
  DashboardThemeAliasScope
} from './dashboard-theme-palettes.tokens';

export type DashboardThemeName = 'zen';

export type DashboardThemeTokens = DashboardSemanticColorRoles & {

  // Backward-compatible keys still used by current UI
  bg: string;
  onPrimary: string;
  focusRing: string;
  headingFont: string;
  bodyFont: string;

  // Optional extended design contract
  typography?: {
    font_family: string;
    heading_weight: number;
    body_weight: number;
  };
  border_radius?: {
    card: string;
    button: string;
  };
};

export const DASHBOARD_THEME_TOKENS: Record<DashboardThemeName, DashboardThemeTokens> =
  DASHBOARD_THEME_PALETTES as Record<DashboardThemeName, DashboardThemeSemanticTokens>;

export { DASHBOARD_THEME_ALIASES };

export function resolveThemeAlias(scope: DashboardThemeAliasScope = 'default'): DashboardThemeName {
  return DASHBOARD_THEME_ALIASES[scope] as DashboardThemeName;
}
