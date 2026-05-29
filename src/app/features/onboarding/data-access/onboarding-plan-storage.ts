/**
 * Onboarding Plan Selection Storage
 *
 * Handles persistence of selected plan during onboarding flow.
 * Storage key: turnea.onboarding.v1 (per KBN-004.5.4)
 *
 * The storage module provides:
 * - ONBOARDING_PLAN_STORAGE_KEY: The storage key for plan selection
 * - persistPlanSelection(storage, plan): Stores the selected plan
 * - readPlanSelection(storage): Retrieves the stored plan or null
 */

import { normalizePlanCode, type PlanCode } from '../../../core/plans/plan-entitlements';

export const ONBOARDING_PLAN_STORAGE_KEY = 'turnea.onboarding.plan';

/**
 * Persists the selected plan to storage.
 * @param storage - Storage-like object (localStorage, sessionStorage, etc.)
 * @param plan - The plan code to persist (FREE, BASIC, MEDIUM, PRO)
 */
export function persistPlanSelection(storage: Pick<Storage, 'setItem'>, plan: PlanCode): void {
  storage.setItem(ONBOARDING_PLAN_STORAGE_KEY, normalizePlanCode(plan));
}

/**
 * Reads the persisted plan selection from storage.
 * @param storage - Storage-like object
 * @returns The stored plan code or null if not found/invalid
 */
export function readPlanSelection(storage: Pick<Storage, 'getItem'>): PlanCode | null {
  const stored = storage.getItem(ONBOARDING_PLAN_STORAGE_KEY);
  if (!stored) {
    return null;
  }

  return normalizePlanCode(stored);
}
