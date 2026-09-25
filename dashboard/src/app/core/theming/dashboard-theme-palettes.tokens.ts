import { DashboardThemeSemanticTokens } from './dashboard-semantic-color-roles.tokens';

export const DASHBOARD_THEME_PALETTES: Record<string, DashboardThemeSemanticTokens> = {
  zen: {
    background: '#0F172A',
    surface: '#1E293B',
    primary: '#7C3AED',
    primarySoft: 'rgba(124, 58, 237, 0.1)',
    secondary: '#334155',
    accent: '#A78BFA',
    text: '#F1F5F9',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    dangerSoft: 'rgba(239, 68, 68, 0.1)',
    bg: '#0F172A',
    onPrimary: '#FFFFFF',
    focusRing: '#7C3AED',
    headingFont: 'Inter, system-ui, -apple-system, sans-serif',
    bodyFont: 'Inter, system-ui, -apple-system, sans-serif'
  }
} as const;

export type DashboardThemeAliasScope = 'default';

export const DASHBOARD_THEME_ALIASES: Record<DashboardThemeAliasScope, keyof typeof DASHBOARD_THEME_PALETTES> = {
  default: 'zen'
};
