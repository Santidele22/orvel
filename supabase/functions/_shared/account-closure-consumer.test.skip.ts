import {
  assertEquals,
  assertMatch,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createAccountClosureHandler, processDueAccountClosures } from "../account-closure/index.ts";

const fixedNow = new Date("2026-08-01T00:00:00.000Z");
const accountClosureOwnerFkMigrationPath = new URL(
  "../../migrations/_legacy/20260708223500_business_owner_fk_set_null_for_account_closure.sql",
  import.meta.url,
);
const accountClosurePublicBookingMigrationPath = new URL(
  "../../migrations/_legacy/20260708234500_account_closure_blocks_public_booking.sql",
  import.meta.url,
);

type MockCall = {
  table: string;
  operation: string;
  values?: unknown;
};

type MockScenario = {
  subscriptions?: Record<string, unknown>[];
  scheduledRepairEvents?: Record<string, unknown>[];
  existingClosure?: { occurred_at: string; raw_payload?: Record<string, unknown> | null } | null;
  events?: Record<string, { occurred_at: string; raw_payload?: Record<string, unknown> | null } | null>;
  eventLookupError?: { code?: string; message?: string } | null;
  insertErrors?: Record<string, { code?: string; message?: string }>;
  businessOwnerId?: string | null;
  businessLookupError?: { code?: string; message?: string } | null;
  deleteUserError?: { code?: string; message: string; status?: number } | null;
  updateError?: { code?: string; message?: string } | null;
};

function baseSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "subscription-1",
    business_id: "business-1",
    tenant_id: "tenant-1",
    status: "active",
    plan_code: "pro",
    provider_subscription_id: "mp-subscription-1",
    period_end: "2026-08-01T00:00:00.000Z",
    current_period_end: null,
    cancel_at_period_end: true,
    cancel_reason: "account_cancellation_requested",
    version: 3,
    ...overrides,
  };
}

function createMockSupabase(scenario: MockScenario = {}) {
  const calls: MockCall[] = [];
  const businessSubscriptionUpdatesById: Record<string, Record<string, unknown>> = {};

  class QueryBuilder {
    private readonly filters: Record<string, unknown> = {};
    private updateValues: Record<string, unknown> | null = null;

    constructor(private readonly table: string) {}

    select() {
      calls.push({ table: this.table, operation: "select" });
      return this;
    }

    eq(column: string, value: unknown) {
      this.filters[column] = value;
      return this;
    }

    limit() {
      return this;
    }

    async maybeSingle() {
      calls.push({ table: this.table, operation: "maybeSingle" });

      if (this.table === "subscription_events") {
        if (scenario.eventLookupError) return { data: null, error: scenario.eventLookupError };
        const providerEventId = String(this.filters.provider_event_id ?? "");
        if (scenario.events && providerEventId in scenario.events) {
          return { data: scenario.events[providerEventId] ?? null, error: null };
        }
        if (providerEventId.endsWith(":closed")) {
          return { data: scenario.existingClosure ?? null, error: null };
        }
        if (providerEventId.endsWith(":scheduled") || providerEventId.endsWith(":provider-cancelled")) {
          return { data: { occurred_at: "2026-07-01T00:00:00.000Z", raw_payload: { requested_by: "user-1" } }, error: null };
        }
        return { data: null, error: null };
      }

      if (this.table === "business_subscriptions") {
        const requestedId = typeof this.filters.id === "string" ? this.filters.id : null;
        const base = scenario.subscriptions?.find((subscription) => subscription.id === requestedId) ?? scenario.subscriptions?.[0] ?? baseSubscription();
        const subscription = { ...base, ...(businessSubscriptionUpdatesById[String(base.id)] ?? {}) };
        return { data: subscription, error: null };
      }

      if (this.table === "businesses") {
        if (scenario.businessLookupError) return { data: null, error: scenario.businessLookupError };
        return { data: { owner_id: scenario.businessOwnerId === undefined ? "user-1" : scenario.businessOwnerId }, error: null };
      }

      throw new Error(`Unexpected maybeSingle for ${this.table}`);
    }

    async insert(values: unknown) {
      calls.push({ table: this.table, operation: "insert", values });
      const providerEventId = String((values as Record<string, unknown>)?.provider_event_id ?? "");
      return { data: null, error: scenario.insertErrors?.[providerEventId] ?? null };
    }

    update(values: unknown) {
      calls.push({ table: this.table, operation: "update", values });
      this.updateValues = values as Record<string, unknown>;
      return this;
    }

    then(resolve: (value: { data?: unknown; error: unknown | null }) => void) {
      if (this.table === "business_subscriptions" && this.filters.id) {
        if (!scenario.updateError && this.updateValues) {
          businessSubscriptionUpdatesById[String(this.filters.id)] = this.updateValues;
        }
        resolve({ data: null, error: scenario.updateError ?? null });
        return;
      }

      if (this.table === "subscription_events") {
        resolve({ data: scenario.scheduledRepairEvents ?? [], error: null });
        return;
      }

      if (this.table === "business_subscriptions") {
        const subscriptions = (scenario.subscriptions ?? [baseSubscription()]).map((subscription) => ({
          ...subscription,
          ...(businessSubscriptionUpdatesById[String(subscription.id)] ?? {}),
        }));
        const filteredSubscriptions = subscriptions.filter((subscription) => {
          if (this.filters.cancel_at_period_end !== undefined && subscription.cancel_at_period_end !== this.filters.cancel_at_period_end) return false;
          if (this.filters.cancel_reason !== undefined && subscription.cancel_reason !== this.filters.cancel_reason) return false;
          return true;
        });
        resolve({ data: filteredSubscriptions, error: null });
        return;
      }

      resolve({ data: null, error: null });
    }
  }

  return {
    calls,
    client: {
      auth: {
        admin: {
          async deleteUser(userId: string) {
            calls.push({ table: "auth.admin", operation: "deleteUser", values: userId });
            return { data: null, error: scenario.deleteUserError ?? null };
          },
        },
      },
      from(table: string) {
        calls.push({ table, operation: "from" });
        return new QueryBuilder(table);
      },
    },
  };
}

