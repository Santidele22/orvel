// account-closure Edge Function
// Processes due account-cancellation closures after paid-through access has ended.

import { createClient } from "@supabase/supabase-js";
import { requireServerSecret } from "../_shared/billing-security.ts";

type CurrentSubscription = Record<string, any>;
type ClosureEvent = { occurred_at: string; raw_payload?: Record<string, unknown> | null };

type ClosureResult = {
  subscriptionId: string | null;
  businessId: string | null;
  status: "not_due" | "closed" | "already_closed" | "failed";
  reason?: string;
};

type ClosureSummary = {
  processed: number;
  closed: number;
  skipped: number;
  failed: number;
  results: ClosureResult[];
};

function createDefaultSupabaseAdminClient() {
  return createClient(
    requireServerSecret("SUPABASE_URL"),
    requireServerSecret("SUPABASE_SERVICE_ROLE_KEY"),
  );
}

function isAuthorizedClosureRequest(req: Request, expectedSecret: string | undefined): boolean {
  if (!expectedSecret) return false;
  const authorization = req.headers.get("authorization") || "";
  const bearerToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || null;
  const headerToken = req.headers.get("x-account-closure-secret") || req.headers.get("x-cron-key");
  return bearerToken === expectedSecret || headerToken === expectedSecret;
}

function resolvePaidThroughDate(subscription: CurrentSubscription): string | null {
  return subscription.period_end || subscription.current_period_end || null;
}

function resolveClosureDueDate(subscription: CurrentSubscription): string | null {
  return subscription.account_closure_at || resolvePaidThroughDate(subscription);
}

function isNonPaidOrLocalClosureCandidate(subscription: CurrentSubscription): boolean {
  const provider = String(subscription.provider || "mercado_pago").toLowerCase();
  const planCode = String(subscription.plan_code || "").toLowerCase();
  const hasProviderSubscriptionId = Boolean(subscription.provider_subscription_id || subscription.mp_preapproval_id);

  return ["free", "gratis", "none"].includes(planCode) ||
    (["local", "manual", "orvel", "none"].includes(provider) && !hasProviderSubscriptionId);
}

function isFinalAccountClosureState(subscription: CurrentSubscription): boolean {
  const status = String(subscription.status || "").toLowerCase();
  return status === "account_closed";
}

function isDueForClosure(subscription: CurrentSubscription, nowDate: Date): boolean {
  const closureDueDate = resolveClosureDueDate(subscription);
  if (!closureDueDate) return isNonPaidOrLocalClosureCandidate(subscription);

  const paidThroughMs = Date.parse(closureDueDate);
  return Number.isFinite(paidThroughMs) && paidThroughMs <= nowDate.getTime();
}

