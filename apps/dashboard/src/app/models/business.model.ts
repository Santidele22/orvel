// Re-export shim for the @orvel/types migration window.
// Source moved to packages/types/src/business.model.ts (chore-extract-types-package).
// Deletable once no importer references this old path.
export type {
  Business,
  WeekdayKey,
  WorkingDayHours,
  BusinessSettings,
  BusinessPublicView,
} from '@orvel/types';
