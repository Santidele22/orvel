import { DASHBOARD_THEME_TOKENS, DashboardThemeName } from './theme.tokens';
import { DASHBOARD_ZEN_FOUNDATION_TOKENS } from './dashboard-zen-foundations.tokens';

export function applyDashboardTheme(host: HTMLElement, theme: DashboardThemeName): void {
  const resolvedThemeName: DashboardThemeName = DASHBOARD_THEME_TOKENS[theme] ? theme : 'zen';
  const resolvedTheme = DASHBOARD_THEME_TOKENS[resolvedThemeName];

  host.dataset['theme'] = resolvedThemeName;
  host.style.setProperty('--bg', resolvedTheme.bg);
  host.style.setProperty('--primary', resolvedTheme.primary);
  host.style.setProperty('--primary-soft', resolvedTheme.primarySoft);
  host.style.setProperty('--accent', resolvedTheme.accent);
  host.style.setProperty('--surface', resolvedTheme.surface);
  host.style.setProperty('--text', resolvedTheme.text);
  host.style.setProperty('--on-primary', resolvedTheme.onPrimary);
  host.style.setProperty('--focus-ring', resolvedTheme.focusRing);
  host.style.setProperty('--success', resolvedTheme.success);
  host.style.setProperty('--warning', resolvedTheme.warning);
  host.style.setProperty('--danger', resolvedTheme.danger);
  host.style.setProperty('--danger-soft', resolvedTheme.dangerSoft);

  const { spacing, sizing, typography, radius } = DASHBOARD_ZEN_FOUNDATION_TOKENS;
  host.style.setProperty('--zen-space-xs', spacing['xs']);
  host.style.setProperty('--zen-space-sm', spacing['sm']);
  host.style.setProperty('--zen-space-md', spacing['md']);
  host.style.setProperty('--zen-space-lg', spacing['lg']);
  host.style.setProperty('--zen-space-xl', spacing['xl']);
  host.style.setProperty('--zen-space-xxl', spacing['xxl']);
  host.style.setProperty('--zen-space-section', spacing['section']);

  host.style.setProperty('--zen-size-control-sm', sizing['controlSm']);
  host.style.setProperty('--zen-size-control-md', sizing['controlMd']);
  host.style.setProperty('--zen-size-control-lg', sizing['controlLg']);
  host.style.setProperty('--zen-size-icon-sm', sizing['iconSm']);
  host.style.setProperty('--zen-size-icon-md', sizing['iconMd']);
  host.style.setProperty('--zen-size-icon-lg', sizing['iconLg']);
  host.style.setProperty('--zen-size-ornament', sizing['ornament']);
  host.style.setProperty('--zen-size-panel', sizing['panel']);
  host.style.setProperty('--zen-size-viewport-height', sizing['viewportHeight']);
  host.style.setProperty('--zen-size-viewport-width', sizing['viewportWidth']);
  host.style.setProperty('--zen-size-content-max', sizing['contentMax']);

  host.style.setProperty('--zen-font-micro', typography['micro']);
  host.style.setProperty('--zen-font-caption', typography['caption']);
  host.style.setProperty('--zen-font-body', typography['body']);
  host.style.setProperty('--zen-font-body-lg', typography['bodyLg']);
  host.style.setProperty('--zen-font-title', typography['title']);
  host.style.setProperty('--zen-font-heading', typography['heading']);
  host.style.setProperty('--zen-track-tight', typography['trackingTight']);
  host.style.setProperty('--zen-track-wide', typography['trackingWide']);

  host.style.setProperty('--zen-radius-sm', radius['sm']);
  host.style.setProperty('--zen-radius-md', radius['md']);
  host.style.setProperty('--zen-radius-lg', radius['lg']);
  host.style.setProperty('--zen-radius-xl', radius['xl']);
  host.style.setProperty('--zen-radius-card', radius['card']);
  host.style.setProperty('--zen-radius-full', radius['full']);

  // Semantic visual tokens (Iris/Bruno Gate A)
  host.style.setProperty('--zen-surface-glass', 'rgb(255 255 255 / 0.7)');
  host.style.setProperty('--zen-border-subtle', 'rgb(17 24 39 / 0.05)');
  host.style.setProperty('--zen-blur-glass', '20px');
  host.style.setProperty('--zen-radius-interactive', '20px');
  host.style.setProperty('--zen-overlay-opacity', '0.72');

  // Ethereal Atelier Specifics
  host.style.setProperty('--ambient-shadow', `0 20px 40px color-mix(in srgb, ${resolvedTheme.text} 6%, transparent)`);
  host.style.setProperty('--primary-glow', `0 8px 20px color-mix(in srgb, ${resolvedTheme.primary} 30%, transparent)`);
}
