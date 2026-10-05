// Shim: the rubro runtime moved to `core/catalog/required-rubros` in Fase 3 of #1098, so the core
// no longer depends on a feature. This old path is kept for the migration window and only
// re-exports; it owns no logic.
export {
  REQUIRED_RUBROS,
  normalizeRubro,
  dedupeStringArray,
  sanitizeSelectedRubros,
  canContinueOnboarding,
  toggleSelectedRubro,
  type RequiredRubro
} from '../../../core/catalog/required-rubros';
