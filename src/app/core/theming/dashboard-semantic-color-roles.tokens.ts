export type DashboardSemanticColorRoles = {
  background: string;
  surface: string;
  primary: string;
  primarySoft: string;
  secondary: string;
  accent: string;
  text: string;
  success: string;
  warning: string;
  danger: string;
  dangerSoft: string;
};

export type DashboardLegacyColorRoles = {
  bg: string;
  onPrimary: string;
  focusRing: string;
};

export type DashboardTypographyRoles = {
  headingFont: string;
  bodyFont: string;
};

export type DashboardThemeSemanticTokens = DashboardSemanticColorRoles & DashboardLegacyColorRoles & DashboardTypographyRoles;
