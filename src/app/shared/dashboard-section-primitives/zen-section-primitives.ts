export type OrvelBadgeTone = 'primary' | 'accent' | 'neutral' | 'success' | 'error';
export type ZenBadgeTone = OrvelBadgeTone;

export const ORVEL_SECTION_PRIMITIVES = {
  pageRoot: 'min-h-full flex flex-col bg-bg-primary text-text-primary bg-[radial-gradient(circle_at_top_right,rgba(124,58,237,0.05),transparent_40%),radial-gradient(circle_at_bottom_left,rgba(124,58,237,0.03),transparent_40%)]',
  pageViewport: 'flex-1 overflow-y-auto h-full no-scrollbar p-6 lg:p-10',
  denseGrid: 'grid grid-cols-1 lg:grid-cols-12 gap-8',
  mainColumn: 'col-span-12 lg:col-span-8 space-y-8',
  sideColumn: 'col-span-12 lg:col-span-4 space-y-8',
  sectionHeader: 'space-y-2 mb-8',
  cardGlass: 'or-card or-card-hover',
  cardSoft: 'or-card',
  chip:
    'inline-flex items-center justify-center rounded-full bg-primary/10 px-3 h-6 text-[10px] font-bold uppercase tracking-wider text-primary',
  iconButton:
    'h-8 w-8 inline-flex items-center justify-center rounded-md bg-bg-secondary text-text-secondary hover:bg-divider hover:text-text-primary shadow-sm hover:scale-110 active:scale-95 transition-all duration-300',
  primaryAction:
    'h-12 rounded-lg bg-primary px-8 text-white font-semibold text-sm hover:bg-primary-hover hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-primary/20 transition-all duration-300 flex items-center justify-center gap-2',
  secondaryAction:
    'h-12 rounded-lg bg-primary/10 border border-primary/20 px-8 text-primary font-semibold text-sm hover:bg-primary/20 hover:scale-[1.02] active:scale-[0.98] shadow-sm transition-all duration-300 flex items-center justify-center gap-2',
  subtleAction:
    'h-8 rounded-lg bg-bg-primary border border-white/10 px-4 font-medium text-xs text-text-secondary hover:bg-divider hover:text-text-primary shadow-sm hover:scale-[1.02] transition-all duration-300',

  // Typography Hierarchy
  titleMain: 'text-2xl font-bold tracking-tight text-text-primary',
  titleSection: 'text-xl font-semibold tracking-tight text-text-primary',
  labelMicro: 'text-[11px] font-medium uppercase tracking-wider text-text-secondary',
  bodyPrimary: 'text-sm font-medium text-text-secondary',
  bodySecondary: 'text-xs font-normal text-text-secondary',

  input:
    'h-12 w-full rounded-lg bg-bg-primary px-4 text-sm font-medium text-text-primary placeholder:text-text-secondary focus:ring-2 focus:ring-primary/60 focus:bg-bg-secondary focus:border-primary/60 shadow-inner outline-none transition-all duration-300',
  fieldError: 'mt-1 text-xs font-medium leading-tight text-danger'
} as const;

export const DASHBOARD_ZEN_SECTION_PRIMITIVES = ORVEL_SECTION_PRIMITIVES; // Compatibility

export const ORVEL_BADGE_TONE_CLASS: Record<OrvelBadgeTone, string> = {
  primary: 'bg-primary/10 text-primary',
  accent: 'bg-primary-light/10 text-primary-light',
  neutral: 'bg-border text-text-secondary',
  success: 'bg-success/10 text-success',
  error: 'bg-error/10 text-error'
};

export const ZEN_BADGE_TONE_CLASS = ORVEL_BADGE_TONE_CLASS; // Compatibility