Deno.test("account closure skips cancellations before paid-through date", async () => {
  const mock = createMockSupabase({
    subscriptions: [baseSubscription({ period_end: "2026-08-02T00:00:00.000Z" })],
  });

  const summary = await processDueAccountClosures({
    supabaseAdmin: mock.client,
    now: () => fixedNow,
    logError: () => undefined,
  });

  assertEquals(summary.closed, 0);
  assertEquals(summary.skipped, 1);
  assertEquals(summary.results[0].status, "not_due");
  assertEquals(mock.calls.filter((call) => call.operation === "deleteUser"), []);
  assertEquals(mock.calls.filter((call) => call.operation === "update"), []);
});

Deno.test("account closure migration detaches preserved businesses when owner auth user is deleted", async () => {
  const migration = await Deno.readTextFile(accountClosureOwnerFkMigrationPath);

  assertMatch(migration, /ALTER\s+COLUMN\s+owner_id\s+DROP\s+NOT\s+NULL/i);
  assertMatch(migration, /FROM\s+pg_constraint/i);
  assertMatch(migration, /rel\.relname\s*=\s*'businesses'/i);
  assertMatch(migration, /ref_rel\.relname\s*=\s*'users'/i);
  assertMatch(migration, /attname\s*=\s*'owner_id'/i);
  assertMatch(migration, /FOREIGN\s+KEY\s*\(owner_id\)[\s\S]*REFERENCES\s+auth\.users\s*\(id\)[\s\S]*ON\s+DELETE\s+SET\s+NULL/i);
  assertStringIncludes(migration.toLowerCase(), "drop constraint");
  assertEquals(/DELETE\s+FROM\s+public\.businesses/i.test(migration), false);
});

