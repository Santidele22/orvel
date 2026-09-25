export interface DashboardStructuralTokens {
  shellRoot: string;
  shellViewport: string;
  pageRoot: string;
  pageViewport: string;
  twoColumnGrid: string;
  mainColumn: string;
  asideColumn: string;
  // Spacing & Geometry
  containerPadding: string;
  containerGap: string;
  cardRadius: string;
  cardPadding: string;
  innerGap: string;
  asideWidth: string;
  timelineRowHeight: string;
}

export const DASHBOARD_STRUCTURAL_TOKENS: DashboardStructuralTokens = {
  shellRoot: 'h-screen w-screen overflow-hidden flex font-sans bg-bg-primary text-text-primary',
  shellViewport: 'flex-1 flex flex-col relative h-full min-w-0 overflow-hidden',
  pageRoot: 'h-full flex flex-col overflow-hidden bg-bg-primary',
  pageViewport: 'flex-1 flex overflow-hidden p-8 lg:p-10 gap-8',
  twoColumnGrid: 'flex-1 flex overflow-hidden p-8 lg:p-10 gap-10',
  mainColumn: 'flex-1 flex flex-col min-w-0',
  asideColumn: 'w-[320px] flex flex-col shrink-0',
  
  // Design Tokens - Orvel Standard
  containerPadding: 'p-10',
  containerGap: 'gap-10',
  cardRadius: 'rounded-2xl',
  cardPadding: 'p-8',
  innerGap: 'gap-6',
  asideWidth: 'w-[320px]',
  timelineRowHeight: 'min-h-[120px]'
};
