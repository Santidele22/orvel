import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createCancelSubscriptionHandler } from "../cancel-subscription/index.ts";

const fixedNow = new Date("2026-07-04T12:00:00.000Z");

type MockCall = {
  table: string;
  operation: string;
  values?: unknown;
};

type MockScenario = {
  existingEvent?: { occurred_at: string } | null;
  existingEventsByProviderEventId?: Record<
    string,
    { occurred_at: string } | null
  >;
  existingEventsAfterDuplicateInsertByProviderEventId?: Record<
    string,
    { occurred_at: string } | null
  >;
  existingEventLookupErrorsByProviderEventId?: Record<
    string,
    { code?: string; message?: string } | null
  >;
  duplicateEvent?: { occurred_at: string } | null;
  insertError?: { code?: string; message?: string } | null;
  insertErrorsByProviderEventId?: Record<
    string,
    { code?: string; message?: string } | null
  >;
  updateError?: { code?: string; message?: string } | null;
  persistedSubscriptionAfterUpdate?: Record<string, unknown> | null;
  persistedSubscriptionAfterUpdateError?:
    | { code?: string; message?: string }
    | null;
  existingEventLookupError?: { code?: string; message?: string } | null;
  subscriptionError?: { code?: string; message?: string } | null;
  subscription?: Record<string, unknown>;
  noSubscription?: boolean;
};

function baseSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "subscription-1",
    business_id: "business-1",
    tenant_id: "tenant-1",
    status: "active",
    plan_code: "pro",
    provider_subscription_id: "mp-subscription-1",
    mp_preapproval_id: "mp-preapproval-1",
    period_end: "2026-08-01T00:00:00.000Z",
    version: 3,
    ...overrides,
  };
}

function createMockSupabase(scenario: MockScenario = {}) {
  const calls: MockCall[] = [];
  let subscriptionEventsMaybeSingleCalls = 0;
  let businessSubscriptionsSingleCalls = 0;
  let pendingUpdateResult:
    | { error: { code?: string; message?: string } | null }
    | null = null;
  let lastBusinessSubscriptionUpdate: Record<string, unknown> | null = null;
  const duplicateInsertedProviderEventIds = new Set<string>();

  class QueryBuilder {
    private readonly filters: Record<string, unknown> = {};

    constructor(private readonly table: string) {}

    select() {
      calls.push({ table: this.table, operation: "select" });
      return this;
    }

    eq(column: string, value: unknown) {
      this.filters[column] = value;
      return this;
    }

    in() {
      return this;
    }

    order() {
      return this;
    }

    limit() {
      return this;
    }

    async single() {
      calls.push({ table: this.table, operation: "single" });

      if (this.table === "businesses") {
        return {
          data: { id: "business-1", name: "Orvel Test", owner_id: "user-1" },
          error: null,
        };
      }

      if (this.table === "business_subscriptions") {
        businessSubscriptionsSingleCalls += 1;

        if (businessSubscriptionsSingleCalls > 1) {
          if (scenario.persistedSubscriptionAfterUpdateError) {
            return {
              data: null,
              error: scenario.persistedSubscriptionAfterUpdateError,
            };
          }

          if (scenario.persistedSubscriptionAfterUpdate === null) {
            return {
              data: null,
              error: { code: "PGRST116", message: "No rows" },
            };
          }

          return {
            data: scenario.persistedSubscriptionAfterUpdate ?? {
              ...(scenario.subscription ?? baseSubscription()),
              ...(lastBusinessSubscriptionUpdate ?? {}),
            },
            error: null,
          };
        }

        if (scenario.subscriptionError) {
          return { data: null, error: scenario.subscriptionError };
        }

        if (scenario.noSubscription) {
          return {
            data: null,
            error: { code: "PGRST116", message: "No rows" },
          };
        }

        return {
          data: scenario.subscription ?? baseSubscription(),
          error: null,
        };
      }

      throw new Error(`Unexpected single() for ${this.table}`);
    }

    async maybeSingle() {
      calls.push({ table: this.table, operation: "maybeSingle" });

      if (this.table !== "subscription_events") {
        throw new Error(`Unexpected maybeSingle() for ${this.table}`);
      }

      subscriptionEventsMaybeSingleCalls += 1;
      const providerEventId = String(this.filters.provider_event_id ?? "");

      if (
        scenario.existingEventLookupErrorsByProviderEventId &&
        providerEventId in scenario.existingEventLookupErrorsByProviderEventId
      ) {
        return {
          data: null,
          error: scenario
            .existingEventLookupErrorsByProviderEventId[providerEventId],
        };
      }

      if (
        scenario.existingEventsByProviderEventId &&
        providerEventId in scenario.existingEventsByProviderEventId
      ) {
        return {
          data: scenario.existingEventsByProviderEventId[providerEventId] ??
            null,
          error: null,
        };
      }

      if (
        duplicateInsertedProviderEventIds.has(providerEventId) &&
        scenario.existingEventsAfterDuplicateInsertByProviderEventId &&
        providerEventId in
          scenario.existingEventsAfterDuplicateInsertByProviderEventId
      ) {
        return {
          data: scenario
            .existingEventsAfterDuplicateInsertByProviderEventId[
              providerEventId
            ] ?? null,
          error: null,
        };
      }

      if (subscriptionEventsMaybeSingleCalls === 1) {
        if (scenario.existingEventLookupError) {
          return { data: null, error: scenario.existingEventLookupError };
        }

        return { data: scenario.existingEvent ?? null, error: null };
      }

      return { data: scenario.duplicateEvent ?? null, error: null };
    }

    async insert(values: unknown) {
      calls.push({ table: this.table, operation: "insert", values });
      const providerEventId = String(
        (values as Record<string, unknown>)?.provider_event_id ?? "",
      );
      const error = scenario.insertErrorsByProviderEventId?.[providerEventId] ??
        scenario.insertError ?? null;
      if (error?.code === "23505") {
        duplicateInsertedProviderEventIds.add(providerEventId);
      }
      return {
        data: null,
        error,
      };
    }

    update(values: unknown) {
      calls.push({ table: this.table, operation: "update", values });
      if (this.table === "business_subscriptions") {
        lastBusinessSubscriptionUpdate = values as Record<string, unknown>;
      }
      pendingUpdateResult = { error: scenario.updateError ?? null };
      return this;
    }

    then(
      resolve: (
        value: { error: { code?: string; message?: string } | null },
      ) => void,
    ) {
      resolve(pendingUpdateResult ?? { error: null });
    }
  }

  return {
    calls,
    client: {
      auth: {
        async getUser(token: string) {
          calls.push({ table: "auth", operation: "getUser", values: token });
          return { data: { user: { id: "user-1" } }, error: null };
        },
      },
      from(table: string) {
        calls.push({ table, operation: "from" });
        return new QueryBuilder(table);
      },
    },
  };
}