Deno.test("account closure migration blocks public booking for closed preserved businesses", async () => {
  const migration = await Deno.readTextFile(accountClosurePublicBookingMigrationPath);

  assertMatch(migration, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+account_closed_at\s+timestamptz/i);
  assertMatch(migration, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\._assert_business_accepts_public_bookings/i);
  assertMatch(migration, /account_closed_at\s+IS\s+NOT\s+NULL[\s\S]*BUSINESS_ACCOUNT_CLOSED/i);
  assertMatch(migration, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_public_booking[\s\S]*_assert_business_accepts_public_bookings\(v_business_id\)/i);
  assertMatch(migration, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.query_public_slot_availability[\s\S]*_assert_business_accepts_public_bookings\(v_business_id\)/i);
  assertEquals(/DELETE\s+FROM\s+public\.businesses/i.test(migration), false);
});

Deno.test("account closure processes free local cancellation with null closure and paid-through dates immediately", async () => {
  const mock = createMockSupabase({
    subscriptions: [baseSubscription({
      provider: "local",
      plan_code: "free",
      provider_subscription_id: null,
      mp_preapproval_id: null,
      period_end: null,
      current_period_end: null,
      account_closure_at: null,
    })],
  });

  const summary = await processDueAccountClosures({
    supabaseAdmin: mock.client,
    now: () => fixedNow,
    logError: () => undefined,
  });
  const deleteCalls = mock.calls.filter((call) => call.operation === "deleteUser");

  assertEquals(summary.closed, 1);
  assertEquals(summary.skipped, 0);
  assertEquals(deleteCalls.length, 1);
  assertEquals(deleteCalls[0].values, "user-1");
});

Deno.test("account closure deletes due auth user, records audit, and updates subscription", async () => {
  const mock = createMockSupabase();

  const summary = await processDueAccountClosures({
    supabaseAdmin: mock.client,
    now: () => fixedNow,
    logError: () => undefined,
  });
  const deleteCalls = mock.calls.filter((call) => call.operation === "deleteUser");
  const insertCalls = mock.calls.filter((call) => call.table === "subscription_events" && call.operation === "insert");
  const updateCalls = mock.calls.filter((call) => call.table === "business_subscriptions" && call.operation === "update");
  const businessUpdateCalls = mock.calls.filter((call) => call.table === "businesses" && call.operation === "update");

  assertEquals(summary.closed, 1);
  assertEquals(deleteCalls.length, 1);
  assertEquals(deleteCalls[0].values, "user-1");
  assertEquals(insertCalls.length, 2);
  assertEquals((insertCalls[0].values as Record<string, unknown>).event_type, "account.cancellation_closure_started");
  assertEquals((insertCalls[1].values as Record<string, unknown>).event_type, "account.cancellation_closed");
  assertEquals((insertCalls[1].values as Record<string, unknown>).provider_event_id, "account-closure:business-1:subscription-1:closed");
  assertEquals(updateCalls.length, 1);
  assertEquals((updateCalls[0].values as Record<string, unknown>).status, "account_closed");
  assertEquals((updateCalls[0].values as Record<string, unknown>).cancel_at_period_end, false);
  assertEquals(businessUpdateCalls.length, 1);
  assertEquals((businessUpdateCalls[0].values as Record<string, unknown>).account_closed_at, fixedNow.toISOString());
  assertEquals((businessUpdateCalls[0].values as Record<string, unknown>).account_closure_reason, "account_cancellation_closed");
});

Deno.test("account closure fails safely when scheduled requester evidence is missing", async () => {
  const mock = createMockSupabase({
    events: {
      "account-cancel-request:business-1:subscription-1:scheduled": { occurred_at: "2026-07-01T00:00:00.000Z", raw_payload: null },
      "account-cancel-request:business-1:subscription-1:provider-cancelled": { occurred_at: "2026-07-01T00:00:00.000Z", raw_payload: { requested_by: "user-1" } },
    },
  });

  const summary = await processDueAccountClosures({
    supabaseAdmin: mock.client,
    now: () => fixedNow,
    logError: () => undefined,
  });
  const insertCalls = mock.calls.filter((call) => call.table === "subscription_events" && call.operation === "insert");

  assertEquals(summary.failed, 1);
  assertEquals(summary.results[0].reason, "requester_evidence_missing");
  assertEquals(mock.calls.filter((call) => call.operation === "deleteUser"), []);
  assertEquals(insertCalls.length, 1);
  assertEquals((insertCalls[0].values as Record<string, unknown>).event_type, "account.cancellation_closure_failed");
});