function requiresProviderClosureEvidence(_subscription: CurrentSubscription): boolean {
  // All closures are treated as manual/local: provider-cancelled evidence is
  // never recorded anymore (MP preapproval gutted), so requiring it would
  // deadlock every paid-account closure.
  return false;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function recordAccountClosureEvent(input: {
  supabaseAdmin: any;
  subscription: CurrentSubscription;
  providerEventId: string;
  eventType: string;
  occurredAt: string;
  payload: Record<string, unknown>;
  transitionAction: string;
}): Promise<{ ok: true; duplicate?: boolean } | { ok: false; error: unknown }> {
  const { error } = await input.supabaseAdmin
    .from("subscription_events")
    .insert({
      tenant_id: input.subscription.tenant_id || input.subscription.business_id,
      business_id: input.subscription.business_id,
      subscription_id: input.subscription.id || null,
      provider: "orvel_account",
      provider_event_id: input.providerEventId,
      provider_subscription_id: input.subscription.provider_subscription_id || input.subscription.mp_preapproval_id || null,
      event_type: input.eventType,
      occurred_at: input.occurredAt,
      raw_payload: input.payload,
      payload_hash: `sha256:${await sha256Hex(JSON.stringify(input.payload))}`,
      transition_action: input.transitionAction,
      previous_status: input.subscription.status || null,
      next_status: input.eventType === "account.cancellation_closed" ? "account_closed" : input.subscription.status || null,
      previous_version: input.subscription.version ?? null,
      next_version: input.subscription.version ?? null,
    });

  if (error?.code === "23505") {
    return { ok: true, duplicate: true };
  }

  return error ? { ok: false, error } : { ok: true };
}

async function lookupClosureEvent(input: {
  supabaseAdmin: any;
  providerEventId: string;
}): Promise<{ data: ClosureEvent | null; exists: boolean; error: unknown | null }> {
  const { data, error } = await input.supabaseAdmin
    .from("subscription_events")
    .select("occurred_at, raw_payload")
    .eq("provider", "orvel_account")
    .eq("provider_event_id", input.providerEventId)
    .limit(1)
    .maybeSingle();

  return { data: data ?? null, exists: Boolean(data), error: error ?? null };
}

async function lookupAccountClosureEvidence(input: {
  supabaseAdmin: any;
  subscription: CurrentSubscription;
}): Promise<{
  scheduled: ClosureEvent | null;
  providerCancelled: ClosureEvent | null;
  error: unknown | null;
}> {
  const baseId = `account-cancel-request:${input.subscription.business_id}:${input.subscription.id}`;
  const scheduled = await lookupClosureEvent({
    supabaseAdmin: input.supabaseAdmin,
    providerEventId: `${baseId}:scheduled`,
  });
  if (scheduled.error) return { scheduled: null, providerCancelled: null, error: scheduled.error };

  const providerCancelled = await lookupClosureEvent({
    supabaseAdmin: input.supabaseAdmin,
    providerEventId: `${baseId}:provider-cancelled`,
  });
  if (providerCancelled.error) return { scheduled: null, providerCancelled: null, error: providerCancelled.error };

  return { scheduled: scheduled.data, providerCancelled: providerCancelled.data, error: null };
}

function payloadString(event: ClosureEvent | null, key: string): string | null {
  const value = event?.raw_payload?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function resolveScheduledRequester(evidence: {
  scheduled: ClosureEvent | null;
  providerCancelled: ClosureEvent | null;
}, providerEvidenceRequired: boolean): { ownerId: string | null; reason: string | null } {
  const scheduledRequester = payloadString(evidence.scheduled, "requested_by");
  if (!scheduledRequester) return { ownerId: null, reason: "requester_evidence_missing" };

  if (!providerEvidenceRequired) return { ownerId: scheduledRequester, reason: null };

  const providerRequester = payloadString(evidence.providerCancelled, "requested_by");
  if (!providerRequester) return { ownerId: null, reason: "provider_requester_evidence_missing" };
  if (providerRequester !== scheduledRequester) return { ownerId: null, reason: "requester_evidence_mismatch" };

  return { ownerId: scheduledRequester, reason: null };
}

function resolveClosureStartedOwner(event: ClosureEvent | null): string | null {
  return payloadString(event, "owner_id") || payloadString(event, "requested_by");
}

function isAuthUserNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; status?: unknown; statusCode?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code.toLowerCase() : "";
  const message = typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";
  const status = typeof candidate.status === "number" ? candidate.status : candidate.statusCode;

  return status === 404 || code.includes("not_found") || code.includes("user_not_found") || message.includes("not found");
}

async function updateSubscriptionClosed(input: {
  supabaseAdmin: any;
  subscription: CurrentSubscription;
  closedAt: string;
}): Promise<{ error: unknown | null }> {
  const { error } = await input.supabaseAdmin
    .from("business_subscriptions")
    .update({
      status: "account_closed",
      cancel_reason: "account_closed",
      cancel_at_period_end: false,
      cancelled_at: input.closedAt,
      updated_at: input.closedAt,
    })
    .eq("id", input.subscription.id);

  return { error: error ?? null };
}

async function updateBusinessAccountClosed(input: {
  supabaseAdmin: any;
  subscription: CurrentSubscription;
  closedAt: string;
}): Promise<{ error: unknown | null }> {
  const businessId = input.subscription.business_id;
  if (!businessId) return { error: null };

  const { error } = await input.supabaseAdmin
    .from("businesses")
    .update({
      account_closed_at: input.closedAt,
      account_closure_reason: "account_cancellation_closed",
      updated_at: input.closedAt,
    })
    .eq("id", businessId);

  return { error: error ?? null };
}

function needsAccountCancellationCandidateRepair(subscription: CurrentSubscription): boolean {
  if (isFinalAccountClosureState(subscription)) return false;

  return subscription.cancel_at_period_end !== true ||
    subscription.cancel_reason !== "account_cancellation_requested" ||
    !subscription.cancelled_at;
}

async function updateAccountCancellationCandidateState(input: {
  supabaseAdmin: any;
  subscription: CurrentSubscription;
  timestamp: string;
}): Promise<{ error: unknown | null }> {
  const { error } = await input.supabaseAdmin
    .from("business_subscriptions")
    .update({
      cancel_at_period_end: true,
      cancel_reason: "account_cancellation_requested",
      cancelled_at: input.timestamp,
      updated_at: input.timestamp,
    })
    .eq("id", input.subscription.id);

  return { error: error ?? null };
}

async function recordClosedAndRepairSubscription(input: {
  supabaseAdmin: any;
  subscription: CurrentSubscription;
  closureSuccessEventId: string;
  occurredAt: string;
  ownerId: string;
}): Promise<{ ok: true } | { ok: false; reason: "closure_audit_failed" | "business_update_failed" | "subscription_update_failed"; error: unknown }> {
  const closureEvent = await recordAccountClosureEvent({
    supabaseAdmin: input.supabaseAdmin,
    subscription: input.subscription,
    providerEventId: input.closureSuccessEventId,
    eventType: "account.cancellation_closed",
    occurredAt: input.occurredAt,
    payload: {
      owner_id: input.ownerId,
      paid_through: resolvePaidThroughDate(input.subscription),
      action: "auth_user_deleted_business_records_preserved",
    },
    transitionAction: "ACCOUNT_CLOSED",
  });
  if (!closureEvent.ok) return { ok: false, reason: "closure_audit_failed", error: closureEvent.error };

  const businessUpdateResult = await updateBusinessAccountClosed({
    supabaseAdmin: input.supabaseAdmin,
    subscription: input.subscription,
    closedAt: input.occurredAt,
  });
  if (businessUpdateResult.error) return { ok: false, reason: "business_update_failed", error: businessUpdateResult.error };

  const updateResult = await updateSubscriptionClosed({
    supabaseAdmin: input.supabaseAdmin,
    subscription: input.subscription,
    closedAt: input.occurredAt,
  });
  if (updateResult.error) return { ok: false, reason: "subscription_update_failed", error: updateResult.error };

  return { ok: true };
}

async function loadDueCancellationCandidates(input: {
  supabaseAdmin: any;
}): Promise<{ data: CurrentSubscription[]; error: unknown | null }> {
  const { data, error } = await input.supabaseAdmin
    .from("business_subscriptions")
    .select("*")
    .eq("cancel_at_period_end", true)
    .eq("cancel_reason", "account_cancellation_requested");

  return { data: data ?? [], error: error ?? null };
}

async function loadScheduledClosureRepairEvents(input: {
  supabaseAdmin: any;
}): Promise<{ data: Record<string, any>[]; error: unknown | null }> {
  const { data, error } = await input.supabaseAdmin
    .from("subscription_events")
    .select("subscription_id, occurred_at")
    .eq("provider", "orvel_account")
    .eq("event_type", "account.cancellation_scheduled");

  return { data: data ?? [], error: error ?? null };
}

async function loadSubscriptionById(input: {
  supabaseAdmin: any;
  subscriptionId: string;
}): Promise<{ data: CurrentSubscription | null; error: unknown | null }> {
  const { data, error } = await input.supabaseAdmin
    .from("business_subscriptions")
    .select("*")
    .eq("id", input.subscriptionId)
    .maybeSingle();

  return { data: data ?? null, error: error ?? null };
}

async function repairScheduledClosureCandidates(input: {
  supabaseAdmin: any;
  logError: (...args: unknown[]) => void;
}): Promise<{ error: unknown | null }> {
  const scheduledEvents = await loadScheduledClosureRepairEvents({ supabaseAdmin: input.supabaseAdmin });
  if (scheduledEvents.error) return { error: scheduledEvents.error };

  for (const event of scheduledEvents.data) {
    const subscriptionId = typeof event.subscription_id === "string" ? event.subscription_id : null;
    const occurredAt = typeof event.occurred_at === "string" ? event.occurred_at : null;
    if (!subscriptionId || !occurredAt) continue;

    const subscription = await loadSubscriptionById({
      supabaseAdmin: input.supabaseAdmin,
      subscriptionId,
    });
    if (subscription.error) return { error: subscription.error };
    if (!subscription.data || !needsAccountCancellationCandidateRepair(subscription.data)) continue;

    const repair = await updateAccountCancellationCandidateState({
      supabaseAdmin: input.supabaseAdmin,
      subscription: subscription.data,
      timestamp: occurredAt,
    });
    if (repair.error) {
      input.logError("Error repairing scheduled account closure candidate:", repair.error);
      return { error: repair.error };
    }
  }

  return { error: null };
}

export async function processDueAccountClosures(input: {
  supabaseAdmin: any;
  now?: () => Date;
  logError?: (...args: unknown[]) => void;
}): Promise<ClosureSummary> {
  const nowDate = input.now?.() ?? new Date();
  const occurredAt = nowDate.toISOString();
  const logError = input.logError ?? console.error;
  const results: ClosureResult[] = [];

  const repairCandidates = await repairScheduledClosureCandidates({
    supabaseAdmin: input.supabaseAdmin,
    logError,
  });
  if (repairCandidates.error) {
    logError("Error repairing scheduled account closure candidates:", repairCandidates.error);
    return {
      processed: 0,
      closed: 0,
      skipped: 0,
      failed: 1,
      results: [{ subscriptionId: null, businessId: null, status: "failed", reason: "scheduled_candidate_repair_failed" }],
    };
  }

  const candidates = await loadDueCancellationCandidates({ supabaseAdmin: input.supabaseAdmin });
  if (candidates.error) {
    logError("Error loading due account closure candidates:", candidates.error);
    return {
      processed: 0,
      closed: 0,
      skipped: 0,
      failed: 1,
      results: [{ subscriptionId: null, businessId: null, status: "failed", reason: "candidate_lookup_failed" }],
    };
  }

  for (const subscription of candidates.data) {
    const subscriptionId = subscription.id ?? null;
    const businessId = subscription.business_id ?? null;
    const closureBaseId = `account-closure:${businessId || "no-business"}:${subscriptionId || "no-subscription"}`;
    const closureSuccessEventId = `${closureBaseId}:closed`;
    const closureFailureEventId = `${closureBaseId}:failed`;

    if (isFinalAccountClosureState(subscription)) {
      results.push({ subscriptionId, businessId, status: "already_closed" });
      continue;
    }

    if (!isDueForClosure(subscription, nowDate)) {
      results.push({ subscriptionId, businessId, status: "not_due" });
      continue;
    }

    const existingClosure = await lookupClosureEvent({
      supabaseAdmin: input.supabaseAdmin,
      providerEventId: closureSuccessEventId,
    });
    if (existingClosure.error) {
      logError("Error checking existing account closure event:", existingClosure.error);
      results.push({ subscriptionId, businessId, status: "failed", reason: "closure_lookup_failed" });
      continue;
    }

    if (existingClosure.exists) {
      const businessUpdateResult = await updateBusinessAccountClosed({
        supabaseAdmin: input.supabaseAdmin,
        subscription,
        closedAt: existingClosure.data?.occurred_at || occurredAt,
      });
      if (businessUpdateResult.error) {
        logError("Error repairing already closed business state:", businessUpdateResult.error);
        results.push({ subscriptionId, businessId, status: "failed", reason: "business_update_failed" });
        continue;
      }

      const repairResult = await updateSubscriptionClosed({
        supabaseAdmin: input.supabaseAdmin,
        subscription,
        closedAt: existingClosure.data?.occurred_at || occurredAt,
      });
      if (repairResult.error) {
        logError("Error repairing already closed subscription:", repairResult.error);
        results.push({ subscriptionId, businessId, status: "failed", reason: "closed_repair_failed" });
        continue;
      }
      results.push({ subscriptionId, businessId, status: "already_closed" });
      continue;
    }

    const evidence = await lookupAccountClosureEvidence({
      supabaseAdmin: input.supabaseAdmin,
      subscription,
    });
    if (evidence.error) {
      logError("Error checking account cancellation scheduled evidence:", evidence.error);
      results.push({ subscriptionId, businessId, status: "failed", reason: "scheduled_evidence_lookup_failed" });
      continue;
    }

    const providerEvidenceRequired = requiresProviderClosureEvidence(subscription);
    if (!evidence.scheduled) {
      await recordAccountClosureEvent({
        supabaseAdmin: input.supabaseAdmin,
        subscription,
        providerEventId: closureFailureEventId,
        eventType: "account.cancellation_closure_failed",
        occurredAt,
        payload: {
          failure_reason: "scheduled_evidence_missing",
        },
        transitionAction: "ACCOUNT_CLOSURE_FAILED",
      });
      results.push({
        subscriptionId,
        businessId,
        status: "failed",
        reason: "scheduled_evidence_missing",
      });
      continue;
    }

    const boundRequester = resolveScheduledRequester(evidence, providerEvidenceRequired);
    if (!boundRequester.ownerId) {
      await recordAccountClosureEvent({
        supabaseAdmin: input.supabaseAdmin,
        subscription,
        providerEventId: closureFailureEventId,
        eventType: "account.cancellation_closure_failed",
        occurredAt,
        payload: { failure_reason: boundRequester.reason || "requester_evidence_missing" },
        transitionAction: "ACCOUNT_CLOSURE_FAILED",
      });
      results.push({
        subscriptionId,
        businessId,
        status: "failed",
        reason: boundRequester.reason || "requester_evidence_missing",
      });
      continue;
    }

    if (!businessId) {
      await recordAccountClosureEvent({
        supabaseAdmin: input.supabaseAdmin,
        subscription,
        providerEventId: closureFailureEventId,
        eventType: "account.cancellation_closure_failed",
        occurredAt,
        payload: { failure_reason: "missing_business_id" },
        transitionAction: "ACCOUNT_CLOSURE_FAILED",
      });
      results.push({ subscriptionId, businessId, status: "failed", reason: "missing_business_id" });
      continue;
    }

    const startedEventId = `${closureBaseId}:started`;
    const existingStarted = await lookupClosureEvent({
      supabaseAdmin: input.supabaseAdmin,
      providerEventId: startedEventId,
    });
    if (existingStarted.error) {
      logError("Error checking account closure start:", existingStarted.error);
      results.push({ subscriptionId, businessId, status: "failed", reason: "closure_start_lookup_failed" });
      continue;
    }

    let deletionOwnerId = resolveClosureStartedOwner(existingStarted.data);
    if (existingStarted.exists && !deletionOwnerId) {
      await recordAccountClosureEvent({
        supabaseAdmin: input.supabaseAdmin,
        subscription,
        providerEventId: closureFailureEventId,
        eventType: "account.cancellation_closure_failed",
        occurredAt,
        payload: { failure_reason: "closure_started_owner_missing" },
        transitionAction: "ACCOUNT_CLOSURE_FAILED",
      });
      results.push({ subscriptionId, businessId, status: "failed", reason: "closure_started_owner_missing" });
      continue;
    }

    if (existingStarted.exists && deletionOwnerId !== boundRequester.ownerId) {
      await recordAccountClosureEvent({
        supabaseAdmin: input.supabaseAdmin,
        subscription,
        providerEventId: closureFailureEventId,
        eventType: "account.cancellation_closure_failed",
        occurredAt,
        payload: { failure_reason: "closure_started_owner_mismatch" },
        transitionAction: "ACCOUNT_CLOSURE_FAILED",
      });
      results.push({ subscriptionId, businessId, status: "failed", reason: "closure_started_owner_mismatch" });
      continue;
    }

    if (!existingStarted.exists) {
      const startedEvent = await recordAccountClosureEvent({
        supabaseAdmin: input.supabaseAdmin,
        subscription,
        providerEventId: startedEventId,
        eventType: "account.cancellation_closure_started",
        occurredAt,
        payload: { owner_id: boundRequester.ownerId, paid_through: resolvePaidThroughDate(subscription) },
        transitionAction: "ACCOUNT_CLOSURE_STARTED",
      });
      if (!startedEvent.ok) {
        logError("Error recording account closure start:", startedEvent.error);
        results.push({ subscriptionId, businessId, status: "failed", reason: "closure_start_audit_failed" });
        continue;
      }

      deletionOwnerId = boundRequester.ownerId;
    }

    if (!deletionOwnerId) {
      await recordAccountClosureEvent({
        supabaseAdmin: input.supabaseAdmin,
        subscription,
        providerEventId: closureFailureEventId,
        eventType: "account.cancellation_closure_failed",
        occurredAt,
        payload: { failure_reason: "closure_delete_owner_missing" },
        transitionAction: "ACCOUNT_CLOSURE_FAILED",
      });
      results.push({ subscriptionId, businessId, status: "failed", reason: "closure_delete_owner_missing" });
      continue;
    }

    const deleteResult = await input.supabaseAdmin.auth.admin.deleteUser(deletionOwnerId);
    if (deleteResult.error) {
      if (isAuthUserNotFound(deleteResult.error)) {
        const repairResult = await recordClosedAndRepairSubscription({
          supabaseAdmin: input.supabaseAdmin,
          subscription,
          closureSuccessEventId,
          occurredAt,
          ownerId: deletionOwnerId,
        });

        if (repairResult.ok) {
          results.push({ subscriptionId, businessId, status: "closed" });
          continue;
        }

        logError("Error repairing account closure after auth user was already deleted:", repairResult.error);
        await recordAccountClosureEvent({
          supabaseAdmin: input.supabaseAdmin,
          subscription,
          providerEventId: closureFailureEventId,
          eventType: "account.cancellation_closure_failed",
          occurredAt,
          payload: { failure_reason: `${repairResult.reason}_after_auth_not_found`, owner_id: deletionOwnerId },
          transitionAction: "ACCOUNT_CLOSURE_FAILED",
        });
        results.push({ subscriptionId, businessId, status: "failed", reason: repairResult.reason });
        continue;
      }

      await recordAccountClosureEvent({
        supabaseAdmin: input.supabaseAdmin,
        subscription,
        providerEventId: closureFailureEventId,
        eventType: "account.cancellation_closure_failed",
        occurredAt,
        payload: { failure_reason: "auth_delete_failed", owner_id: deletionOwnerId },
        transitionAction: "ACCOUNT_CLOSURE_FAILED",
      });
      results.push({ subscriptionId, businessId, status: "failed", reason: "auth_delete_failed" });
      continue;
    }

    const closureRepair = await recordClosedAndRepairSubscription({
      supabaseAdmin: input.supabaseAdmin,
      subscription,
      closureSuccessEventId,
      occurredAt,
      ownerId: deletionOwnerId,
    });
    if (!closureRepair.ok) {
      logError("Error finalizing account closure:", closureRepair.error);
      await recordAccountClosureEvent({
        supabaseAdmin: input.supabaseAdmin,
        subscription,
        providerEventId: closureFailureEventId,
        eventType: "account.cancellation_closure_failed",
        occurredAt,
        payload: { failure_reason: `${closureRepair.reason}_after_auth_delete`, owner_id: deletionOwnerId },
        transitionAction: "ACCOUNT_CLOSURE_FAILED",
      });
      results.push({ subscriptionId, businessId, status: "failed", reason: closureRepair.reason });
      continue;
    }

    results.push({ subscriptionId, businessId, status: "closed" });
  }

  return {
    processed: results.length,
    closed: results.filter((result) => result.status === "closed").length,
    skipped: results.filter((result) => result.status === "not_due" || result.status === "already_closed").length,
    failed: results.filter((result) => result.status === "failed").length,
    results,
  };
}

export function createAccountClosureHandler(
  dependencies: {
    createSupabaseAdminClient?: () => any;
    getSecret?: (key: string) => string | undefined;
    now?: () => Date;
    logError?: (...args: unknown[]) => void;
  } = {},
) {
  const createSupabaseAdminClient = dependencies.createSupabaseAdminClient ?? createDefaultSupabaseAdminClient;
  const getSecret = dependencies.getSecret ?? ((key: string) => Deno.env.get(key));

  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!isAuthorizedClosureRequest(req, getSecret("ACCOUNT_CLOSURE_CRON_SECRET"))) {
      return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const summary = await processDueAccountClosures({
      supabaseAdmin: createSupabaseAdminClient(),
      now: dependencies.now,
      logError: dependencies.logError,
    });

    if (summary.failed > 0) {
      return new Response(JSON.stringify({
        error: "ACCOUNT_CLOSURE_PROCESSING_FAILED",
        processed: summary.processed,
        closed: summary.closed,
        skipped: summary.skipped,
        failed: summary.failed,
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(summary), {
      headers: { "Content-Type": "application/json" },
    });
  };
}

export const handleAccountClosure = createAccountClosureHandler();

if (import.meta.main) {
  Deno.serve(handleAccountClosure);
}