function createRequest(
  body: Record<string, unknown> = { business_id: "business-1" },
) {
  return new Request("http://localhost/functions/v1/cancel-subscription", {
    method: "POST",
    headers: {
      Authorization: "Bearer valid-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function createTestHandler(
  client: unknown,
  options: {
    fetch?: typeof fetch;
    envGet?: (key: string) => string | undefined;
    now?: () => Date;
    mpCancelAttemptTimeoutMs?: number;
  } = {},
) {
  return createCancelSubscriptionHandler({
    createSupabaseAdminClient: () => client,
    getCorsHeaders: () => ({}),
    rejectDisallowedOrigin: () => null,
    isRateLimitedRequest: () => false,
    fetch: options.fetch,
    sleep: () => Promise.resolve(),
    mpCancelAttemptTimeoutMs: options.mpCancelAttemptTimeoutMs,
    envGet: options.envGet,
    now: options.now ?? (() => fixedNow),
    logError: () => undefined,
  });
}

async function readJson(response: Response) {
  return await response.json() as Record<string, unknown>;
}

function assertBusinessSubscriptionStatusWasNotMutated(calls: MockCall[]) {
  assertEquals(
    calls.filter((call) =>
      call.table === "business_subscriptions" && call.operation === "update"
    ),
    [],
  );
}

function assertBusinessSubscriptionWasNotTerminallyCanceled(calls: MockCall[]) {
  const updates = calls.filter((call) =>
    call.table === "business_subscriptions" && call.operation === "update"
  );

  for (const update of updates) {
    const values = update.values as Record<string, unknown>;
    assertEquals(values.status, undefined);
  }
}

function assertBusinessSubscriptionCancellationFieldsWereNotMutated(
  calls: MockCall[],
) {
  const updates = calls.filter((call) =>
    call.table === "business_subscriptions" && call.operation === "update"
  );

  for (const update of updates) {
    const values = update.values as Record<string, unknown>;
    assertEquals(values.cancel_at_period_end, undefined);
    assertEquals(values.cancel_reason, undefined);
    assertEquals(values.cancelled_at, undefined);
  }
}

Deno.test("cancel-subscription records authenticated owner manual cancellation requests", async () => {
  const mock = createMockSupabase();
  const response = await createTestHandler(mock.client)(
    createRequest({ business_id: "business-1", reason: "manual_request" }),
  );
  const body = await readJson(response);
  const insertCalls = mock.calls.filter((call) =>
    call.table === "subscription_events" && call.operation === "insert"
  );
  const insertCall = insertCalls[0];

  assertEquals(response.status, 200);
  assertEquals(body.success, true);
  assertEquals(
    (body.request as Record<string, unknown>).status,
    "manual_review",
  );
  assertStringIncludes(String(body.message), "procesar manualmente");
  assertEquals((body.subscription as Record<string, unknown>).status, "active");
  assertEquals(
    (body.subscription as Record<string, unknown>).provider_subscription_id,
    "mp-subscription-1",
  );
  assert(insertCall);
  assertEquals(
    (insertCall.values as Record<string, unknown>).event_type,
    "subscription.cancellation_requested",
  );
  assertEquals(
    (insertCall.values as Record<string, unknown>).provider,
    "orvel_manual",
  );
  assertEquals(
    (insertCall.values as Record<string, unknown>).provider_event_id,
    "manual-cancel-request:subscription-1",
  );
  assertEquals(
    (insertCall.values as Record<string, unknown>).provider_subscription_id,
    "mp-subscription-1",
  );
  assertEquals(
    (insertCall.values as Record<string, unknown>).previous_status,
    "active",
  );
  assertEquals(
    (insertCall.values as Record<string, unknown>).next_status,
    "active",
  );
  assertBusinessSubscriptionStatusWasNotMutated(mock.calls);
});

Deno.test("cancel-subscription returns idempotent success for preexisting cancellation request events", async () => {
  const mock = createMockSupabase({
    existingEvent: { occurred_at: "2026-07-01T10:00:00.000Z" },
  });
  const response = await createTestHandler(mock.client)(createRequest());
  const body = await readJson(response);

  assertEquals(response.status, 200);
  assertEquals(body.success, true);
  assertEquals(
    (body.request as Record<string, unknown>).status,
    "already_requested",
  );
  assertEquals(
    (body.request as Record<string, unknown>).requested_at,
    "2026-07-01T10:00:00.000Z",
  );
  assertEquals("account_closure_at" in body, false);
  assertEquals(
    (body.subscription as Record<string, unknown>).provider_subscription_id,
    "mp-subscription-1",
  );
  assertEquals(
    mock.calls.filter((call) =>
      call.table === "subscription_events" && call.operation === "insert"
    ),
    [],
  );
  assertBusinessSubscriptionStatusWasNotMutated(mock.calls);
});

Deno.test("cancel-subscription returns idempotent success when event insert races a duplicate", async () => {
  const mock = createMockSupabase({
    insertError: {
      code: "23505",
      message: "duplicate key value violates unique constraint",
    },
    duplicateEvent: { occurred_at: "2026-07-02T10:00:00.000Z" },
  });
  const response = await createTestHandler(mock.client)(createRequest());
  const body = await readJson(response);

  assertEquals(response.status, 200);
  assertEquals(body.success, true);
  assertEquals(
    (body.request as Record<string, unknown>).status,
    "already_requested",
  );
  assertEquals(
    (body.request as Record<string, unknown>).requested_at,
    "2026-07-02T10:00:00.000Z",
  );
  assertBusinessSubscriptionStatusWasNotMutated(mock.calls);
});

Deno.test("cancel-subscription persists null provider_subscription_id when no provider id exists", async () => {
  const mock = createMockSupabase({
    subscription: baseSubscription({
      provider_subscription_id: null,
      mp_preapproval_id: null,
    }),
  });
  const response = await createTestHandler(mock.client)(createRequest());
  const body = await readJson(response);
  const insertCalls = mock.calls.filter((call) =>
    call.table === "subscription_events" && call.operation === "insert"
  );
  const insertCall = insertCalls[0];

  assertEquals(response.status, 200);
  assertEquals(body.success, true);
  assert(insertCall);
  assertEquals(
    (insertCall.values as Record<string, unknown>).provider_subscription_id,
    null,
  );
  assertEquals(
    "provider_subscription_id" in
      (body.subscription as Record<string, unknown>),
    true,
  );
  assertEquals(
    (body.subscription as Record<string, unknown>).provider_subscription_id,
    null,
  );
  assertBusinessSubscriptionStatusWasNotMutated(mock.calls);
});

Deno.test("cancel-subscription rejects invalid mode instead of falling back to manual cancellation", async () => {
  const mock = createMockSupabase();
  const response = await createTestHandler(mock.client)(
    createRequest({ business_id: "business-1", mode: "unsupported_mode" }),
  );
  const body = await readJson(response);

  assertEquals(response.status, 400);
  assertEquals(body.error, "INVALID_MODE");
  assertEquals(
    mock.calls.filter((call) =>
      call.table === "businesses" || call.table === "business_subscriptions"
    ),
    [],
  );
});

Deno.test("account cancellation fails closed when scheduled event lookup errors before provider call", async () => {
  const mock = createMockSupabase({
    existingEventLookupError: { code: "XX000", message: "lookup failed" },
  });
  let fetchCalls = 0;
  const response = await createTestHandler(mock.client, {
    envGet: (key) => key === "MP_ACCESS_TOKEN" ? "test-token" : undefined,
    fetch: (() => {
      fetchCalls += 1;
      return Promise.resolve(
        new Response(
          JSON.stringify({ id: "mp-subscription-1", status: "cancelled" }),
        ),
      );
    }) as typeof fetch,
  })(
    createRequest({ business_id: "business-1", mode: "account_cancellation" }),
  );
  const body = await readJson(response);

  assertEquals(response.status, 500);
  assertEquals(body.error, "ACCOUNT_CANCELLATION_STATE_LOOKUP_FAILED");
  assertEquals(fetchCalls, 0);
  assertEquals(
    mock.calls.filter((call) =>
      call.table === "subscription_events" && call.operation === "insert"
    ),
    [],
  );
  assertBusinessSubscriptionStatusWasNotMutated(mock.calls);
});

Deno.test("account cancellation duplicate recent requested insert returns in-progress without provider call", async () => {
  const mock = createMockSupabase({
    insertError: {
      code: "23505",
      message: "duplicate key value violates unique constraint",
    },
    existingEventsAfterDuplicateInsertByProviderEventId: {
      "account-cancel-request:business-1:subscription-1:requested": {
        occurred_at: "2026-07-04T12:06:00.000Z",
      },
    },
  });
  const response = await createTestHandler(mock.client)(
    createRequest({ business_id: "business-1", mode: "account_cancellation" }),
  );
  const body = await readJson(response);

  assertEquals(response.status, 409);
  assertEquals(body.error, "ACCOUNT_CANCELLATION_IN_PROGRESS");
  assertEquals(
    (body.request as Record<string, unknown>).requested_at,
    "2026-07-04T12:06:00.000Z",
  );
  assertBusinessSubscriptionStatusWasNotMutated(mock.calls);
});

Deno.test("account cancellation schedules locally without any provider fetch", async () => {
  const mock = createMockSupabase({
    existingEventsByProviderEventId: {
      "account-cancel-request:business-1:subscription-1:requested": {
        occurred_at: "2026-07-04T12:03:00.000Z",
      },
    },
  });
  const response = await createTestHandler(mock.client)(
    createRequest({ business_id: "business-1", mode: "account_cancellation" }),
  );
  const body = await readJson(response);
  const insertCalls = mock.calls.filter((call) =>
    call.table === "subscription_events" && call.operation === "insert"
  );

  assertEquals(response.status, 200);
  assertEquals(body.success, true);
  assertEquals(insertCalls.length, 1);
  assertEquals(
    (insertCalls[0].values as Record<string, unknown>).event_type,
    "account.cancellation_scheduled",
  );
  assertBusinessSubscriptionWasNotTerminallyCanceled(mock.calls);
});

Deno.test("account cancellation idempotent retry repairs local cancellation fields after scheduled event exists", async () => {
  const mock = createMockSupabase({
    existingEventsByProviderEventId: {
      "account-cancel-request:business-1:subscription-1:scheduled": {
        occurred_at: "2026-07-04T12:05:00.000Z",
      },
    },
    subscription: baseSubscription({
      cancel_at_period_end: false,
      cancel_reason: null,
      cancelled_at: null,
    }),
  });
  const response = await createTestHandler(mock.client)(
    createRequest({ business_id: "business-1", mode: "account_cancellation" }),
  );
  const body = await readJson(response);
  const updateCall = mock.calls.find((call) =>
    call.table === "business_subscriptions" && call.operation === "update"
  );

  assertEquals(response.status, 200);
  assertEquals(body.success, true);
  assertEquals(
    (body.request as Record<string, unknown>).status,
    "already_requested",
  );
  assertEquals(
    (body.request as Record<string, unknown>).requested_at,
    "2026-07-04T12:05:00.000Z",
  );
  assertEquals(
    mock.calls.filter((call) =>
      call.table === "subscription_events" && call.operation === "insert"
    ),
    [],
  );
  assert(updateCall);
  assertEquals(
    (updateCall.values as Record<string, unknown>).cancel_at_period_end,
    true,
  );
  assertEquals(
    (updateCall.values as Record<string, unknown>).cancel_reason,
    "account_cancellation_requested",
  );
  assertEquals(
    (updateCall.values as Record<string, unknown>).cancelled_at,
    "2026-07-04T12:05:00.000Z",
  );
  assertBusinessSubscriptionWasNotTerminallyCanceled(mock.calls);
});

Deno.test("account cancellation state verification accepts equivalent timestamptz serialization", async () => {
  const mock = createMockSupabase({
    persistedSubscriptionAfterUpdate: {
      cancel_at_period_end: true,
      cancel_reason: "account_cancellation_requested",
      cancelled_at: "2026-07-04 12:00:00+00",
    },
  });
  const response = await createTestHandler(mock.client)(
    createRequest({ business_id: "business-1", mode: "account_cancellation" }),
  );
  const body = await readJson(response);

  assertEquals(response.status, 200);
  assertEquals(body.success, true);
  assertEquals(
    (body.request as Record<string, unknown>).status,
    "scheduled_account_closure",
  );
});

Deno.test("account cancellation idempotent retry fails closed when local repair fails", async () => {
  const mock = createMockSupabase({
    existingEventsByProviderEventId: {
      "account-cancel-request:business-1:subscription-1:scheduled": {
        occurred_at: "2026-07-04T12:05:00.000Z",
      },
    },
    updateError: { code: "XX000", message: "repair failed" },
    subscription: baseSubscription({
      cancel_at_period_end: false,
      cancel_reason: null,
      cancelled_at: null,
    }),
  });
  const response = await createTestHandler(mock.client)(
    createRequest({ business_id: "business-1", mode: "account_cancellation" }),
  );
  const body = await readJson(response);

  assertEquals(response.status, 500);
  assertEquals(body.error, "ACCOUNT_CANCELLATION_STATE_FAILED");
  assertEquals(body.success, undefined);
  assertEquals(
    mock.calls.filter((call) =>
      call.table === "subscription_events" && call.operation === "insert"
    ),
    [],
  );
  assertBusinessSubscriptionWasNotTerminallyCanceled(mock.calls);
});

Deno.test("account cancellation idempotent retry fails closed when repair persistence is not verified", async () => {
  const mock = createMockSupabase({
    existingEventsByProviderEventId: {
      "account-cancel-request:business-1:subscription-1:scheduled": {
        occurred_at: "2026-07-04T12:05:00.000Z",
      },
    },
    persistedSubscriptionAfterUpdate: baseSubscription({
      cancel_at_period_end: false,
      cancel_reason: null,
      cancelled_at: null,
    }),
    subscription: baseSubscription({
      cancel_at_period_end: false,
      cancel_reason: null,
      cancelled_at: null,
    }),
  });
  const response = await createTestHandler(mock.client)(
    createRequest({ business_id: "business-1", mode: "account_cancellation" }),
  );
  const body = await readJson(response);

  assertEquals(response.status, 500);
  assertEquals(body.error, "ACCOUNT_CANCELLATION_STATE_FAILED");
  assertEquals(body.success, undefined);
  assertBusinessSubscriptionWasNotTerminallyCanceled(mock.calls);
});

Deno.test("account cancellation with paid subscription missing paid-through date fails validation without scheduling", async () => {
  const mock = createMockSupabase({
    subscription: baseSubscription({
      period_end: null,
      current_period_end: null,
    }),
  });
  const response = await createTestHandler(mock.client)(
    createRequest({ business_id: "business-1", mode: "account_cancellation" }),
  );
  const body = await readJson(response);
  const insertCalls = mock.calls.filter((call) =>
    call.table === "subscription_events" && call.operation === "insert"
  );

  assertEquals(response.status, 500);
  assertEquals(body.error, "ACCOUNT_CANCELLATION_PAID_THROUGH_MISSING");
  assertEquals(insertCalls.length, 1);
  assertEquals(
    (insertCalls[0].values as Record<string, unknown>).event_type,
    "account.cancellation_validation_failed",
  );
  assertEquals(
    (insertCalls[0].values as Record<string, unknown>).transition_action,
    "ACCOUNT_CANCELLATION_VALIDATION_FAILED",
  );
  assertBusinessSubscriptionStatusWasNotMutated(mock.calls);
});

Deno.test("account cancellation with pending subscription missing paid-through date fails validation without scheduling", async () => {
  const mock = createMockSupabase({
    subscription: baseSubscription({
      status: "pending",
      period_end: null,
      current_period_end: null,
    }),
  });
  const response = await createTestHandler(mock.client)(
    createRequest({ business_id: "business-1", mode: "account_cancellation" }),
  );
  const body = await readJson(response);
  const insertCalls = mock.calls.filter((call) =>
    call.table === "subscription_events" && call.operation === "insert"
  );

  assertEquals(response.status, 500);
  assertEquals(body.error, "ACCOUNT_CANCELLATION_PAID_THROUGH_MISSING");
  assertEquals(insertCalls.length, 1);
  assertEquals(
    (insertCalls[0].values as Record<string, unknown>).event_type,
    "account.cancellation_validation_failed",
  );
  assertBusinessSubscriptionStatusWasNotMutated(mock.calls);
});

Deno.test("account cancellation with paid non-Mercado Pago subscription missing paid-through date fails validation", async () => {
  const mock = createMockSupabase({
    subscription: baseSubscription({
      provider: "local",
      provider_subscription_id: "local-provider-subscription-1",
      mp_preapproval_id: null,
      period_end: null,
      current_period_end: null,
    }),
  });
  let fetchCalls = 0;
  const response = await createTestHandler(mock.client, {
    envGet: () => undefined,
    fetch: (() => {
      fetchCalls += 1;
      throw new Error(
        "Mercado Pago should not be called for non-Mercado Pago subscriptions",
      );
    }) as typeof fetch,
  })(
    createRequest({ business_id: "business-1", mode: "account_cancellation" }),
  );
  const body = await readJson(response);
  const insertCalls = mock.calls.filter((call) =>
    call.table === "subscription_events" && call.operation === "insert"
  );

  assertEquals(response.status, 500);
  assertEquals(body.error, "ACCOUNT_CANCELLATION_PAID_THROUGH_MISSING");
  assertEquals(fetchCalls, 0);
  assertEquals(insertCalls.length, 1);
  assertEquals(
    (insertCalls[0].values as Record<string, unknown>).event_type,
    "account.cancellation_validation_failed",
  );
  assertBusinessSubscriptionStatusWasNotMutated(mock.calls);
});

Deno.test("account cancellation retry after validation failure can proceed after data repair", async () => {
  const mock = createMockSupabase({
    existingEventsByProviderEventId: {
      "account-cancel-request:business-1:subscription-1:validation-failed": {
        occurred_at: "2026-07-04T11:50:00.000Z",
      },
    },
  });
  const response = await createTestHandler(mock.client)(
    createRequest({ business_id: "business-1", mode: "account_cancellation" }),
  );
  const body = await readJson(response);
  const insertCalls = mock.calls.filter((call) =>
    call.table === "subscription_events" && call.operation === "insert"
  );

  assertEquals(response.status, 200);
  assertEquals(
    (body.request as Record<string, unknown>).status,
    "scheduled_account_closure",
  );
  assertEquals(insertCalls.length, 2);
  assertEquals(
    (insertCalls[0].values as Record<string, unknown>).event_type,
    "account.cancellation_requested",
  );
  assertEquals(
    (insertCalls[1].values as Record<string, unknown>).event_type,
    "account.cancellation_scheduled",
  );
  assertBusinessSubscriptionWasNotTerminallyCanceled(mock.calls);
});

Deno.test("account cancellation for free local subscription without provider id schedules without Mercado Pago", async () => {
  const mock = createMockSupabase({
    subscription: baseSubscription({
      plan_code: "free",
      provider_subscription_id: null,
      mp_preapproval_id: null,
    }),
  });
  let fetchCalls = 0;
  const response = await createTestHandler(mock.client, {
    envGet: () => undefined,
    fetch: (() => {
      fetchCalls += 1;
      throw new Error(
        "Mercado Pago should not be called without a provider subscription id",
      );
    }) as typeof fetch,
  })(
    createRequest({ business_id: "business-1", mode: "account_cancellation" }),
  );
  const body = await readJson(response);
  const insertCalls = mock.calls.filter((call) =>
    call.table === "subscription_events" && call.operation === "insert"
  );

  assertEquals(response.status, 200);
  assertEquals(
    (body.request as Record<string, unknown>).status,
    "scheduled_account_closure",
  );
  assertEquals(fetchCalls, 0);
  assertEquals(insertCalls.length, 2);
  assertEquals(
    (insertCalls[0].values as Record<string, unknown>).event_type,
    "account.cancellation_requested",
  );
  assertEquals(
    (insertCalls[1].values as Record<string, unknown>).event_type,
    "account.cancellation_scheduled",
  );
  assertBusinessSubscriptionWasNotTerminallyCanceled(mock.calls);
});

Deno.test("account cancellation for non-Mercado Pago subscription with provider id schedules without provider call", async () => {
  const mock = createMockSupabase({
    subscription: baseSubscription({
      provider: "local",
      provider_subscription_id: "local-provider-subscription-1",
      mp_preapproval_id: null,
    }),
  });
  let fetchCalls = 0;
  const response = await createTestHandler(mock.client, {
    envGet: () => undefined,
    fetch: (() => {
      fetchCalls += 1;
      throw new Error(
        "Mercado Pago should not be called for non-Mercado Pago subscriptions",
      );
    }) as typeof fetch,
  })(
    createRequest({ business_id: "business-1", mode: "account_cancellation" }),
  );
  const body = await readJson(response);
  const insertCalls = mock.calls.filter((call) =>
    call.table === "subscription_events" && call.operation === "insert"
  );

  assertEquals(response.status, 200);
  assertEquals(
    (body.request as Record<string, unknown>).status,
    "scheduled_account_closure",
  );
  assertEquals(fetchCalls, 0);
  assertEquals(insertCalls.length, 2);
  assertEquals(
    (insertCalls[0].values as Record<string, unknown>).event_type,
    "account.cancellation_requested",
  );
  assertEquals(
    (insertCalls[1].values as Record<string, unknown>).event_type,
    "account.cancellation_scheduled",
  );
  assertBusinessSubscriptionWasNotTerminallyCanceled(mock.calls);
});

Deno.test("account cancellation without an active subscription fails without overclaiming scheduled closure", async () => {
  const mock = createMockSupabase({ noSubscription: true });
  const response = await createTestHandler(mock.client, {
    envGet: () => undefined,
    fetch: (() => {
      throw new Error(
        "Mercado Pago should not be called without a provider subscription id",
      );
    }) as typeof fetch,
  })(
    createRequest({ business_id: "business-1", mode: "account_cancellation" }),
  );
  const body = await readJson(response);
  const insertCall = mock.calls.find((call) =>
    call.table === "subscription_events" && call.operation === "insert"
  );

  assertEquals(response.status, 409);
  assertEquals(body.error, "ACCOUNT_CANCELLATION_NO_CLOSURE_CANDIDATE");
  assert(insertCall);
  assertEquals(
    (insertCall.values as Record<string, unknown>).subscription_id,
    null,
  );
  assertEquals(
    (insertCall.values as Record<string, unknown>).event_type,
    "account.cancellation_validation_failed",
  );
});

Deno.test("account cancellation without an active subscription ignores stale no-subscription scheduled events", async () => {
  const mock = createMockSupabase({
    noSubscription: true,
    existingEventsByProviderEventId: {
      "account-cancel-request:business-1:no-subscription:scheduled": {
        occurred_at: "2026-07-01T00:00:00.000Z",
      },
    },
  });
  const response = await createTestHandler(mock.client, {
    envGet: () => undefined,
    fetch: (() => {
      throw new Error(
        "Mercado Pago should not be called without a closure candidate",
      );
    }) as typeof fetch,
  })(
    createRequest({ business_id: "business-1", mode: "account_cancellation" }),
  );
  const body = await readJson(response);
  const insertCall = mock.calls.find((call) =>
    call.table === "subscription_events" && call.operation === "insert"
  );

  assertEquals(response.status, 409);
  assertEquals(body.error, "ACCOUNT_CANCELLATION_NO_CLOSURE_CANDIDATE");
  assert(insertCall);
  assertEquals(
    (insertCall.values as Record<string, unknown>).event_type,
    "account.cancellation_validation_failed",
  );
});

Deno.test("account cancellation fails deterministically on non-empty subscription lookup errors", async () => {
  const mock = createMockSupabase({
    subscriptionError: { code: "XX000", message: "database unavailable" },
  });
  let fetchCalls = 0;
  const response = await createTestHandler(mock.client, {
    envGet: (key) => key === "MP_ACCESS_TOKEN" ? "test-token" : undefined,
    fetch: (() => {
      fetchCalls += 1;
      return Promise.resolve(
        new Response(
          JSON.stringify({ id: "mp-subscription-1", status: "cancelled" }),
        ),
      );
    }) as typeof fetch,
  })(
    createRequest({ business_id: "business-1", mode: "account_cancellation" }),
  );
  const body = await readJson(response);

  assertEquals(response.status, 500);
  assertEquals(body.error, "SUBSCRIPTION_LOOKUP_FAILED");
  assertEquals(fetchCalls, 0);
  assertEquals(
    mock.calls.filter((call) =>
      call.table === "subscription_events" && call.operation === "insert"
    ),
    [],
  );
  assertBusinessSubscriptionStatusWasNotMutated(mock.calls);
});

Deno.test("account cancellation reports local state update failure only after requested and scheduled audits", async () => {
  const mock = createMockSupabase({
    updateError: { code: "XX000", message: "update failed" },
  });
  const response = await createTestHandler(mock.client)(
    createRequest({ business_id: "business-1", mode: "account_cancellation" }),
  );
  const body = await readJson(response);
  const insertCalls = mock.calls.filter((call) =>
    call.table === "subscription_events" && call.operation === "insert"
  );

  assertEquals(response.status, 500);
  assertEquals(body.error, "ACCOUNT_CANCELLATION_STATE_FAILED");
  assertEquals(insertCalls.length, 2);
  assertEquals(
    (insertCalls[0].values as Record<string, unknown>).event_type,
    "account.cancellation_requested",
  );
  assertEquals(
    (insertCalls[1].values as Record<string, unknown>).event_type,
    "account.cancellation_scheduled",
  );
  assertBusinessSubscriptionWasNotTerminallyCanceled(mock.calls);
});

Deno.test("account cancellation returns scheduled success when scheduled event already exists", async () => {
  const mock = createMockSupabase({
    existingEventsByProviderEventId: {
      "account-cancel-request:business-1:subscription-1:requested": {
        occurred_at: "2026-07-04T12:00:00.000Z",
      },
      "account-cancel-request:business-1:subscription-1:scheduled": {
        occurred_at: "2026-07-04T12:00:00.000Z",
      },
    },
  });
  const response = await createTestHandler(mock.client)(
    createRequest({ business_id: "business-1", mode: "account_cancellation" }),
  );
  const body = await readJson(response);

  assertEquals(response.status, 200);
  assertEquals(body.success, true);
  assertEquals(
    (body.request as Record<string, unknown>).status,
    "already_requested",
  );
  assertEquals(
    mock.calls.filter((call) =>
      call.table === "subscription_events" && call.operation === "insert"
    ),
    [],
  );
});

Deno.test("account cancellation fails closed when post-scheduled state update cannot be verified", async () => {
  const mock = createMockSupabase({
    persistedSubscriptionAfterUpdate: null,
  });
  const response = await createTestHandler(mock.client)(
    createRequest({ business_id: "business-1", mode: "account_cancellation" }),
  );
  const body = await readJson(response);
  const insertCalls = mock.calls.filter((call) =>
    call.table === "subscription_events" && call.operation === "insert"
  );

  assertEquals(response.status, 500);
  assertEquals(body.error, "ACCOUNT_CANCELLATION_STATE_FAILED");
  assertEquals(insertCalls.length, 2);
  assertBusinessSubscriptionWasNotTerminallyCanceled(mock.calls);
});

Deno.test("account cancellation returns deterministic schedule persistence error after requested audit", async () => {
  const mock = createMockSupabase({
    insertErrorsByProviderEventId: {
      "account-cancel-request:business-1:subscription-1:scheduled": {
        code: "XX000",
        message: "scheduled insert failed",
      },
    },
  });
  const response = await createTestHandler(mock.client)(
    createRequest({ business_id: "business-1", mode: "account_cancellation" }),
  );
  const body = await readJson(response);
  const insertCalls = mock.calls.filter((call) =>
    call.table === "subscription_events" && call.operation === "insert"
  );

  assertEquals(response.status, 500);
  assertEquals(body.error, "ACCOUNT_CANCELLATION_SCHEDULE_FAILED");
  assertEquals(insertCalls.length, 2);
  assertEquals(
    (insertCalls[0].values as Record<string, unknown>).event_type,
    "account.cancellation_requested",
  );
  assertEquals(
    (insertCalls[1].values as Record<string, unknown>).event_type,
    "account.cancellation_scheduled",
  );
  assertBusinessSubscriptionStatusWasNotMutated(mock.calls);
});

Deno.test("account cancellation later retry bucket schedules closure without provider call", async () => {
  const mock = createMockSupabase({
    existingEventsByProviderEventId: {
      "account-cancel-request:business-1:subscription-1:requested": {
        occurred_at: "2026-07-04T12:00:00.000Z",
      },
      "account-cancel-request:business-1:subscription-1:retry-started:2026-07-04T12:00":
        {
          occurred_at: "2026-07-04T12:00:00.000Z",
        },
    },
  });
  const response = await createTestHandler(mock.client, {
    now: () => new Date("2026-07-04T12:01:00.000Z"),
  })(
    createRequest({ business_id: "business-1", mode: "account_cancellation" }),
  );
  const body = await readJson(response);
  const insertCalls = mock.calls.filter((call) =>
    call.table === "subscription_events" && call.operation === "insert"
  );

  assertEquals(response.status, 200);
  assertEquals(
    (body.request as Record<string, unknown>).status,
    "scheduled_account_closure",
  );
  assertEquals(insertCalls.length, 1);
  assertEquals(
    (insertCalls[0].values as Record<string, unknown>).event_type,
    "account.cancellation_scheduled",
  );
  assertBusinessSubscriptionWasNotTerminallyCanceled(mock.calls);
});

Deno.test("cancel-subscription fails closed when cancellation event persistence fails", async () => {
  const mock = createMockSupabase({
    insertError: { code: "XX000", message: "insert failed" },
  });
  const response = await createTestHandler(mock.client)(createRequest());
  const body = await readJson(response);

  assertEquals(response.status, 500);
  assertEquals(body.error, "CANCELLATION_REQUEST_FAILED");
  assertEquals(body.success, undefined);
  assertEquals(body.request, undefined);
  assertBusinessSubscriptionStatusWasNotMutated(mock.calls);
});