Deno.test("account closure is idempotent and repairs subscription state when closure audit already exists", async () => {
  const mock = createMockSupabase({ existingClosure: { occurred_at: "2026-08-01T00:00:00.000Z" } });

  const summary = await processDueAccountClosures({
    supabaseAdmin: mock.client,
    now: () => fixedNow,
    logError: () => undefined,
  });

  assertEquals(summary.closed, 0);
  assertEquals(summary.skipped, 1);
  assertEquals(summary.results[0].status, "already_closed");
  assertEquals(mock.calls.filter((call) => call.operation === "deleteUser"), []);
  const subscriptionUpdateCalls = mock.calls.filter((call) => call.table === "business_subscriptions" && call.operation === "update");
  const businessUpdateCalls = mock.calls.filter((call) => call.table === "businesses" && call.operation === "update");
  assertEquals(subscriptionUpdateCalls.length, 1);
  assertEquals((subscriptionUpdateCalls[0].values as Record<string, unknown>).status, "account_closed");
  assertEquals(businessUpdateCalls.length, 1);
  assertEquals((businessUpdateCalls[0].values as Record<string, unknown>).account_closed_at, "2026-08-01T00:00:00.000Z");
});

Deno.test("account closure handler rejects unauthorized requests without processing", async () => {
  let processed = false;
  const handler = createAccountClosureHandler({
    getSecret: () => "cron-secret",
    createSupabaseAdminClient: () => {
      processed = true;
      return createMockSupabase().client;
    },
    now: () => fixedNow,
    logError: () => undefined,
  });

  const response = await handler(new Request("https://example.test/account-closure", { method: "POST" }));
  const body = await response.json();

  assertEquals(response.status, 401);
  assertEquals(body.error, "UNAUTHORIZED");
  assertEquals(processed, false);
});

Deno.test("account closure handler accepts bearer secret and processes closures", async () => {
  const mock = createMockSupabase();
  const handler = createAccountClosureHandler({
    getSecret: () => "cron-secret",
    createSupabaseAdminClient: () => mock.client,
    now: () => fixedNow,
    logError: () => undefined,
  });

  const response = await handler(new Request("https://example.test/account-closure", {
    method: "POST",
    headers: { authorization: "Bearer cron-secret" },
  }));
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.closed, 1);
});

Deno.test("account closure handler accepts cron header secret and processes closures", async () => {
  const mock = createMockSupabase();
  const handler = createAccountClosureHandler({
    getSecret: () => "cron-secret",
    createSupabaseAdminClient: () => mock.client,
    now: () => fixedNow,
    logError: () => undefined,
  });

  const response = await handler(new Request("https://example.test/account-closure", {
    method: "POST",
    headers: { "x-cron-key": "cron-secret" },
  }));
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.closed, 1);
});

Deno.test("account closure handler returns redacted non-2xx when processing has failures", async () => {
  const mock = createMockSupabase({
    events: {
      "account-cancel-request:business-1:subscription-1:scheduled": null,
      "account-cancel-request:business-1:subscription-1:provider-cancelled": { occurred_at: "2026-07-01T00:00:00.000Z", raw_payload: { requested_by: "user-1" } },
    },
  });
  const handler = createAccountClosureHandler({
    getSecret: () => "cron-secret",
    createSupabaseAdminClient: () => mock.client,
    now: () => fixedNow,
    logError: () => undefined,
  });

  const response = await handler(new Request("https://example.test/account-closure", {
    method: "POST",
    headers: { authorization: "Bearer cron-secret" },
  }));
  const body = await response.json();

  assertEquals(response.status, 500);
  assertEquals(body.error, "ACCOUNT_CLOSURE_PROCESSING_FAILED");
  assertEquals(body.failed, 1);
  assertEquals("results" in body, false);
});

