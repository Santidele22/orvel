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
  duplicateEvent?: { occurred_at: string } | null;
  insertError?: { code?: string; message?: string } | null;
  subscription?: Record<string, unknown>;
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

  class QueryBuilder {
    constructor(private readonly table: string) {}

    select() {
      calls.push({ table: this.table, operation: "select" });
      return this;
    }

    eq() {
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
      if (subscriptionEventsMaybeSingleCalls === 1) {
        return { data: scenario.existingEvent ?? null, error: null };
      }

      return { data: scenario.duplicateEvent ?? null, error: null };
    }

    async insert(values: unknown) {
      calls.push({ table: this.table, operation: "insert", values });
      return { data: null, error: scenario.insertError ?? null };
    }

    update(values: unknown) {
      calls.push({ table: this.table, operation: "update", values });
      throw new Error(`Unexpected update() for ${this.table}`);
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

function createTestHandler(client: unknown) {
  return createCancelSubscriptionHandler({
    createSupabaseAdminClient: () => client,
    getCorsHeaders: () => ({}),
    rejectDisallowedOrigin: () => null,
    isRateLimitedRequest: () => false,
    now: () => fixedNow,
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

Deno.test("cancel-subscription records authenticated owner manual cancellation requests", async () => {
  const mock = createMockSupabase();
  const response = await createTestHandler(mock.client)(
    createRequest({ business_id: "business-1", reason: "manual_request" }),
  );
  const body = await readJson(response);
  const insertCall = mock.calls.find((call) =>
    call.table === "subscription_events" && call.operation === "insert"
  );

  assertEquals(response.status, 200);
  assertEquals(body.success, true);
  assertEquals(
    (body.request as Record<string, unknown>).status,
    "manual_review",
  );
  assertStringIncludes(String(body.message), "procesar manualmente");
  assertEquals((body.subscription as Record<string, unknown>).status, "active");
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
  const insertCall = mock.calls.find((call) =>
    call.table === "subscription_events" && call.operation === "insert"
  );

  assertEquals(response.status, 200);
  assertEquals(body.success, true);
  assert(insertCall);
  assertEquals(
    (insertCall.values as Record<string, unknown>).provider_subscription_id,
    null,
  );
  assertEquals(
    (body.subscription as Record<string, unknown>).provider_subscription_id,
    null,
  );
  assertBusinessSubscriptionStatusWasNotMutated(mock.calls);
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
