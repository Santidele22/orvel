/**
 * Fase 1 of #1098 — the branch-context port of the shared core.
 *
 * `BranchContextService` resolves which business and branch the operator is
 * working in, which needs three things from the backend: the signed-in session,
 * the `get_dashboard_branches` RPC and the businesses the user owns. Those are
 * the only backend shapes the service knows, expressed here in the app's own
 * vocabulary, so the SDK stays in `core/adapters/supabase/` and tests inject
 * three plain methods instead of simulating a query builder.
 *
 * Implementations throw when the backend call fails: the service already treats
 * a failed read as "fall back to what is stored", and that decision belongs to
 * the service, not to the adapter.
 */
export type BranchSessionSnapshot = {
  userId: string | null;
  userMetadata: Record<string, unknown> | undefined;
};

export type OwnedBusinessRow = {
  id: string;
  owner_id?: string;
  slug?: string;
  name?: string;
};

export interface BranchContextSource {
  /** `null` when nobody is signed in. */
  readSession(): Promise<BranchSessionSnapshot | null>;

  /** Raw `get_dashboard_branches` rows; the service keeps its own mapping. */
  listDashboardBranches(businessId: string): Promise<Array<Record<string, unknown>>>;

  /** Businesses owned by the user, oldest first. */
  listOwnedBusinesses(ownerId: string): Promise<OwnedBusinessRow[]>;
}