Deno.test("account closure refuses to delete without scheduled cancellation evidence", async () => {
  const mock = createMockSupabase({
    events: {
      "account-cancel-request:business-1:subscription-1:scheduled": null,
      "account-cancel-request:business-1:subscription-1:provider-cancelled": { occurred_at: "2026-07-01T00:00:00.000Z", raw_payload: { requested_by: "user-1" } },
    },
  });

  const summary = await processDueAccountClosures({
    supabaseAdmin: mock.client,
    now: () => fixedNow,
    logError: () => undefined,
  });
  const insertCalls = mock.calls.filter((call) => call.table === "subscription_events" && call.operation === "insert");

  assertEquals(summary.failed, 1);
  assertEquals(summary.results[0].reason, "scheduled_evidence_missing");
  assertEquals(mock.calls.filter((call) => call.operation === "deleteUser"), []);
  assertEquals((insertCalls[0].values as Record<string, unknown>).event_type, "account.cancellation_closure_failed");
});

Deno.test("account closure refuses provider-backed delete without provider cancelled evidence", async () => {
  const mock = createMockSupabase({
    events: {
      "account-cancel-request:business-1:subscription-1:scheduled": { occurred_at: "2026-07-01T00:00:00.000Z", raw_payload: { requested_by: "user-1" } },
      "account-cancel-request:business-1:subscription-1:provider-cancelled": null,
    },
  });

  const summary = await processDueAccountClosures({
    supabaseAdmin: mock.client,
    now: () => fixedNow,
    logError: () => undefined,
  });

  assertEquals(summary.failed, 1);
  assertEquals(summary.results[0].reason, "provider_cancelled_evidence_missing");
  assertEquals(mock.calls.filter((call) => call.operation === "deleteUser"), []);
});

Deno.test("account closure refuses paid Mercado Pago delete without provider evidence even when provider id is missing", async () => {
  const mock = createMockSupabase({
    subscriptions: [baseSubscription({ provider_subscription_id: null, mp_preapproval_id: null, plan_code: "pro" })],
    events: {
      "account-cancel-request:business-1:subscription-1:scheduled": { occurred_at: "2026-07-01T00:00:00.000Z", raw_payload: { requested_by: "user-1" } },
      "account-cancel-request:business-1:subscription-1:provider-cancelled": null,
    },
  });

  const summary = await processDueAccountClosures({
    supabaseAdmin: mock.client,
    now: () => fixedNow,
    logError: () => undefined,
  });

  assertEquals(summary.failed, 1);
  assertEquals(summary.results[0].reason, "provider_cancelled_evidence_missing");
  assertEquals(mock.calls.filter((call) => call.operation === "deleteUser"), []);
});

Deno.test("account closure refuses Mercado Pago trial delete without provider evidence", async () => {
  const mock = createMockSupabase({
    subscriptions: [baseSubscription({ status: "trialing", plan_code: "trial", provider_subscription_id: "mp-subscription-1" })],
    events: {
      "account-cancel-request:business-1:subscription-1:scheduled": { occurred_at: "2026-07-01T00:00:00.000Z", raw_payload: { requested_by: "user-1" } },
      "account-cancel-request:business-1:subscription-1:provider-cancelled": null,
    },
  });

  const summary = await processDueAccountClosures({
    supabaseAdmin: mock.client,
    now: () => fixedNow,
    logError: () => undefined,
  });

  assertEquals(summary.failed, 1);
  assertEquals(summary.results[0].reason, "provider_cancelled_evidence_missing");
  assertEquals(mock.calls.filter((call) => call.operation === "deleteUser"), []);
});

Deno.test("account closure allows local/free closure with scheduled evidence but no provider evidence", async () => {
  const mock = createMockSupabase({
    subscriptions: [baseSubscription({ provider: "local", provider_subscription_id: null, plan_code: "free" })],
    events: {
      "account-cancel-request:business-1:subscription-1:scheduled": { occurred_at: "2026-07-01T00:00:00.000Z", raw_payload: { requested_by: "user-1" } },
      "account-cancel-request:business-1:subscription-1:provider-cancelled": null,
    },
  });

  const summary = await processDueAccountClosures({
    supabaseAdmin: mock.client,
    now: () => fixedNow,
    logError: () => undefined,
  });

  assertEquals(summary.closed, 1);
  assertEquals(mock.calls.filter((call) => call.operation === "deleteUser").length, 1);
});

