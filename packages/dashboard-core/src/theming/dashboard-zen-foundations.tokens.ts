export interface DashboardZenFoundationTokens {
  spacing: Record<string, string>;
  sizing: Record<string, string>;
  typography: Record<string, string>;
  radius: Record<string, string>;
}

// Iris handoff mapping: zen-{category}-{scale}
export const DASHBOARD_ZEN_FOUNDATION_TOKENS: DashboardZenFoundationTokens = {
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '0.75rem',
    lg: '1rem',
    xl: '1.5rem',
    xxl: '2rem',
    section: '2.5rem'
  },
  sizing: {
    controlSm: '2rem',
    controlMd: '2.5rem',
    controlLg: '2.75rem',
    iconSm: '1rem',
    iconMd: '1.5rem',
    iconLg: '2rem',
    ornament: '8rem',
    panel: '16rem',
    viewportHeight: '100vh',
    viewportWidth: '100vw',
    contentMax: '45rem'
  },
  typography: {
    micro: '0.625rem',
    caption: '0.75rem',
    body: '0.875rem',
    bodyLg: '1rem',
    title: '1.875rem',
    heading: '2.5rem',
    trackingTight: '-0.03em',
    trackingWide: '0.1em'
  },
  radius: {
    sm: '0.5rem',
    md: '0.75rem',
    lg: '1rem',
    xl: '1.5rem',
    card: '2rem',
    full: '9999px'
  }
};