Deno.test("account closure records retryable failure if subscription update fails after auth delete", async () => {
  const mock = createMockSupabase({ updateError: { message: "update failed" } });

  const summary = await processDueAccountClosures({
    supabaseAdmin: mock.client,
    now: () => fixedNow,
    logError: () => undefined,
  });
  const insertCalls = mock.calls.filter((call) => call.table === "subscription_events" && call.operation === "insert");

  assertEquals(summary.failed, 1);
  assertEquals(summary.results[0].reason, "subscription_update_failed");
  assertEquals(mock.calls.filter((call) => call.operation === "deleteUser").length, 1);
  assertEquals((insertCalls.at(-1)!.values as Record<string, unknown>).event_type, "account.cancellation_closure_failed");
});

Deno.test("account closure repairs closed state when retry sees auth user already deleted after closure start", async () => {
  const firstAttempt = createMockSupabase({
    insertErrors: {
      "account-closure:business-1:subscription-1:closed": { message: "closed audit failed" },
    },
  });

  const firstSummary = await processDueAccountClosures({
    supabaseAdmin: firstAttempt.client,
    now: () => fixedNow,
    logError: () => undefined,
  });

  assertEquals(firstSummary.failed, 1);
  assertEquals(firstSummary.results[0].reason, "closure_audit_failed");
  assertEquals(firstAttempt.calls.filter((call) => call.operation === "deleteUser").length, 1);

  const retry = createMockSupabase({
    deleteUserError: { status: 404, message: "User not found" },
    events: {
      "account-closure:business-1:subscription-1:started": {
        occurred_at: "2026-08-01T00:00:00.000Z",
        raw_payload: { owner_id: "user-1" },
      },
      "account-cancel-request:business-1:subscription-1:scheduled": {
        occurred_at: "2026-07-01T00:00:00.000Z",
        raw_payload: { requested_by: "user-1" },
      },
      "account-cancel-request:business-1:subscription-1:provider-cancelled": {
        occurred_at: "2026-07-01T00:00:00.000Z",
        raw_payload: { requested_by: "user-1" },
      },
    },
  });

  const retrySummary = await processDueAccountClosures({
    supabaseAdmin: retry.client,
    now: () => fixedNow,
    logError: () => undefined,
  });
  const retryInserts = retry.calls.filter((call) => call.table === "subscription_events" && call.operation === "insert");
  const retryUpdates = retry.calls.filter((call) => call.table === "business_subscriptions" && call.operation === "update");

  assertEquals(retrySummary.closed, 1);
  assertEquals(retrySummary.failed, 0);
  assertEquals(retry.calls.filter((call) => call.operation === "deleteUser").length, 1);
  assertEquals((retryInserts[0].values as Record<string, unknown>).event_type, "account.cancellation_closed");
  assertEquals(retryUpdates.length, 1);
  assertEquals((retryUpdates[0].values as Record<string, unknown>).status, "account_closed");
});

Deno.test("account closure repairs scheduled subscriptions whose local flags failed after scheduled audit", async () => {
  const mock = createMockSupabase({
    subscriptions: [baseSubscription({
      cancel_at_period_end: false,
      cancel_reason: null,
      cancelled_at: null,
    })],
    scheduledRepairEvents: [{
      subscription_id: "subscription-1",
      occurred_at: "2026-07-04T12:00:00.000Z",
    }],
  });

  const summary = await processDueAccountClosures({
    supabaseAdmin: mock.client,
    now: () => fixedNow,
    logError: () => undefined,
  });
  const updateCalls = mock.calls.filter((call) => call.table === "business_subscriptions" && call.operation === "update");
  const deleteCalls = mock.calls.filter((call) => call.operation === "deleteUser");

  assertEquals(summary.closed, 1);
  assertEquals(updateCalls.length, 2);
  assertEquals((updateCalls[0].values as Record<string, unknown>).cancel_at_period_end, true);
  assertEquals((updateCalls[0].values as Record<string, unknown>).cancel_reason, "account_cancellation_requested");
  assertEquals((updateCalls[0].values as Record<string, unknown>).cancelled_at, "2026-07-04T12:00:00.000Z");
  assertEquals(deleteCalls.length, 1);
});

Deno.test("account closure skips already closed historical scheduled rows during repair and continues processing other due closures", async () => {
  const mock = createMockSupabase({
    subscriptions: [
      baseSubscription({
        id: "closed-subscription",
        business_id: "closed-business",
        status: "account_closed",
        cancel_at_period_end: false,
        cancel_reason: "account_closed",
        cancelled_at: "2026-07-15T00:00:00.000Z",
      }),
      baseSubscription({
        id: "subscription-1",
        business_id: "business-1",
        cancelled_at: "2026-07-04T12:00:00.000Z",
      }),
    ],
    scheduledRepairEvents: [
      {
        subscription_id: "closed-subscription",
        occurred_at: "2026-07-04T12:00:00.000Z",
      },
      {
        subscription_id: "subscription-1",
        occurred_at: "2026-07-04T12:00:00.000Z",
      },
    ],
  });

  const summary = await processDueAccountClosures({
    supabaseAdmin: mock.client,
    now: () => fixedNow,
    logError: () => undefined,
  });
  const repairUpdates = mock.calls.filter((call) =>
    call.table === "business_subscriptions" &&
    call.operation === "update" &&
    (call.values as Record<string, unknown>).cancel_reason === "account_cancellation_requested"
  );
  const deleteCalls = mock.calls.filter((call) => call.operation === "deleteUser");

  assertEquals(summary.closed, 1);
  assertEquals(summary.failed, 0);
  assertEquals(repairUpdates.length, 0);
  assertEquals(deleteCalls.length, 1);
  assertEquals(deleteCalls[0].values, "user-1");
});

Deno.test("account closure deletes bound requester instead of current business owner", async () => {
  const mock = createMockSupabase({ businessOwnerId: "current-owner-should-not-delete" });

  const summary = await processDueAccountClosures({
    supabaseAdmin: mock.client,
    now: () => fixedNow,
    logError: () => undefined,
  });
  const deleteCalls = mock.calls.filter((call) => call.operation === "deleteUser");

  assertEquals(summary.closed, 1);
  assertEquals(deleteCalls.length, 1);
  assertEquals(deleteCalls[0].values, "user-1");
});

Deno.test("account closure fails safely when closure_started owner differs from requester evidence", async () => {
  const mock = createMockSupabase({
    businessOwnerId: "current-owner-should-not-delete",
    events: {
      "account-closure:business-1:subscription-1:started": {
        occurred_at: "2026-08-01T00:00:00.000Z",
        raw_payload: { owner_id: "bound-user-from-started" },
      },
      "account-cancel-request:business-1:subscription-1:scheduled": {
        occurred_at: "2026-07-01T00:00:00.000Z",
        raw_payload: { requested_by: "user-1" },
      },
      "account-cancel-request:business-1:subscription-1:provider-cancelled": {
        occurred_at: "2026-07-01T00:00:00.000Z",
        raw_payload: { requested_by: "user-1" },
      },
    },
  });

  const summary = await processDueAccountClosures({
    supabaseAdmin: mock.client,
    now: () => fixedNow,
    logError: () => undefined,
  });
  const deleteCalls = mock.calls.filter((call) => call.operation === "deleteUser");
  const startedInsertCalls = mock.calls.filter((call) =>
    call.table === "subscription_events" &&
    call.operation === "insert" &&
    (call.values as Record<string, unknown>).event_type === "account.cancellation_closure_started"
  );

  assertEquals(summary.failed, 1);
  assertEquals(summary.results[0].reason, "closure_started_owner_mismatch");
  assertEquals(deleteCalls.length, 0);
  assertEquals(startedInsertCalls.length, 0);
});
